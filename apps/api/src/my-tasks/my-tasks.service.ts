import { Injectable } from "@nestjs/common";
import type { MyTaskItem, MyTasksResponse } from "@app/types";
import { PrismaService } from "../prisma/prisma.service";
import { canAccessCard } from "../boards/boards.service";
import { COMPLETED_CATEGORIES } from "../common/util/completed.util";

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
    const [cardAssignments, subtaskAssignments] = await Promise.all([
      this.prisma.cardAssignee.findMany({
        where: {
          userId,
          card: {
            isArchived: false,
            list: { statusCategory: { notIn: COMPLETED_CATEGORIES } },
          },
        },
        select: {
          card: {
            select: {
              id: true,
              title: true,
              dueDate: true,
              boardId: true,
              createdById: true,
              isRestricted: true,
              priority: true,
              list: { select: { name: true, board: { select: { name: true, ownerId: true } } } },
              members: { select: { userId: true } },
            },
          },
        },
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
              card: {
                select: {
                  id: true,
                  title: true,
                  boardId: true,
                  createdById: true,
                  isRestricted: true,
                  priority: true,
                  list: { select: { name: true, board: { select: { name: true, ownerId: true } } } },
                  members: { select: { userId: true } },
                },
              },
            },
          },
        },
      }),
    ]);

    const items: MyTaskItem[] = [];

    for (const { card } of cardAssignments) {
      if (!canAccessCard(userId, card.list.board.ownerId, card)) continue;
      items.push({
        kind: "CARD",
        id: card.id,
        title: card.title,
        parentCardTitle: null,
        cardId: card.id,
        boardId: card.boardId,
        boardName: card.list.board.name,
        listName: card.list.name,
        dueDate: card.dueDate ? card.dueDate.toISOString() : null,
        priority: card.priority,
      });
    }

    for (const { subtask } of subtaskAssignments) {
      const card = subtask.card;
      if (!canAccessCard(userId, card.list.board.ownerId, card)) continue;
      items.push({
        kind: "SUBTASK",
        id: subtask.id,
        title: subtask.title,
        parentCardTitle: card.title,
        cardId: card.id,
        boardId: card.boardId,
        boardName: card.list.board.name,
        listName: card.list.name,
        dueDate: null,
        priority: card.priority,
      });
    }

    return { generatedAt: new Date().toISOString(), items };
  }
}
