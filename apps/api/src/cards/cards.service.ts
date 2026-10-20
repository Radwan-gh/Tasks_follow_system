import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import {
  RecurrenceRuleSchema,
  describeRecurrence,
  type CardActivityType,
  type CardBoardRef,
  type CardBoardsResponse,
  type CreateCardRequest,
  type SetCardBoardsRequest,
  type UpdateAssigneesRequest,
  type UpdateCardAccessRequest,
  type UpdateCardRequest,
} from "@app/types";
import { Prisma, type CardPriority } from "@prisma/client";
import { computeMovePosition } from "../common/util/position.util";
import { isCompleted } from "../common/util/completed.util";
import { nextUpcomingRecurrenceDate } from "../common/util/recurrence.util";
import { calendarDate } from "../common/util/time-zone.util";
import { PrismaService } from "../prisma/prisma.service";
import {
  BoardsService,
  CARD_INSTANCES_INCLUDE,
  canManageCard,
  serializeCard,
  type AccessibleCard,
} from "../boards/boards.service";
import { NotificationsService } from "../notifications/notifications.service";
import {
  BOARD_LINKS_INCLUDE,
  cardIdsInList,
  columnForNewBoard,
  endOfList,
  listForStatus,
  placementsOf,
  positionInList,
  type Placement,
} from "./card-placement.util";

/** Prisma transaction client — the subset of PrismaService usable inside `$transaction`. */
type Tx = Prisma.TransactionClient;

/** What every card response is read with, so `serializeCard` has all it needs. */
const CARD_RESPONSE_INCLUDE = {
  members: { select: { userId: true } },
  assignees: { select: { userId: true } },
  boardLinks: BOARD_LINKS_INCLUDE,
  ...CARD_INSTANCES_INCLUDE,
} as const satisfies Prisma.CardInclude;

/**
 * A due date as `DUE_DATE_CHANGED` records it (`CardActivitySchema`): the full
 * timestamp when the time of day matters, otherwise just the users' calendar day.
 */
function dueDateValue(dueDate: Date | null, hasTime: boolean): string | null {
  if (!dueDate) return null;
  return hasTime ? dueDate.toISOString() : calendarDate(dueDate);
}

interface ActivityInput {
  type: CardActivityType;
  fromValue?: string | null;
  toValue?: string | null;
}

@Injectable()
export class CardsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly boards: BoardsService,
    private readonly notifications: NotificationsService,
  ) {}

  private async loadList(listId: string) {
    const list = await this.prisma.list.findUnique({ where: { id: listId } });
    if (!list) throw new NotFoundException("List not found");
    return list;
  }

  /**
   * `design-prompt-group-3.md` §3 "توليد المهمة المتكررة": spawns the next
   * instance of a repeating card into the board's «جديد» list. Runs at the
   * first of three triggers — the current instance moved into «تم التنفيذ»
   * (DONE) or «انتهى» (CLOSED) (`update`), or its due date passing
   * (`RecurrenceJobsService`) — and only once per instance: the new one points
   * back at it through the unique `previousInstanceId`, so a later trigger
   * finds it already linked and does nothing (and a racing one fails on the
   * unique index, rolling its transaction back). Every instance carries its
   * series' first card id (`recurrenceSeriesId`) and its cycle number
   * (`recurrenceIndex`), which reports group and order a repeating task by.
   *
   * The due date is the next cycle that is still ahead
   * (`nextUpcomingRecurrenceDate`): cycles missed while the previous instance
   * sat overdue are skipped, not spawned as a backlog.
   *
   * Carries forward title, description, priority, assignees, and the same
   * recurrence rule. Also carried: whether the due date has a time of day (the
   * time itself is kept by `nextRecurrenceDate`), the checklist — same titles,
   * order and assignees, all unticked, since a weekly task's checklist is
   * usually the task itself — the access restriction, so a private task never
   * comes back visible to the whole board, and the other boards it is on, where
   * the next instance starts in each board's «جديد» too.
   * The spawned instance is a *new* task, so assignees deactivated since the
   * previous one was assigned are dropped rather than carried over.
   * Cost is deliberately not carried: each instance's spend is its own
   * (docs/05-boards-lists-cards.md).
   * The carried-over assignees are notified (`ASSIGNED` / `SUBTASK_ASSIGNED`)
   * as if newly assigned — it is a new task on their plate — except whoever
   * finished the previous instance (`actorId`), via `notify`'s own guard; the
   * due-date job passes the system actor `""`, so nobody is skipped there.
   *
   * Returns the new instance, or null when none was spawned (no valid rule, no
   * «جديد» list on the home board, or already spawned).
   */
  async spawnNextRecurrence(tx: Tx, card: AccessibleCard, actorId: string, now = new Date()) {
    const rule = RecurrenceRuleSchema.safeParse(card.recurrence);
    if (!rule.success) return null;

    // Re-read inside the transaction rather than trusting `card.nextInstance`,
    // which may have been loaded before another trigger spawned it.
    const existing = await tx.card.findUnique({ where: { previousInstanceId: card.id }, select: { id: true } });
    if (existing) return null;

    const newList = await listForStatus(tx, card.boardId, "NEW");
    if (!newList) return null;

    const nextDueDate = nextUpcomingRecurrenceDate(rule.data, card.dueDate ?? now, card.dueDateHasTime, now);

    // A card that started repeating before series existed becomes its series' first card.
    const seriesId = card.recurrenceSeriesId ?? card.id;
    const index = card.recurrenceIndex ?? 1;
    if (!card.recurrenceSeriesId) {
      await tx.card.update({ where: { id: card.id }, data: { recurrenceSeriesId: seriesId, recurrenceIndex: index } });
    }

    const created = await tx.card.create({
      data: {
        listId: newList.id,
        boardId: card.boardId,
        title: card.title,
        description: card.description,
        dueDate: nextDueDate,
        // Without a previous due date the next one is "now + period", whose time is arbitrary.
        dueDateHasTime: card.dueDate ? card.dueDateHasTime : false,
        priority: card.priority,
        recurrence: card.recurrence as Prisma.InputJsonValue,
        isRestricted: card.isRestricted,
        createdById: card.createdById,
        position: await endOfList(tx, newList.id),
        previousInstanceId: card.id,
        recurrenceSeriesId: seriesId,
        recurrenceIndex: index + 1,
      },
    });

    const boardIds = [card.boardId];
    for (const link of card.boardLinks) {
      const column = await listForStatus(tx, link.boardId, "NEW");
      if (!column) continue;
      await tx.cardBoardLink.create({
        data: { cardId: created.id, boardId: link.boardId, listId: column.id, position: await endOfList(tx, column.id) },
      });
      boardIds.push(link.boardId);
    }

    const subtasks = await tx.subtask.findMany({
      where: { cardId: card.id },
      orderBy: { position: "asc" },
      include: { assignees: { select: { userId: true } } },
    });
    const assigneeIds = [...card.assignees, ...subtasks.flatMap((st) => st.assignees)].map((a) => a.userId);
    const active = new Set(
      assigneeIds.length > 0
        ? (
            await tx.user.findMany({
              where: { id: { in: [...new Set(assigneeIds)] }, isActive: true },
              select: { id: true },
            })
          ).map((u) => u.id)
        : [],
    );

    const cardAssignees = card.assignees.filter((a) => active.has(a.userId));
    if (cardAssignees.length > 0) {
      await tx.cardAssignee.createMany({
        data: cardAssignees.map((a) => ({ cardId: created.id, userId: a.userId })),
      });
      for (const a of cardAssignees) {
        await this.notifications.notify(tx, {
          userId: a.userId,
          actorId,
          type: "ASSIGNED",
          cardId: created.id,
          boardId: card.boardId,
          boardIds,
          payload: { cardTitle: created.title },
        });
      }
    }
    if (card.isRestricted && card.members.length > 0) {
      await tx.cardMember.createMany({
        data: card.members.map((m) => ({ cardId: created.id, userId: m.userId })),
      });
    }
    for (const subtask of subtasks) {
      // Positions are only ever compared within one card, so the old keys keep their order as-is.
      const copy = await tx.subtask.create({
        data: { cardId: created.id, title: subtask.title, position: subtask.position, createdById: subtask.createdById },
      });
      const subtaskAssignees = subtask.assignees.filter((a) => active.has(a.userId));
      if (subtaskAssignees.length > 0) {
        await tx.subtaskAssignee.createMany({
          data: subtaskAssignees.map((a) => ({ subtaskId: copy.id, userId: a.userId })),
        });
        for (const a of subtaskAssignees) {
          await this.notifications.notify(tx, {
            userId: a.userId,
            actorId,
            type: "SUBTASK_ASSIGNED",
            cardId: created.id,
            boardId: card.boardId,
            boardIds,
            payload: { cardTitle: created.title, subtaskTitle: copy.title },
          });
        }
      }
    }
    await this.recordActivity(tx, created.id, card.boardId, card.createdById, {
      type: "CREATED",
      toValue: newList.name,
    });
    return created;
  }

  async create(userId: string, listId: string, input: CreateCardRequest) {
    const list = await this.loadList(listId);
    await this.boards.assertMembership(userId, list.boardId);
    await this.boards.assertBoardMutable(list.boardId);

    // After every card in the column — including tasks shared onto this board.
    const position = await endOfList(this.prisma, listId);
    const card = await this.prisma.$transaction(async (tx) => {
      const created = await tx.card.create({
        data: {
          listId,
          boardId: list.boardId,
          title: input.title,
          description: input.description ?? null,
          dueDate: input.dueDate ? new Date(input.dueDate) : null,
          dueDateHasTime: input.dueDateHasTime ?? false,
          priority: input.priority,
          costAmount: input.costAmount ?? undefined,
          costNote: input.costNote ?? null,
          recurrence: input.recurrence ?? undefined,
          position,
          createdById: userId,
        },
      });
      // First history entry: who added the card and its initial status (list).
      await this.recordActivity(tx, created.id, created.boardId, userId, {
        type: "CREATED",
        toValue: list.name,
      });
      // A repeating task starts its own series, as its first cycle.
      if (input.recurrence) {
        return tx.card.update({
          where: { id: created.id },
          data: { recurrenceSeriesId: created.id, recurrenceIndex: 1 },
        });
      }
      return created;
    });
    return serializeCard({ ...card, boardLinks: [], previousInstance: null, nextInstance: null });
  }

  async getDetail(userId: string, cardId: string) {
    // A restricted card the caller may not see is a 404; a supervisor sees every card.
    const { card } = await this.boards.assertCardAccess(userId, cardId, "VIEWER");
    return serializeCard(card);
  }

  /**
   * Field edits, and moves. A task can sit on several boards with one shared
   * status (docs/18-multi-board-tasks.md), so `targetListId` may name a column
   * on any of them: the task takes that column on that board, and on each of
   * its other boards moves to the column with the same `statusCategory`, at
   * its end — all in one transaction. With no `targetListId` (or the home
   * list), it is the home placement that moves.
   */
  async update(userId: string, cardId: string, input: UpdateCardRequest) {
    const access = await this.boards.assertCardAccess(userId, cardId, "MEMBER", { mutable: true });
    const { card } = access;
    const placements = placementsOf(card);

    let moved: Placement = placements[0];
    let targetList: Awaited<ReturnType<typeof this.loadList>> | null = null;
    if (input.targetListId && input.targetListId !== card.listId) {
      const list = await this.loadList(input.targetListId);
      const onBoard = placements.find((p) => p.boardId === list.boardId);
      if (!onBoard) throw new BadRequestException("Cannot move a card to a list on a board it is not on");
      moved = onBoard;
      targetList = list;
    }
    const targetListId = targetList?.id ?? moved.listId;
    const changesStatus = targetListId !== moved.listId;
    const isAssignee = card.assignees.some((a) => a.userId === userId);
    const closesIt = changesStatus && targetList?.statusCategory === "CLOSED";
    // Into «تم التنفيذ» or «انتهى» — finishing this instance of a repeating task.
    const finishesIt = changesStatus && isCompleted(targetList?.statusCategory ?? null);

    // Moving the card — changing its status — is open to every member who can
    // open it; any other field is one of the task's details, which only its
    // owner edits. Checked by exclusion, so a field added to the request later
    // is owner-only by default.
    const editsDetails = Object.entries(input).some(
      ([key, value]) => value !== undefined && key !== "targetListId" && key !== "move",
    );
    if (editsDetails) this.boards.assertCanManageCard(userId, access);
    // §3b-4 "تعديل لقرار سابق": moving *into* «انتهى» (CLOSED) is restricted
    // to a board owner and this card's own assignees — even the creator
    // closes it only if they are also assigned.
    if (closesIt && !access.ownerIds.includes(userId) && !isAssignee) {
      throw new ForbiddenException('Only the board owner or this task\'s assignees can move it to "انتهى"');
    }
    if (input.move) {
      const neighborIds = [input.move.beforeId, input.move.afterId].filter((id): id is string => Boolean(id));
      if (neighborIds.length > 0) {
        const inColumn = await cardIdsInList(this.prisma, neighborIds, targetListId);
        if (neighborIds.includes(cardId) || neighborIds.some((id) => !inColumn.has(id))) {
          throw new BadRequestException("Invalid move target");
        }
      }
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      // Where the task goes on the board it was moved on…
      const placed = new Map<Placement, { listId: string; position: string }>();
      if (input.move) {
        const position = await computeMovePosition(input.move.beforeId, input.move.afterId, (id) =>
          positionInList(tx, id, targetListId),
        );
        placed.set(moved, { listId: targetListId, position });
      } else if (changesStatus) {
        // Moved to a different list with no explicit neighbors given: append to the end.
        placed.set(moved, { listId: targetListId, position: await endOfList(tx, targetListId) });
      }
      // …and on each of its other boards, the column with the same status.
      if (changesStatus) {
        for (const placement of placements) {
          if (placement === moved) continue;
          const column = await listForStatus(tx, placement.boardId, targetList!.statusCategory);
          if (!column || column.id === placement.listId) continue;
          placed.set(placement, { listId: column.id, position: await endOfList(tx, column.id) });
        }
      }
      for (const [placement, to] of placed) {
        if (placement.linkId) await tx.cardBoardLink.update({ where: { id: placement.linkId }, data: to });
      }
      const home = placed.get(placements[0]);

      const result = await tx.card.update({
        where: { id: cardId },
        data: {
          title: input.title,
          description: input.description,
          dueDate: input.dueDate === undefined ? undefined : input.dueDate ? new Date(input.dueDate) : null,
          dueDateHasTime: input.dueDateHasTime,
          isArchived: input.isArchived,
          priority: input.priority,
          costAmount: input.costAmount === undefined ? undefined : input.costAmount,
          costNote: input.costNote,
          recurrence: input.recurrence === undefined ? undefined : (input.recurrence ?? Prisma.JsonNull),
          // Starting to repeat makes this card its series' first cycle. Removing
          // the rule later keeps the series fields, as the record of what it was.
          ...(input.recurrence && !card.recurrenceSeriesId && { recurrenceSeriesId: cardId, recurrenceIndex: 1 }),
          listId: home?.listId,
          position: home?.position,
        },
        include: CARD_RESPONSE_INCLUDE,
      });

      const move = changesStatus ? { fromListId: moved.listId, toListId: targetListId } : null;
      for (const activity of await this.diffActivities(tx, card, input, move)) {
        await this.recordActivity(tx, cardId, moved.boardId, userId, activity);
      }

      // Moving into «انتهى»: notify the creator (design-prompt-group-3.md's
      // "نقل بطاقة أنشأتها إلى انتهى").
      if (closesIt) {
        await this.notifications.notify(tx, {
          userId: card.createdById,
          actorId: userId,
          type: "CARD_CLOSED",
          cardId,
          boardId: card.boardId,
          boardIds: access.boardIds,
          payload: { cardTitle: result.title },
        });
      }

      // Finishing a repeating task — into «تم التنفيذ» or «انتهى» — spawns its
      // next instance in the board's «جديد» list, unless an earlier trigger
      // already did (§3 "توليد المهمة المتكررة"). From the card as just saved,
      // and read back so the response links the new instance.
      if (finishesIt && result.recurrence) {
        const spawned = await this.spawnNextRecurrence(tx, result, userId);
        if (spawned) return tx.card.findUniqueOrThrow({ where: { id: cardId }, include: CARD_RESPONSE_INCLUDE });
      }

      return result;
    });

    return serializeCard(updated);
  }

  /** Replace a card's access config. Manageable only by the task's owner. */
  async updateAccess(userId: string, cardId: string, input: UpdateCardAccessRequest) {
    const access = await this.boards.assertCardAccess(userId, cardId, "MEMBER", { mutable: true });
    const { card } = access;
    if (!canManageCard(userId, access.ownerIds, card)) {
      throw new ForbiddenException("Only the board owner or the task creator can change task access");
    }

    const memberUserIds = input.isRestricted ? [...new Set(input.memberUserIds)] : [];
    if (memberUserIds.length > 0) {
      // Every listed user must currently be a member of one of the task's boards.
      const people = await this.boards.cardPeople(access.boardIds, memberUserIds);
      if (people.length !== memberUserIds.length) {
        throw new BadRequestException("Every task member must be a member of one of the task's boards");
      }
      // Same rule as `updateAssignees`: a deactivated account gets no new
      // grant, but one deactivated after being granted access keeps it.
      const before = new Set(card.members.map((m) => m.userId));
      if (people.some((m) => !m.user.isActive && !before.has(m.userId))) {
        throw new BadRequestException("Cannot grant task access to a deactivated user");
      }
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.cardMember.deleteMany({ where: { cardId } });
      if (memberUserIds.length > 0) {
        await tx.cardMember.createMany({ data: memberUserIds.map((id) => ({ cardId, userId: id })) });
      }
      return tx.card.update({
        where: { id: cardId },
        data: { isRestricted: input.isRestricted },
        include: CARD_RESPONSE_INCLUDE,
      });
    });

    return serializeCard(updated);
  }

  /**
   * Replace a card's assignee set (several people allowed). Only the task's
   * owner may (re)assign it. Every listed user must be a member — not just a
   * viewer — of one of the task's boards, and every *newly* added one must be
   * an active account. Records an ASSIGNED/UNASSIGNED activity — with a
   * snapshot of the new assignees' names — only when the set actually changes.
   */
  async updateAssignees(userId: string, cardId: string, input: UpdateAssigneesRequest) {
    const access = await this.boards.assertCardAccess(userId, cardId, "MEMBER", { mutable: true });
    const { card } = access;
    if (!canManageCard(userId, access.ownerIds, card)) {
      throw new ForbiddenException("Only the board owner or the task creator can assign this task");
    }

    const userIds = [...new Set(input.userIds)];
    // §3c-4 "منتقي المسؤولين لا يعرض المشاهدين": a VIEWER is a board member
    // but never a valid assignee, so dropping viewers here is what makes
    // assigning one fail the same length check as a non-member. Someone who
    // views one of the task's boards but is a member of another counts by the
    // higher role (`cardPeople`).
    const assignable = userIds.length
      ? (await this.boards.cardPeople(access.boardIds, userIds)).filter((m) => m.role !== "VIEWER")
      : [];
    if (assignable.length !== userIds.length) {
      throw new BadRequestException("Every assignee must be a member of one of the task's boards");
    }

    const before = new Set(card.assignees.map((a) => a.userId));
    // A deactivated account takes no new work. Someone deactivated *after*
    // being assigned stays on the card — dropping them silently would rewrite
    // who owned the task — so only additions are checked.
    if (assignable.some((m) => !m.user.isActive && !before.has(m.userId))) {
      throw new BadRequestException("Cannot assign a deactivated user");
    }

    const changed = before.size !== userIds.length || userIds.some((id) => !before.has(id));

    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.cardAssignee.deleteMany({ where: { cardId } });
      if (userIds.length > 0) {
        await tx.cardAssignee.createMany({ data: userIds.map((id) => ({ cardId, userId: id })) });
      }
      if (changed) {
        await this.recordActivity(
          tx,
          cardId,
          card.boardId,
          userId,
          userIds.length > 0
            ? { type: "ASSIGNED", toValue: assignable.map((m) => m.user.displayName).join("، ") }
            : { type: "UNASSIGNED" },
        );
        // Only the newly-added assignees, not everyone still on the card —
        // being re-saved with the same assignee list shouldn't re-notify them.
        for (const addedUserId of userIds.filter((id) => !before.has(id))) {
          await this.notifications.notify(tx, {
            userId: addedUserId,
            actorId: userId,
            type: "ASSIGNED",
            cardId,
            boardId: card.boardId,
            boardIds: access.boardIds,
            payload: { cardTitle: card.title },
          });
        }
      }
      return tx.card.findUniqueOrThrow({ where: { id: cardId }, include: CARD_RESPONSE_INCLUDE });
    });

    return serializeCard(updated);
  }

  /**
   * Who may change a task's boards, and through which boards: the task owner
   * (`canManageCard`, through a live board they can write on) or any ADMIN,
   * member or not. `writable` is the caller's live boards where they are a
   * member, not a viewer — the only ones a non-admin can add the task to or
   * take it off.
   */
  private async boardsAccess(userId: string, cardId: string) {
    const access = await this.boards.assertCardAccess(userId, cardId, "VIEWER");
    const [isAdmin, memberships] = await Promise.all([
      this.boards.isActiveAdmin(userId),
      this.prisma.boardMember.findMany({
        where: { userId, role: { not: "VIEWER" }, board: { isArchived: false } },
        select: { board: { select: { id: true, name: true, isArchived: true, updatedAt: true } } },
      }),
    ]);
    const writable = new Map(memberships.map((m) => [m.board.id, m.board]));
    const canChange =
      isAdmin ||
      (!access.supervised &&
        canManageCard(userId, access.ownerIds, access.card) &&
        access.boardIds.some((id) => writable.has(id)));
    return { access, isAdmin, writable, canChange };
  }

  /**
   * The «اللوحات» field on the task screen (docs/18-multi-board-tasks.md): the
   * boards the task is on and whether the caller may change them — readable by
   * anyone who can open the task. Fetched on every opening, so it stays cheap:
   * the boards it could join are `boardOptions`, read only when asked for.
   */
  async getBoards(userId: string, cardId: string): Promise<CardBoardsResponse> {
    const { access, isAdmin, writable, canChange } = await this.boardsAccess(userId, cardId);
    const onBoards = await this.prisma.board.findMany({
      where: { id: { in: access.boardIds } },
      select: { id: true, name: true, isArchived: true },
    });
    const order = new Map(access.boardIds.map((id, i) => [id, i]));
    const boards = onBoards
      .sort((a, b) => order.get(a.id)! - order.get(b.id)!)
      .map((board) => ({
        ...board,
        canRemove: canChange && !board.isArchived && (isAdmin || writable.has(board.id)),
      }));
    return { boards, canChange };
  }

  /**
   * The add-board popup: every board the caller could add the task to — their
   * own live boards, or every live board for an admin — minus the ones it is
   * already on, the boards they used most recently first. "Used" is their own
   * latest activity on the board (creating, moving or editing a task, from
   * `CardActivity`, indexed on `actorId, boardId`); boards they have not
   * touched follow, most recently updated first. Only for whoever may change
   * the task's boards.
   */
  async boardOptions(userId: string, cardId: string): Promise<CardBoardRef[]> {
    const { access, isAdmin, writable, canChange } = await this.boardsAccess(userId, cardId);
    if (!canChange) throw new ForbiddenException("Only the task's owner or an admin can change its boards");

    const onTask = new Set(access.boardIds);
    const candidates = (
      isAdmin
        ? await this.prisma.board.findMany({
            where: { isArchived: false },
            select: { id: true, name: true, isArchived: true, updatedAt: true },
          })
        : [...writable.values()]
    ).filter((board) => !onTask.has(board.id));
    if (candidates.length === 0) return [];

    const used = await this.prisma.cardActivity.groupBy({
      by: ["boardId"],
      where: { actorId: userId, boardId: { in: candidates.map((b) => b.id) } },
      _max: { createdAt: true },
    });
    const lastUsed = new Map(used.map((row) => [row.boardId, row._max.createdAt?.getTime() ?? 0]));
    return candidates
      .sort(
        (a, b) =>
          (lastUsed.get(b.id) ?? 0) - (lastUsed.get(a.id) ?? 0) || b.updatedAt.getTime() - a.updatedAt.getTime(),
      )
      .map(({ id, name, isArchived }) => ({ id, name, isArchived }));
  }

  /**
   * Full replace of the boards a task is on — see `getBoards` for who may.
   * An added board shows the task in its column with the task's status (else
   * its «جديد», else its first column), at the end. Dropping the home board
   * makes the first board in the request home. The caller must stay a member
   * of at least one of the resulting boards, or they would lose the task they
   * just edited (an admin can always reach it). Records a `BOARDS_CHANGED`
   * activity with the board names before and after.
   */
  async setBoards(userId: string, cardId: string, input: SetCardBoardsRequest): Promise<CardBoardsResponse> {
    const isAdmin = await this.boards.isActiveAdmin(userId);
    const access = await this.boards.assertCardAccess(userId, cardId, isAdmin ? "VIEWER" : "MEMBER", {
      mutable: !isAdmin,
    });
    if (!isAdmin) this.boards.assertCanManageCard(userId, access);
    const { card } = access;

    const wanted = [...new Set(input.boardIds)];
    const current = access.boardIds;
    const added = wanted.filter((id) => !current.includes(id));
    const removed = current.filter((id) => !wanted.includes(id));
    if (added.length === 0 && removed.length === 0) return this.getBoards(userId, cardId);

    const touched = [...added, ...removed];
    const [boards, memberships, homeList] = await Promise.all([
      this.prisma.board.findMany({
        where: { id: { in: [...current, ...added] } },
        select: {
          id: true,
          name: true,
          isArchived: true,
          lists: {
            where: { isArchived: false },
            orderBy: { position: "asc" },
            select: { id: true, statusCategory: true },
          },
        },
      }),
      this.prisma.boardMember.findMany({
        where: { userId, boardId: { in: [...current, ...added] } },
        select: { boardId: true, role: true },
      }),
      this.prisma.list.findUnique({ where: { id: card.listId }, select: { statusCategory: true } }),
    ]);
    const byId = new Map(boards.map((b) => [b.id, b]));
    const roleOn = new Map(memberships.map((m) => [m.boardId, m.role]));
    for (const id of touched) {
      const board = byId.get(id);
      if (!board) throw new NotFoundException("Board not found");
      if (board.isArchived) {
        throw new BadRequestException("An archived board is read-only — a task cannot be added to or removed from it");
      }
      if (!isAdmin && (roleOn.get(id) ?? "VIEWER") === "VIEWER") {
        throw new ForbiddenException("You can only add a task to, or remove it from, boards you are a member of");
      }
    }
    if (!isAdmin && !wanted.some((id) => roleOn.has(id))) {
      throw new BadRequestException("Keep the task on at least one board you are a member of");
    }
    const columns = new Map<string, string>();
    for (const id of added) {
      const column = columnForNewBoard(byId.get(id)!.lists, homeList?.statusCategory ?? null);
      if (!column) throw new BadRequestException(`«${byId.get(id)!.name}» has no lists to show the task in`);
      columns.set(id, column.id);
    }

    // Home first, then the kept links oldest first, then the new ones.
    let result = [...current.filter((id) => !removed.includes(id)), ...added];
    const newHome = removed.includes(card.boardId) ? wanted[0] : card.boardId;
    result = [newHome, ...result.filter((id) => id !== newHome)];
    const names = (ids: string[]) => ids.map((id) => byId.get(id)!.name).join("، ");

    await this.prisma.$transaction(async (tx) => {
      for (const id of added) {
        const listId = columns.get(id)!;
        await tx.cardBoardLink.create({
          data: { cardId, boardId: id, listId, position: await endOfList(tx, listId) },
        });
      }
      const droppedLinks = card.boardLinks.filter((l) => removed.includes(l.boardId)).map((l) => l.id);
      if (droppedLinks.length > 0) await tx.cardBoardLink.deleteMany({ where: { id: { in: droppedLinks } } });
      if (newHome !== card.boardId) {
        // The new home's link becomes the card's own placement.
        const link = await tx.cardBoardLink.findUniqueOrThrow({
          where: { cardId_boardId: { cardId, boardId: newHome } },
        });
        await tx.cardBoardLink.delete({ where: { id: link.id } });
        await tx.card.update({
          where: { id: cardId },
          data: { boardId: link.boardId, listId: link.listId, position: link.position },
        });
      }
      await this.recordActivity(tx, cardId, newHome, userId, {
        type: "BOARDS_CHANGED",
        fromValue: names(current),
        toValue: names(result),
      });
    });

    return this.getBoards(userId, cardId);
  }

  /**
   * Everyone on any of the task's boards, with their highest role there — the
   * pool its assignee and access pickers offer (docs/18-multi-board-tasks.md).
   */
  async people(userId: string, cardId: string) {
    const access = await this.boards.assertCardAccess(userId, cardId, "VIEWER");
    return this.boards.cardPeople(access.boardIds);
  }

  /**
   * Diff the incoming update against the card's current state and return the
   * history events it produces. A change of list is the card's "status change",
   * named by the lists on the board it was moved on. Called inside the update
   * transaction so history and the mutation commit atomically. Field-level
   * diffs only fire when a value is actually provided *and* different, so a
   * no-op PATCH records nothing.
   */
  private async diffActivities(
    tx: Tx,
    card: {
      title: string;
      description: string | null;
      dueDate: Date | null;
      dueDateHasTime: boolean;
      isArchived: boolean;
      costAmount: Prisma.Decimal | null;
      priority: CardPriority;
      recurrence: Prisma.JsonValue;
    },
    input: UpdateCardRequest,
    move: { fromListId: string; toListId: string } | null,
  ): Promise<ActivityInput[]> {
    const activities: ActivityInput[] = [];

    if (move) {
      const [fromList, toList] = await Promise.all([
        tx.list.findUnique({ where: { id: move.fromListId }, select: { name: true } }),
        tx.list.findUnique({ where: { id: move.toListId }, select: { name: true } }),
      ]);
      activities.push({ type: "MOVED", fromValue: fromList?.name ?? null, toValue: toList?.name ?? null });
    }

    if (input.title !== undefined && input.title !== card.title) {
      activities.push({ type: "RENAMED", fromValue: card.title, toValue: input.title });
    }

    if (input.description !== undefined && (input.description ?? null) !== card.description) {
      // Descriptions can be long; record only that it changed, not the full text.
      activities.push({ type: "DESCRIPTION_UPDATED" });
    }

    if (input.dueDate !== undefined || input.dueDateHasTime !== undefined) {
      // Compared as displayed: switching the time on or off is a change, while a
      // date-only due date that moves within the same day is not.
      const prevDue = dueDateValue(card.dueDate, card.dueDateHasTime);
      const nextDue = dueDateValue(
        input.dueDate === undefined ? card.dueDate : input.dueDate ? new Date(input.dueDate) : null,
        input.dueDateHasTime ?? card.dueDateHasTime,
      );
      if (nextDue !== prevDue) {
        activities.push({ type: "DUE_DATE_CHANGED", fromValue: prevDue, toValue: nextDue });
      }
    }

    if (input.priority !== undefined && input.priority !== card.priority) {
      activities.push({ type: "PRIORITY_CHANGED", fromValue: card.priority, toValue: input.priority });
    }

    if (input.recurrence !== undefined) {
      // Snapshotted as the Arabic summary, the way a move snapshots list names.
      // Comparing summaries also makes reordered weekdays a no-op.
      const prev = RecurrenceRuleSchema.safeParse(card.recurrence);
      const prevRule = prev.success ? describeRecurrence(prev.data) : null;
      const nextRule = input.recurrence ? describeRecurrence(input.recurrence) : null;
      if (nextRule !== prevRule) {
        activities.push({ type: "RECURRENCE_CHANGED", fromValue: prevRule, toValue: nextRule });
      }
    }

    if (input.isArchived !== undefined && input.isArchived !== card.isArchived) {
      activities.push({ type: input.isArchived ? "ARCHIVED" : "UNARCHIVED" });
    }

    if (input.costAmount !== undefined) {
      const prevCost = card.costAmount ? card.costAmount.toString() : null;
      if (input.costAmount !== prevCost) {
        activities.push({ type: "COST_UPDATED", fromValue: prevCost, toValue: input.costAmount });
      }
    }

    return activities;
  }

  private recordActivity(
    tx: Tx,
    cardId: string,
    boardId: string,
    actorId: string,
    activity: ActivityInput,
  ) {
    return tx.cardActivity.create({
      data: {
        cardId,
        boardId,
        actorId,
        type: activity.type,
        fromValue: activity.fromValue ?? null,
        toValue: activity.toValue ?? null,
      },
    });
  }

  async getHistory(userId: string, cardId: string) {
    await this.boards.assertCardAccess(userId, cardId, "VIEWER");

    const activities = await this.prisma.cardActivity.findMany({
      where: { cardId },
      orderBy: { createdAt: "asc" },
      include: { actor: { select: { id: true, username: true, displayName: true } } },
    });
    return activities.map(serializeCardActivity);
  }

  async remove(userId: string, cardId: string) {
    const access = await this.boards.assertCardAccess(userId, cardId);
    if (!canManageCard(userId, access.ownerIds, access.card)) {
      throw new ForbiddenException("Only the board owner or the task creator can delete this task");
    }
    await this.prisma.card.delete({ where: { id: cardId } });
  }
}

function serializeCardActivity(activity: {
  id: string;
  cardId: string;
  type: CardActivityType;
  fromValue: string | null;
  toValue: string | null;
  createdAt: Date;
  actor: { id: string; username: string; displayName: string };
}) {
  return {
    id: activity.id,
    cardId: activity.cardId,
    type: activity.type,
    fromValue: activity.fromValue,
    toValue: activity.toValue,
    createdAt: activity.createdAt.toISOString(),
    actor: activity.actor,
  };
}
