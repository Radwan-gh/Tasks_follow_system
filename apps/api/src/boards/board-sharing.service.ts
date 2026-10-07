import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type { BoardShareRequestStatus } from "@prisma/client";
import { isSimilarBoardName } from "@app/types";
import type { BoardShareRequest, CreateBoardShareRequest, SimilarBoard, SimilarBoardsQuery } from "@app/types";
import { NotificationsService } from "../notifications/notifications.service";
import { PrismaService } from "../prisma/prisma.service";
import { BoardsService } from "./boards.service";

const PERSON = { select: { id: true, username: true, displayName: true } } as const;

/** Enough similar boards to judge by; a name matching more than this is too generic to help. */
const MAX_SIMILAR = 20;
/** The approver queue is short-lived work, not an archive — newest decisions beyond this aren't listed. */
const MAX_REQUESTS = 100;

interface Candidate {
  id: string;
  name: string;
  description: string | null;
  kind: "PERSONAL" | "SHARED";
  owner: { id: string; username: string; displayName: string };
  _count: { members: number };
}

/**
 * Share requests for boards (`docs/18-board-sharing.md`): a personal board's
 * owner asks for it to become shared, and an approver — an ADMIN or a user
 * granted `canApproveBoards` — approves it or rejects it with a reason, having
 * compared it against existing boards with a similar name. Board access still
 * goes through `BoardsService.assertMembership`; this service adds only the
 * approver check, which is system-level like oversight's.
 */
@Injectable()
export class BoardSharingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly boards: BoardsService,
    private readonly notifications: NotificationsService,
  ) {}

  private async assertApprover(userId: string) {
    if (!(await this.boards.isApprover(userId))) {
      throw new ForbiddenException("Permission to approve shared boards required");
    }
  }

  /**
   * Boards that are, or are about to be, shared and whose name resembles
   * `name`. Open to every user: it is what lets someone find the board they
   * meant to create and ask its owner to join, instead of making a duplicate.
   * Personal boards appear only while their own share request is pending.
   */
  async similar(query: SimilarBoardsQuery): Promise<SimilarBoard[]> {
    const candidates = await this.candidates(query.excludeBoardId);
    return matching(candidates, query.name);
  }

  /**
   * The owner asks for a personal board to become shared, including again
   * after a rejection. An approver asking for their own board skips the queue.
   * The board keeps working as a personal one while the request waits.
   */
  async request(userId: string, input: CreateBoardShareRequest) {
    await this.boards.assertMembership(userId, input.boardId, "OWNER");
    await this.boards.assertBoardMutable(input.boardId);
    const board = await this.prisma.board.findUnique({
      where: { id: input.boardId },
      select: { id: true, name: true, description: true, kind: true },
    });
    if (!board) throw new NotFoundException("Board not found");
    if (board.kind === "SHARED") throw new ConflictException("This board is already shared");
    const pending = await this.prisma.boardShareRequest.findFirst({
      where: { boardId: board.id, status: "PENDING" },
      select: { id: true },
    });
    if (pending) throw new ConflictException("A share request for this board is already waiting");

    const description = input.description ?? board.description?.trim();
    if (!description) throw new BadRequestException("A shared board needs a description of its scope");
    const approver = await this.boards.isApprover(userId);

    await this.prisma.$transaction(async (tx) => {
      await tx.board.update({
        where: { id: board.id },
        data: { description, ...(approver ? { kind: "SHARED" as const } : {}) },
      });
      if (!approver) await this.boards.fileShareRequest(tx, board, userId);
    });
    return this.boards.summaryOf(board.id);
  }

  /** The approver queue (or past decisions), each request with the boards it might duplicate. */
  async list(userId: string, status: BoardShareRequestStatus): Promise<BoardShareRequest[]> {
    await this.assertApprover(userId);
    const rows = await this.prisma.boardShareRequest.findMany({
      where: { status },
      // Pending: oldest first, as a queue. Decided: most recent first.
      orderBy: { createdAt: status === "PENDING" ? "asc" : "desc" },
      take: MAX_REQUESTS,
      include: {
        board: { select: { id: true, name: true, description: true } },
        requestedBy: PERSON,
        decidedBy: PERSON,
      },
    });
    const candidates = await this.candidates();
    return rows.map((row) => ({
      id: row.id,
      status: row.status,
      reason: row.reason,
      createdAt: row.createdAt.toISOString(),
      decidedAt: row.decidedAt ? row.decidedAt.toISOString() : null,
      board: row.board,
      requestedBy: row.requestedBy,
      decidedBy: row.decidedBy,
      similarBoards: matching(
        candidates.filter((c) => c.id !== row.board.id),
        row.board.name,
      ),
    }));
  }

  /** The board turns shared, and its owner can now add members. */
  async approve(userId: string, requestId: string): Promise<void> {
    await this.decide(userId, requestId, "APPROVED", null);
  }

  /** The board stays personal; the reason goes to its owner. */
  async reject(userId: string, requestId: string, reason: string): Promise<void> {
    await this.decide(userId, requestId, "REJECTED", reason);
  }

  private async decide(userId: string, requestId: string, status: "APPROVED" | "REJECTED", reason: string | null) {
    await this.assertApprover(userId);
    await this.prisma.$transaction(async (tx) => {
      const request = await tx.boardShareRequest.findUnique({
        where: { id: requestId },
        include: { board: { select: { id: true, name: true } } },
      });
      if (!request) throw new NotFoundException("Share request not found");
      // Conditional on still being pending, so two approvers deciding at once
      // can't both win: the second sees zero rows updated.
      const { count } = await tx.boardShareRequest.updateMany({
        where: { id: requestId, status: "PENDING" },
        data: { status, reason, decidedById: userId, decidedAt: new Date() },
      });
      if (count === 0) throw new ConflictException("This request has already been decided");
      if (status === "APPROVED") {
        await tx.board.update({ where: { id: request.boardId }, data: { kind: "SHARED" } });
      }
      await this.notifications.notify(tx, {
        userId: request.requestedById,
        actorId: userId,
        type: status === "APPROVED" ? "BOARD_SHARE_APPROVED" : "BOARD_SHARE_REJECTED",
        boardId: request.boardId,
        payload: { boardName: request.board.name, requestId, ...(reason ? { reason } : {}) },
      });
    });
  }

  /** Every live shared board, plus personal boards whose share request is pending. */
  private candidates(excludeBoardId?: string): Promise<Candidate[]> {
    return this.prisma.board.findMany({
      where: {
        isArchived: false,
        OR: [{ kind: "SHARED" }, { shareRequests: { some: { status: "PENDING" } } }],
        ...(excludeBoardId ? { id: { not: excludeBoardId } } : {}),
      },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        description: true,
        kind: true,
        owner: PERSON,
        _count: { select: { members: true } },
      },
    });
  }
}

/**
 * Name matching runs in memory over the candidate set: the normalisation
 * (`normalizeBoardName`) is Arabic-aware in ways SQL `ILIKE` isn't, and the
 * set — live shared boards — stays small.
 */
function matching(candidates: Candidate[], name: string): SimilarBoard[] {
  return candidates
    .filter((c) => isSimilarBoardName(name, c.name))
    .slice(0, MAX_SIMILAR)
    .map((c) => ({
      id: c.id,
      name: c.name,
      description: c.description,
      owner: c.owner,
      memberCount: c._count.members,
      pending: c.kind === "PERSONAL",
    }));
}
