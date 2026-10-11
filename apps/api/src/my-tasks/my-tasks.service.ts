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
  list: { select: { name: true, board: { select: { name: true, ownerId: true } } } },
  members: { select: { userId: true } },
  boardLinks: {
    orderBy: { createdAt: "asc" },
    select: { boardId: true, list: { select: { name: true } }, board: { select: { name: true, ownerId: true } } },
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
    ? { boardId: link.boardId, boardName: link.board.name, listName: link.list.name }
    : { boardId: task.boardId, boardName: task.list.board.name, listName: task.list.name };
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
   * user only ever sees their own assignments. Excludes archived cards and
   * anything in a completed (`DONE`/`CLOSED`) list; a restricted card the
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

    const items: MyTaskItem[] = [];

    for (const { card } of cardAssignments) {
      if (!canAccessCard(userId, ownerIdsOf(card), card)) continue;
      items.push({
        kind: "CARD",
        id: card.id,
        title: card.title,
        parentCardTitle: null,
        cardId: card.id,
        ...boardFor(card, memberOf),
        dueDate: card.dueDate ? card.dueDate.toISOString() : null,
        priority: card.priority,
      });
    }

    for (const { subtask } of subtaskAssignments) {
      const card = subtask.card;
      if (!canAccessCard(userId, ownerIdsOf(card), card)) continue;
      items.push({
        kind: "SUBTASK",
        id: subtask.id,
        title: subtask.title,
        parentCardTitle: card.title,
        cardId: card.id,
        ...boardFor(card, memberOf),
        dueDate: null,
        priority: card.priority,
      });
    }

    return { generatedAt: new Date().toISOString(), items };
  }
}
