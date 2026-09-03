import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import type { CreateTemplateRequest, Template, UpdateTemplateRequest } from "@app/types";
import { PrismaService } from "../prisma/prisma.service";
import { BoardsService } from "../boards/boards.service";

function serialize(row: {
  id: string;
  boardId: string;
  name: string;
  titlePattern: string;
  description: string | null;
  subtaskTitles: string[];
  createdAt: Date;
}): Template {
  return {
    id: row.id,
    boardId: row.boardId,
    name: row.name,
    titlePattern: row.titlePattern,
    description: row.description,
    subtaskTitles: row.subtaskTitles,
    createdAt: row.createdAt.toISOString(),
  };
}

/**
 * Board-level task templates (`design-prompt-group-3.md` §3c-3): picking one
 * on the add-task screen prefills title/description/subtasks. Managed by the
 * board owner only — `BoardsService.assertMembership(..., "OWNER")` guards
 * every mutation; any board member (down to `VIEWER`... but viewers can't
 * reach the add-task screen anyway) can list them.
 */
@Injectable()
export class TemplatesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly boards: BoardsService,
  ) {}

  async list(userId: string, boardId: string): Promise<Template[]> {
    await this.boards.assertMembership(userId, boardId, "VIEWER");
    const rows = await this.prisma.template.findMany({ where: { boardId }, orderBy: { createdAt: "asc" } });
    return rows.map(serialize);
  }

  async create(userId: string, boardId: string, input: CreateTemplateRequest): Promise<Template> {
    await this.boards.assertMembership(userId, boardId, "OWNER");
    await this.boards.assertBoardMutable(boardId);
    const row = await this.prisma.template.create({
      data: {
        boardId,
        name: input.name,
        titlePattern: input.titlePattern,
        description: input.description ?? null,
        subtaskTitles: input.subtaskTitles ?? [],
      },
    });
    return serialize(row);
  }

  /** Card detail's «حفظ كقالب» — the server reads the card's current title/description/subtasks, the client only names it. */
  async saveFromCard(userId: string, cardId: string, name: string): Promise<Template> {
    const card = await this.prisma.card.findUnique({
      where: { id: cardId },
      include: { subtasks: { orderBy: { position: "asc" } } },
    });
    if (!card) throw new NotFoundException("Card not found");
    await this.boards.assertMembership(userId, card.boardId, "OWNER");
    await this.boards.assertBoardMutable(card.boardId);

    const row = await this.prisma.template.create({
      data: {
        boardId: card.boardId,
        name,
        titlePattern: card.title,
        description: card.description,
        subtaskTitles: card.subtasks.map((s) => s.title),
      },
    });
    return serialize(row);
  }

  async update(userId: string, boardId: string, templateId: string, input: UpdateTemplateRequest): Promise<Template> {
    await this.boards.assertMembership(userId, boardId, "OWNER");
    const existing = await this.prisma.template.findUnique({ where: { id: templateId } });
    if (!existing || existing.boardId !== boardId) throw new NotFoundException("Template not found");

    const row = await this.prisma.template.update({ where: { id: templateId }, data: { name: input.name } });
    return serialize(row);
  }

  async remove(userId: string, boardId: string, templateId: string): Promise<void> {
    await this.boards.assertMembership(userId, boardId, "OWNER");
    const existing = await this.prisma.template.findUnique({ where: { id: templateId } });
    if (!existing || existing.boardId !== boardId) throw new NotFoundException("Template not found");
    await this.prisma.template.delete({ where: { id: templateId } });
  }
}
