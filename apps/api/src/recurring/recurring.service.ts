import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type {
  CreateRecurringSubtaskRequest,
  CreateRecurringTaskRequest,
  RecurringReportQuery,
  UpdateRecurringSubtaskRequest,
  UpdateRecurringTaskRequest,
} from "@app/types";
import type { Prisma } from "@prisma/client";
import { generateKeyBetween } from "@app/ordering";
import { computeMovePosition } from "../common/util/position.util";
import { previousMonthRange, startOfIsoWeek } from "../common/util/week.util";
import { PrismaService } from "../prisma/prisma.service";
import { BoardsService, serializeCard } from "../boards/boards.service";

type Tx = Prisma.TransactionClient;

type TaskWithSubtasks = Prisma.RecurringTaskGetPayload<{ include: { subtasks: true } }>;

@Injectable()
export class RecurringService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly boards: BoardsService,
  ) {}

  private async loadTask(taskId: string): Promise<TaskWithSubtasks> {
    const task = await this.prisma.recurringTask.findUnique({
      where: { id: taskId },
      include: { subtasks: { orderBy: { position: "asc" } } },
    });
    if (!task) throw new NotFoundException("Recurring task not found");
    return task;
  }

  private async loadSubtask(subtaskId: string) {
    const subtask = await this.prisma.recurringSubtask.findUnique({ where: { id: subtaskId } });
    if (!subtask) throw new NotFoundException("Recurring subtask not found");
    return subtask;
  }

  /** A target list must exist and belong to the same board as the template. */
  private async assertTargetListOnBoard(listId: string, boardId: string) {
    const list = await this.prisma.list.findUnique({ where: { id: listId } });
    if (!list || list.boardId !== boardId) {
      throw new BadRequestException("Target list does not belong to this board");
    }
    return list;
  }

  async listForBoard(userId: string, boardId: string) {
    await this.boards.assertMembership(userId, boardId);
    const tasks = await this.prisma.recurringTask.findMany({
      where: { boardId },
      orderBy: { position: "asc" },
      include: { subtasks: { orderBy: { position: "asc" } } },
    });
    return tasks.map(serializeRecurringTask);
  }

  async create(userId: string, boardId: string, input: CreateRecurringTaskRequest) {
    await this.boards.assertMembership(userId, boardId);
    await this.assertTargetListOnBoard(input.targetListId, boardId);

    const last = await this.prisma.recurringTask.findFirst({
      where: { boardId },
      orderBy: { position: "desc" },
      select: { position: true },
    });
    const position = generateKeyBetween(last?.position ?? null, null);

    const task = await this.prisma.$transaction(async (tx) => {
      const created = await tx.recurringTask.create({
        data: {
          boardId,
          targetListId: input.targetListId,
          title: input.title,
          description: input.description ?? null,
          cadence: input.cadence ?? "WEEKLY",
          position,
          createdById: userId,
        },
      });
      await this.seedSubtasks(tx, created.id, input.subtasks);
      return created;
    });

    return this.serializeTaskById(task.id);
  }

  /** Create the initial subtask rows with chained fractional positions. */
  private async seedSubtasks(tx: Tx, recurringTaskId: string, labels: string[]) {
    let prev: string | null = null;
    for (const label of labels) {
      const position = generateKeyBetween(prev, null);
      await tx.recurringSubtask.create({ data: { recurringTaskId, label, position } });
      prev = position;
    }
  }

  async update(userId: string, taskId: string, input: UpdateRecurringTaskRequest) {
    const task = await this.loadTask(taskId);
    await this.boards.assertMembership(userId, task.boardId);
    if (input.targetListId && input.targetListId !== task.targetListId) {
      await this.assertTargetListOnBoard(input.targetListId, task.boardId);
    }

    await this.prisma.recurringTask.update({
      where: { id: taskId },
      data: {
        title: input.title,
        description: input.description,
        targetListId: input.targetListId,
        isActive: input.isActive,
      },
    });
    return this.serializeTaskById(taskId);
  }

  async remove(userId: string, taskId: string) {
    const task = await this.loadTask(taskId);
    await this.boards.assertMembership(userId, task.boardId);
    // Cards spawned from this template keep their history; the FK is SET NULL.
    await this.prisma.recurringTask.delete({ where: { id: taskId } });
  }

  async addSubtask(userId: string, taskId: string, input: CreateRecurringSubtaskRequest) {
    const task = await this.loadTask(taskId);
    await this.boards.assertMembership(userId, task.boardId);

    const last = await this.prisma.recurringSubtask.findFirst({
      where: { recurringTaskId: taskId },
      orderBy: { position: "desc" },
      select: { position: true },
    });
    const position = generateKeyBetween(last?.position ?? null, null);
    await this.prisma.recurringSubtask.create({
      data: { recurringTaskId: taskId, label: input.label, position },
    });
    return this.serializeTaskById(taskId);
  }

  async updateSubtask(userId: string, subtaskId: string, input: UpdateRecurringSubtaskRequest) {
    const subtask = await this.loadSubtask(subtaskId);
    const task = await this.loadTask(subtask.recurringTaskId);
    await this.boards.assertMembership(userId, task.boardId);

    let position: string | undefined;
    if (input.move) {
      position = await computeMovePosition(input.move.beforeId, input.move.afterId, async (id) => {
        const neighbor = await this.prisma.recurringSubtask.findUnique({
          where: { id },
          select: { position: true, recurringTaskId: true },
        });
        return neighbor && neighbor.recurringTaskId === subtask.recurringTaskId ? neighbor.position : null;
      });
    }
    await this.prisma.recurringSubtask.update({
      where: { id: subtaskId },
      data: { label: input.label, position },
    });
    return this.serializeTaskById(task.id);
  }

  async removeSubtask(userId: string, subtaskId: string) {
    const subtask = await this.loadSubtask(subtaskId);
    const task = await this.loadTask(subtask.recurringTaskId);
    await this.boards.assertMembership(userId, task.boardId);
    await this.prisma.recurringSubtask.delete({ where: { id: subtaskId } });
    return this.serializeTaskById(task.id);
  }

  /**
   * Create this week's occurrence Card for a template, seeding a checklist
   * item from each subtask. Idempotent: a second call in the same week returns
   * the existing card (guaranteed by the unique [recurringTaskId,
   * occurrenceStart] constraint) rather than duplicating it.
   */
  async generate(userId: string, taskId: string) {
    const task = await this.loadTask(taskId);
    await this.boards.assertMembership(userId, task.boardId);
    const targetList = await this.assertTargetListOnBoard(task.targetListId, task.boardId);
    const occurrenceStart = startOfIsoWeek(new Date());

    const cardId = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.card.findUnique({
        where: { recurringTaskId_occurrenceStart: { recurringTaskId: task.id, occurrenceStart } },
        select: { id: true },
      });
      if (existing) return existing.id;

      const last = await tx.card.findFirst({
        where: { listId: task.targetListId, isArchived: false },
        orderBy: { position: "desc" },
        select: { position: true },
      });
      const position = generateKeyBetween(last?.position ?? null, null);

      const card = await tx.card.create({
        data: {
          listId: task.targetListId,
          boardId: task.boardId,
          title: task.title,
          description: task.description,
          position,
          createdById: userId,
          recurringTaskId: task.id,
          occurrenceStart,
          checklist: {
            create: task.subtasks.map((s) => ({
              recurringSubtaskId: s.id,
              label: s.label,
              position: s.position,
            })),
          },
        },
      });
      await tx.cardActivity.create({
        data: { cardId: card.id, boardId: task.boardId, actorId: userId, type: "CREATED", toValue: targetList.name },
      });
      return card.id;
    });

    const card = await this.prisma.card.findUniqueOrThrow({
      where: { id: cardId },
      include: { checklist: { orderBy: { position: "asc" } } },
    });
    return serializeCard(card);
  }

  /**
   * Completion report over a date window (defaults to the previous calendar
   * month). For every template on the board it returns a grid: subtask rows ×
   * occurrence (week) columns, each cell recording whether that subtask was
   * completed in that occurrence — directly answering "was X done every week?".
   */
  async report(userId: string, boardId: string, query: RecurringReportQuery) {
    await this.boards.assertMembership(userId, boardId);

    const fallback = previousMonthRange(new Date());
    const from = query.from ? new Date(query.from) : fallback.from;
    const to = query.to ? new Date(query.to) : fallback.to;

    const tasks = await this.prisma.recurringTask.findMany({
      where: { boardId },
      orderBy: { position: "asc" },
      include: { subtasks: { orderBy: { position: "asc" } } },
    });

    const cards = await this.prisma.card.findMany({
      where: {
        boardId,
        recurringTaskId: { in: tasks.map((t) => t.id) },
        occurrenceStart: { gte: from, lt: to },
      },
      orderBy: { occurrenceStart: "asc" },
      include: { checklist: true },
    });

    const cardsByTask = new Map<string, typeof cards>();
    for (const card of cards) {
      const key = card.recurringTaskId!;
      const bucket = cardsByTask.get(key) ?? [];
      bucket.push(card);
      cardsByTask.set(key, bucket);
    }

    const reportTasks = tasks.map((task) => {
      const occurrenceCards = cardsByTask.get(task.id) ?? [];
      const occurrences = occurrenceCards.map((c) => ({
        cardId: c.id,
        occurrenceStart: c.occurrenceStart!.toISOString(),
      }));

      const subtasks = task.subtasks.map((subtask) => {
        const cells = occurrenceCards.map((card) => {
          const item = card.checklist.find((ci) => ci.recurringSubtaskId === subtask.id);
          return {
            occurrenceStart: card.occurrenceStart!.toISOString(),
            isCompleted: item?.isCompleted ?? false,
            completedAt: item?.completedAt ? item.completedAt.toISOString() : null,
          };
        });
        return {
          recurringSubtaskId: subtask.id,
          label: subtask.label,
          completedCount: cells.filter((c) => c.isCompleted).length,
          totalCount: cells.length,
          cells,
        };
      });

      return { recurringTaskId: task.id, title: task.title, occurrences, subtasks };
    });

    return { from: from.toISOString(), to: to.toISOString(), tasks: reportTasks };
  }

  private async serializeTaskById(taskId: string) {
    const task = await this.loadTask(taskId);
    return serializeRecurringTask(task);
  }
}

function serializeRecurringTask(task: TaskWithSubtasks) {
  return {
    id: task.id,
    boardId: task.boardId,
    targetListId: task.targetListId,
    title: task.title,
    description: task.description,
    cadence: task.cadence,
    isActive: task.isActive,
    position: task.position,
    createdAt: task.createdAt.toISOString(),
    updatedAt: task.updatedAt.toISOString(),
    subtasks: task.subtasks.map((s) => ({
      id: s.id,
      recurringTaskId: s.recurringTaskId,
      label: s.label,
      position: s.position,
    })),
  };
}
