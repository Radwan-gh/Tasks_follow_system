import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { promises as fs } from "node:fs";
import * as path from "node:path";
import type { Attachment } from "@app/types";
import { PrismaService } from "../prisma/prisma.service";
import { BoardsService, canAccessCard, canManageCard } from "../boards/boards.service";
import { UPLOADS_DIR } from "../common/util/uploads.util";

/** `design-prompt-group-3.md` §3: "صور فقط · حتى 10 صور للبطاقة · 5MB للصورة". */
export const MAX_ATTACHMENTS_PER_CARD = 10;
export const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;
export const ALLOWED_ATTACHMENT_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

function serialize(row: {
  id: string;
  cardId: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: Date;
  uploader: { id: string; email: string; displayName: string };
}): Attachment {
  return {
    id: row.id,
    cardId: row.cardId,
    url: `/uploads/${row.filename}`,
    mimeType: row.mimeType,
    sizeBytes: row.sizeBytes,
    createdAt: row.createdAt.toISOString(),
    uploader: row.uploader,
  };
}

@Injectable()
export class AttachmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly boards: BoardsService,
  ) {}

  private async loadCard(cardId: string) {
    const card = await this.prisma.card.findUnique({
      where: { id: cardId },
      include: { members: { select: { userId: true } }, assignees: { select: { userId: true } } },
    });
    if (!card) throw new NotFoundException("Card not found");
    return card;
  }

  private async boardOwnerId(boardId: string): Promise<string> {
    const board = await this.prisma.board.findUnique({ where: { id: boardId }, select: { ownerId: true } });
    if (!board) throw new NotFoundException("Board not found");
    return board.ownerId;
  }

  async list(userId: string, cardId: string): Promise<Attachment[]> {
    const card = await this.loadCard(cardId);
    await this.boards.assertMembership(userId, card.boardId);
    const ownerId = await this.boardOwnerId(card.boardId);
    if (!canAccessCard(userId, ownerId, card)) throw new NotFoundException("Card not found");

    const rows = await this.prisma.attachment.findMany({
      where: { cardId },
      orderBy: { createdAt: "asc" },
      include: { uploader: { select: { id: true, email: true, displayName: true } } },
    });
    return rows.map(serialize);
  }

  /** `file` has already been written to `UPLOADS_DIR` by multer — this just validates the count cap and records the row. */
  async create(
    userId: string,
    cardId: string,
    file: { filename: string; mimetype: string; size: number },
  ): Promise<Attachment> {
    const card = await this.loadCard(cardId);
    await this.boards.assertMembership(userId, card.boardId);
    const ownerId = await this.boardOwnerId(card.boardId);
    if (!canAccessCard(userId, ownerId, card)) {
      await this.deleteFile(file.filename);
      throw new NotFoundException("Card not found");
    }

    const count = await this.prisma.attachment.count({ where: { cardId } });
    if (count >= MAX_ATTACHMENTS_PER_CARD) {
      await this.deleteFile(file.filename);
      throw new BadRequestException(`Cards can have at most ${MAX_ATTACHMENTS_PER_CARD} attachments`);
    }

    const created = await this.prisma.attachment.create({
      data: {
        cardId,
        uploaderId: userId,
        filename: file.filename,
        mimeType: file.mimetype,
        sizeBytes: file.size,
      },
      include: { uploader: { select: { id: true, email: true, displayName: true } } },
    });
    return serialize(created);
  }

  async remove(userId: string, cardId: string, attachmentId: string): Promise<void> {
    const attachment = await this.prisma.attachment.findUnique({ where: { id: attachmentId } });
    if (!attachment || attachment.cardId !== cardId) throw new NotFoundException("Attachment not found");

    const card = await this.loadCard(cardId);
    const ownerId = await this.boardOwnerId(card.boardId);
    const canDelete = attachment.uploaderId === userId || canManageCard(userId, ownerId, card);
    if (!canDelete) throw new ForbiddenException("Only the uploader or the task's manager can delete this attachment");

    await this.prisma.attachment.delete({ where: { id: attachmentId } });
    await this.deleteFile(attachment.filename);
  }

  private async deleteFile(filename: string): Promise<void> {
    await fs.unlink(path.join(UPLOADS_DIR, filename)).catch(() => undefined);
  }
}
