import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  PayloadTooLargeException,
} from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import type { Attachment } from "@app/types";
import { PrismaService } from "../prisma/prisma.service";
import { BoardsService, canAccessCard, canManageCard } from "../boards/boards.service";
import { AttachmentStorageService } from "../common/storage/attachment-storage.service";
import { buildStoredFilename, displayNameFromStored } from "../common/util/uploads.util";

/** Any file type may be attached (originally images only, `design-prompt-group-3.md` §3) — the caps below still apply. */
export const MAX_ATTACHMENTS_PER_CARD = 10;
export const MAX_ATTACHMENT_BYTES = 30 * 1024 * 1024;

/** How long a staged upload (`stage`) waits to be attached before it is purged. */
export const PENDING_UPLOAD_TTL_MS = 60 * 60 * 1000;
/** Staged-but-unattached files one user may hold at once, so upload links can't fill the bucket. */
export const MAX_PENDING_UPLOADS_PER_USER = 10;

type UploadedFile = { originalname: string; mimetype: string; size: number; buffer: Buffer };

/** A staged upload as `POST /mcp-uploads/:token` returns it. */
export interface StagedUpload {
  uploadId: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  expiresAt: string;
}

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
  private readonly logger = new Logger(AttachmentsService.name);

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

  /**
   * Who may add a file to a card: the task's owner (board owner or creator) —
   * attachments are part of the task's details — on a live board, under the
   * per-card cap.
   */
  private async assertCanAttach(userId: string, cardId: string) {
    const card = await this.loadCard(cardId);
    await this.boards.assertMembership(userId, card.boardId);
    const ownerId = await this.boardOwnerId(card.boardId);
    if (!canAccessCard(userId, ownerId, card)) throw new NotFoundException("Card not found");
    if (!canManageCard(userId, ownerId, card)) {
      throw new ForbiddenException("Only the board owner or the task creator can attach files to this task");
    }
    await this.boards.assertBoardMutable(card.boardId);

    const count = await this.prisma.attachment.count({ where: { cardId } });
    if (count >= MAX_ATTACHMENTS_PER_CARD) {
      throw new BadRequestException(`Cards can have at most ${MAX_ATTACHMENTS_PER_CARD} attachments`);
    }
  }

  /** `file` is still in memory — it is only written to storage once access and the count cap pass. */
  async create(userId: string, cardId: string, file: UploadedFile): Promise<Attachment> {
    await this.assertCanAttach(userId, cardId);

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

  /**
   * First half of attaching a file over MCP (docs/15-mcp-server.md): store the
   * bytes now, attach them later with `attachStaged`. Not tied to a card yet,
   * so the only checks here are the uploader's own cap on unclaimed files and
   * the size limit multer already enforced.
   */
  async stage(userId: string, file: UploadedFile): Promise<StagedUpload> {
    if (file.size === 0) throw new BadRequestException("The file is empty");
    const pending = await this.prisma.pendingUpload.count({ where: { userId, expiresAt: { gt: new Date() } } });
    if (pending >= MAX_PENDING_UPLOADS_PER_USER) {
      throw new BadRequestException(
        `At most ${MAX_PENDING_UPLOADS_PER_USER} uploads can wait to be attached — attach them, or wait an hour for them to expire`,
      );
    }

    const filename = buildStoredFilename(file.originalname);
    await this.storage.put(filename, file.buffer, file.mimetype);
    try {
      const row = await this.prisma.pendingUpload.create({
        data: {
          userId,
          filename,
          mimeType: file.mimetype,
          sizeBytes: file.size,
          expiresAt: new Date(Date.now() + PENDING_UPLOAD_TTL_MS),
        },
      });
      return {
        uploadId: row.id,
        fileName: displayNameFromStored(row.filename),
        mimeType: row.mimeType,
        sizeBytes: row.sizeBytes,
        expiresAt: row.expiresAt.toISOString(),
      };
    } catch (err) {
      await this.storage.remove(filename);
      throw err;
    }
  }

  /**
   * Second half: turn the caller's own staged upload into an attachment, under
   * the same rules as `create`. The storage object is reused as-is (its key is
   * the stored filename), so nothing is copied. Single use: the pending row is
   * claimed with a conditional delete, so two concurrent calls can't both win.
   */
  async attachStaged(userId: string, cardId: string, uploadId: string): Promise<Attachment> {
    await this.assertCanAttach(userId, cardId);
    const created = await this.prisma.$transaction(async (tx) => {
      const pending = await tx.pendingUpload.findFirst({
        where: { id: uploadId, userId, expiresAt: { gt: new Date() } },
      });
      if (!pending) throw new NotFoundException("Upload not found or expired — upload the file again");
      const claimed = await tx.pendingUpload.deleteMany({ where: { id: pending.id } });
      if (claimed.count !== 1) throw new NotFoundException("Upload was already attached");
      return tx.attachment.create({
        data: {
          cardId,
          uploaderId: userId,
          filename: pending.filename,
          mimeType: pending.mimeType,
          sizeBytes: pending.sizeBytes,
        },
        include: { uploader: { select: { id: true, username: true, displayName: true } } },
      });
    });
    return serialize(created);
  }

  /** Deletes staged uploads nobody attached in time, with their storage objects. */
  @Cron(CronExpression.EVERY_HOUR)
  async purgeExpiredUploads(): Promise<void> {
    const expired = await this.prisma.pendingUpload.findMany({
      where: { expiresAt: { lte: new Date() } },
      select: { id: true, filename: true },
    });
    let purged = 0;
    for (const upload of expired) {
      // Claimed by `attachStaged` in the meantime? Then the object is an attachment's now.
      const { count } = await this.prisma.pendingUpload.deleteMany({ where: { id: upload.id, expiresAt: { lte: new Date() } } });
      if (count === 0) continue;
      await this.storage.remove(upload.filename);
      purged++;
    }
    if (purged > 0) this.logger.log(`Purged ${purged} expired upload(s)`);
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
