import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type { BoardRole, CreateBoardRequest, UpdateBoardRequest } from "@app/types";
import { generateKeyBetween } from "@app/ordering";
import { PrismaService } from "../prisma/prisma.service";

const ROLE_RANK: Record<BoardRole, number> = { MEMBER: 0, OWNER: 1 };

@Injectable()
export class BoardsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Single source of truth for "can user X do Y on board Z", reused by lists/cards services. */
  async assertMembership(userId: string, boardId: string, minRole: BoardRole = "MEMBER") {
    const membership = await this.prisma.boardMember.findUnique({
      where: { boardId_userId: { boardId, userId } },
    });
    if (!membership || ROLE_RANK[membership.role] < ROLE_RANK[minRole]) {
      throw new ForbiddenException("You do not have access to this board");
    }
    return membership;
  }

  async listForUser(userId: string) {
    const boards = await this.prisma.board.findMany({
      where: { members: { some: { userId } }, isArchived: false },
      orderBy: { updatedAt: "desc" },
    });
    return boards.map(serializeBoard);
  }

  async create(userId: string, input: CreateBoardRequest) {
    const board = await this.prisma.board.create({
      data: {
        name: input.name,
        description: input.description ?? null,
        ownerId: userId,
        members: { create: { userId, role: "OWNER" } },
      },
    });
    return serializeBoard(board);
  }

  async getDetail(userId: string, boardId: string) {
    await this.assertMembership(userId, boardId);

    const board = await this.prisma.board.findUnique({
      where: { id: boardId },
      include: {
        members: { include: { user: true } },
        lists: {
          where: { isArchived: false },
          orderBy: { position: "asc" },
          include: { cards: { where: { isArchived: false }, orderBy: { position: "asc" } } },
        },
      },
    });
    if (!board) throw new NotFoundException("Board not found");

    return {
      ...serializeBoard(board),
      members: board.members.map((m) => ({
        userId: m.userId,
        boardId: m.boardId,
        role: m.role,
        user: { id: m.user.id, email: m.user.email, displayName: m.user.displayName },
      })),
      lists: board.lists.map((list) => ({
        id: list.id,
        boardId: list.boardId,
        name: list.name,
        position: list.position,
        isArchived: list.isArchived,
        createdAt: list.createdAt.toISOString(),
        cards: list.cards.map(serializeCard),
      })),
    };
  }

  async update(userId: string, boardId: string, input: UpdateBoardRequest) {
    const requiresOwner = input.isArchived !== undefined;
    await this.assertMembership(userId, boardId, requiresOwner ? "OWNER" : "MEMBER");

    const board = await this.prisma.board.update({
      where: { id: boardId },
      data: {
        name: input.name,
        description: input.description,
        isArchived: input.isArchived,
      },
    });
    return serializeBoard(board);
  }

  async remove(userId: string, boardId: string) {
    await this.assertMembership(userId, boardId, "OWNER");
    await this.prisma.board.delete({ where: { id: boardId } });
  }

  async addMember(userId: string, boardId: string, email: string) {
    await this.assertMembership(userId, boardId, "OWNER");

    const target = await this.prisma.user.findUnique({ where: { email } });
    if (!target) throw new NotFoundException("No user with that email");

    const existing = await this.prisma.boardMember.findUnique({
      where: { boardId_userId: { boardId, userId: target.id } },
    });
    if (existing) throw new BadRequestException("User is already a member of this board");

    const member = await this.prisma.boardMember.create({
      data: { boardId, userId: target.id, role: "MEMBER" },
      include: { user: true },
    });
    return {
      userId: member.userId,
      boardId: member.boardId,
      role: member.role,
      user: { id: member.user.id, email: member.user.email, displayName: member.user.displayName },
    };
  }

  async removeMember(userId: string, boardId: string, targetUserId: string) {
    await this.assertMembership(userId, boardId, "OWNER");

    const target = await this.prisma.boardMember.findUnique({
      where: { boardId_userId: { boardId, userId: targetUserId } },
    });
    if (!target) throw new NotFoundException("Membership not found");
    if (target.role === "OWNER") throw new BadRequestException("Cannot remove the board owner");

    await this.prisma.boardMember.delete({ where: { boardId_userId: { boardId, userId: targetUserId } } });
  }

  /** Fresh-read helper for list ordering — used by ListsService when creating/moving lists. */
  async nextListPosition(boardId: string): Promise<string> {
    const last = await this.prisma.list.findFirst({
      where: { boardId, isArchived: false },
      orderBy: { position: "desc" },
      select: { position: true },
    });
    return generateKeyBetween(last?.position ?? null, null);
  }
}

function serializeBoard(board: {
  id: string;
  name: string;
  description: string | null;
  ownerId: string;
  isArchived: boolean;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: board.id,
    name: board.name,
    description: board.description,
    ownerId: board.ownerId,
    isArchived: board.isArchived,
    createdAt: board.createdAt.toISOString(),
    updatedAt: board.updatedAt.toISOString(),
  };
}

function serializeCard(card: {
  id: string;
  listId: string;
  boardId: string;
  title: string;
  description: string | null;
  position: string;
  dueDate: Date | null;
  createdById: string;
  isArchived: boolean;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: card.id,
    listId: card.listId,
    boardId: card.boardId,
    title: card.title,
    description: card.description,
    position: card.position,
    dueDate: card.dueDate ? card.dueDate.toISOString() : null,
    createdById: card.createdById,
    isArchived: card.isArchived,
    createdAt: card.createdAt.toISOString(),
    updatedAt: card.updatedAt.toISOString(),
  };
}

export { serializeCard };
