import { Injectable } from "@nestjs/common";
import type { MyTaskItem, MyTasksResponse } from "@app/types";
import type { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { canAccessCard } from "../boards/boards.service";
import { COMPLETED_CATEGORIES } from "../common/util/completed.util";

/** What a «مهامي» row needs of its task, on each board the task is on. */
const TASK_SELECT = {
  id: true,
  title: true,
  dueDate: true,
  boardId: true,
  createdById: true,
  isRestricted: true,
  priority: true,
  listId: true,
  list: { select: { name: true, statusCategory: true, board: { select: { name: true, ownerId: true } } } },
  members: { select: { userId: true } },
  subtasks: { select: { isDone: true } },
  boardLinks: {
    orderBy: { createdAt: "asc" },
    select: {
      boardId: true,
      listId: true,
      list: { select: { name: true, statusCategory: true } },
      board: { select: { name: true, ownerId: true } },
    },
  },
} as const satisfies Prisma.CardSelect;
type Task = Prisma.CardGetPayload<{ select: typeof TASK_SELECT }>;

/**
 * Where a task is listed for this user: its home board when they are on it,
 * otherwise the first of its other boards they are on — so opening it lands
 * on a board they can see (docs/18-multi-board-tasks.md).
 */
function boardFor(task: Task, memberOf: Set<string>) {
  const link = memberOf.has(task.boardId) ? undefined : task.boardLinks.find((l) => memberOf.has(l.boardId));
  return link
    ? {
        boardId: link.boardId,
        boardName: link.board.name,
        listId: link.listId,
        listName: link.list.name,
        statusCategory: link.list.statusCategory,
      }
    : {
        boardId: task.boardId,
        boardName: task.list.board.name,
        listId: task.listId,
        listName: task.list.name,
        statusCategory: task.list.statusCategory,
      };
}

/**
 * The list after each list on its board, in board order (unarchived lists by
 * `position`, as `BoardsService.getDetail` shows them) — where a row's ←
 * arrow moves its task. A board's last list maps to nothing.
 */
async function nextListIds(prisma: PrismaService, boardIds: string[]): Promise<Map<string, string>> {
  const lists = await prisma.list.findMany({
    where: { boardId: { in: boardIds }, isArchived: false },
    orderBy: [{ boardId: "asc" }, { position: "asc" }],
    select: { id: true, boardId: true },
  });
  const next = new Map<string, string>();
  for (let i = 0; i + 1 < lists.length; i++) {
    if (lists[i]!.boardId === lists[i + 1]!.boardId) next.set(lists[i]!.id, lists[i + 1]!.id);
  }
  return next;
}

/** The owners of every board the task is on — each one counts for `canAccessCard`. */
function ownerIdsOf(task: Task): string[] {
  return [task.list.board.ownerId, ...task.boardLinks.map((l) => l.board.ownerId)];
}

@Injectable()
export class MyTasksService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Everything assigned to `userId` — as a card or as a subtask — across
   * every board they're a member of. Not a report: no ADMIN gate, and every
   * user only ever sees their own assignments. Excludes archived cards,
   * anything in a completed (`DONE`/`CLOSED`) list and ticked subtasks; a restricted card the
   * user can't actually open (per `canAccessCard`) is dropped even if they
   * were assigned before access was tightened.
   */
  async list(userId: string): Promise<MyTasksResponse> {
    const [cardAssignments, subtaskAssignments, memberships] = await Promise.all([
      this.prisma.cardAssignee.findMany({
        where: {
          userId,
          card: {
            isArchived: false,
            list: { statusCategory: { notIn: COMPLETED_CATEGORIES } },
          },
        },
        select: { card: { select: TASK_SELECT } },
      }),
      this.prisma.subtaskAssignee.findMany({
        where: {
          userId,
          subtask: {
            isDone: false,
            card: {
              isArchived: false,
              list: { statusCategory: { notIn: COMPLETED_CATEGORIES } },
            },
          },
        },
        select: {
          subtask: {
            select: {
              id: true,
              title: true,
              card: { select: TASK_SELECT },
            },
          },
        },
      }),
      this.prisma.boardMember.findMany({ where: { userId }, select: { boardId: true } }),
    ]);
    const memberOf = new Set(memberships.map((m) => m.boardId));

    const cards = cardAssignments.map(({ card }) => card).filter((card) => canAccessCard(userId, ownerIdsOf(card), card));
    const subtasks = subtaskAssignments
      .map(({ subtask }) => subtask)
      .filter((subtask) => canAccessCard(userId, ownerIdsOf(subtask.card), subtask.card));
    const placed = [...cards, ...subtasks.map((s) => s.card)].map((card) => boardFor(card, memberOf));
    const nextOf = await nextListIds(this.prisma, [...new Set(placed.map((p) => p.boardId))]);

    const items: MyTaskItem[] = [];

    for (const card of cards) {
      const placement = boardFor(card, memberOf);
      items.push({
        kind: "CARD",
        id: card.id,
        title: card.title,
        parentCardTitle: null,
        cardId: card.id,
        ...placement,
        nextListId: nextOf.get(placement.listId) ?? null,
        dueDate: card.dueDate ? card.dueDate.toISOString() : null,
        subtaskDone: card.subtasks.filter((s) => s.isDone).length,
        subtaskTotal: card.subtasks.length,
        priority: card.priority,
      });
    }

    for (const subtask of subtasks) {
      const card = subtask.card;
      const placement = boardFor(card, memberOf);
      items.push({
        kind: "SUBTASK",
        id: subtask.id,
        title: subtask.title,
        parentCardTitle: card.title,
        cardId: card.id,
        ...placement,
        nextListId: nextOf.get(placement.listId) ?? null,
        // The parent card's: a subtask is due when its card is.
        dueDate: card.dueDate ? card.dueDate.toISOString() : null,
        subtaskDone: 0,
        subtaskTotal: 0,
        priority: card.priority,
      });
    }

    return { generatedAt: new Date().toISOString(), items };
  }
}
