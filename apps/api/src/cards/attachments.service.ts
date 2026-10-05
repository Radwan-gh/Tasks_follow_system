import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  PayloadTooLargeException,
} from "@nestjs/common";
import type { Attachment } from "@app/types";
import { PrismaService } from "../prisma/prisma.service";
import { BoardsService, canAccessCard, canManageCard } from "../boards/boards.service";
import { AttachmentStorageService } from "../common/storage/attachment-storage.service";
import { buildStoredFilename, displayNameFromStored } from "../common/util/uploads.util";

/** Any file type may be attached (originally images only, `design-prompt-group-3.md` §3) — the caps below still apply. */
export const MAX_ATTACHMENTS_PER_CARD = 10;
export const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024;

function serialize(row: {
  id: string;
  cardId: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: Date;
  uploader: { id: string; username: string; displayName: string };
}): Attachment {
  return {
    id: row.id,
    cardId: row.cardId,
    url: `/uploads/${encodeURIComponent(row.filename)}`,
    fileName: displayNameFromStored(row.filename),
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
    private readonly storage: AttachmentStorageService,
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

  /** Whoever can open the card can see its attachments — a viewer, or a supervisor on any card. */
  private async assertCanRead(userId: string, cardId: string) {
    const card = await this.loadCard(cardId);
    const access = await this.boards.assertMembership(userId, card.boardId, "VIEWER");
    const ownerId = await this.boardOwnerId(card.boardId);
    if (!access.supervised && !canAccessCard(userId, ownerId, card)) throw new NotFoundException("Card not found");
  }

  async list(userId: string, cardId: string): Promise<Attachment[]> {
    await this.assertCanRead(userId, cardId);
    const rows = await this.prisma.attachment.findMany({
      where: { cardId },
      orderBy: { createdAt: "asc" },
      include: { uploader: { select: { id: true, username: true, displayName: true } } },
    });
    return rows.map(serialize);
  }

  /**
   * One attachment with its bytes, for the MCP `read_attachment` tool — the
   * apps fetch `Attachment.url` instead. Files over `maxBytes` are refused
   * before anything is read from storage.
   */
  async read(
    userId: string,
    cardId: string,
    attachmentId: string,
    maxBytes: number,
  ): Promise<{ attachment: Attachment; data: Buffer }> {
    await this.assertCanRead(userId, cardId);
    const row = await this.prisma.attachment.findUnique({
      where: { id: attachmentId },
      include: { uploader: { select: { id: true, username: true, displayName: true } } },
    });
    if (!row || row.cardId !== cardId) throw new NotFoundException("Attachment not found");
    if (row.sizeBytes > maxBytes) {
      throw new PayloadTooLargeException(`Attachment is larger than ${Math.floor(maxBytes / (1024 * 1024))}MB`);
    }
    const data = await this.storage.read(row.filename);
    if (!data) throw new NotFoundException("Attachment file is missing from storage");
    return { attachment: serialize(row), data };
  }

  /** `file` is still in memory — it is only written to storage once access and the count cap pass. */
  async create(
    userId: string,
    cardId: string,
    file: { originalname: string; mimetype: string; size: number; buffer: Buffer },
  ): Promise<Attachment> {
    const card = await this.loadCard(cardId);
    await this.boards.assertMembership(userId, card.boardId);
    const ownerId = await this.boardOwnerId(card.boardId);
    if (!canAccessCard(userId, ownerId, card)) throw new NotFoundException("Card not found");
    await this.boards.assertBoardMutable(card.boardId);

    const count = await this.prisma.attachment.count({ where: { cardId } });
    if (count >= MAX_ATTACHMENTS_PER_CARD) {
      throw new BadRequestException(`Cards can have at most ${MAX_ATTACHMENTS_PER_CARD} attachments`);
    }

    const filename = buildStoredFilename(file.originalname);
    await this.storage.put(filename, file.buffer, file.mimetype);
    try {
      const created = await this.prisma.attachment.create({
        data: {
          cardId,
          uploaderId: userId,
          filename,
          mimeType: file.mimetype,
          sizeBytes: file.size,
        },
        include: { uploader: { select: { id: true, username: true, displayName: true } } },
      });
      return serialize(created);
    } catch (err) {
      await this.storage.remove(filename);
      throw err;
    }
  }

  async remove(userId: string, cardId: string, attachmentId: string): Promise<void> {
    const attachment = await this.prisma.attachment.findUnique({ where: { id: attachmentId } });
    if (!attachment || attachment.cardId !== cardId) throw new NotFoundException("Attachment not found");

    const card = await this.loadCard(cardId);
    // A former member's uploads are no longer theirs to delete; an archived board is read-only.
    await this.boards.assertMembership(userId, card.boardId);
    await this.boards.assertBoardMutable(card.boardId);
    const ownerId = await this.boardOwnerId(card.boardId);
    const canDelete = attachment.uploaderId === userId || canManageCard(userId, ownerId, card);
    if (!canDelete) throw new ForbiddenException("Only the uploader or the task's manager can delete this attachment");

    await this.prisma.attachment.delete({ where: { id: attachmentId } });
    await this.storage.remove(attachment.filename);
  }
}
