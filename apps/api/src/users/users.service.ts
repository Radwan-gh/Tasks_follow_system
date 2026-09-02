import { ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import type { AdminUser, AdminUserList, CreateUserRequest, ListUsersQuery, UserRole } from "@app/types";
import type { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { generateTemporaryPassword, hashPassword } from "../common/util/password.util";

type UserWithBoardCount = Prisma.UserGetPayload<{ include: { _count: { select: { boardMemberships: true } } } }>;

function serialize(user: UserWithBoardCount): AdminUser {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    role: user.role,
    isActive: user.isActive,
    mustChangePassword: user.mustChangePassword,
    createdAt: user.createdAt.toISOString(),
    boardCount: user._count.boardMemberships,
  };
}

const BOARD_COUNT_INCLUDE = { _count: { select: { boardMemberships: true } } } as const;

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: ListUsersQuery): Promise<AdminUserList> {
    const where: Prisma.UserWhereInput = query.search
      ? {
          OR: [
            { email: { contains: query.search, mode: "insensitive" } },
            { displayName: { contains: query.search, mode: "insensitive" } },
          ],
        }
      : {};

    const [users, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        include: BOARD_COUNT_INCLUDE,
        orderBy: { createdAt: "asc" },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.user.count({ where }),
    ]);

    return { users: users.map(serialize), total, page: query.page, pageSize: query.pageSize };
  }

  /**
   * Provision a new account. Public self-registration was removed — an admin
   * sets the initial email, display name, password, and (optionally) role.
   */
  async create(input: CreateUserRequest): Promise<AdminUser> {
    const existing = await this.prisma.user.findUnique({ where: { email: input.email } });
    if (existing) throw new ConflictException("Email already registered");

    const passwordHash = await hashPassword(input.password);
    const user = await this.prisma.user.create({
      data: {
        email: input.email,
        passwordHash,
        displayName: input.displayName,
        role: input.role ?? "USER",
      },
      include: BOARD_COUNT_INCLUDE,
    });
    return serialize(user);
  }

  /**
   * Admin reset of another user's password. Revokes the target's refresh
   * tokens so any live sessions can't outlive the reset beyond an access-token
   * TTL — the same session-capping rationale as role/status changes.
   */
  async setPassword(targetId: string, password: string): Promise<AdminUser> {
    return this.prisma.$transaction(async (tx) => {
      const target = await tx.user.findUnique({ where: { id: targetId }, include: BOARD_COUNT_INCLUDE });
      if (!target) throw new NotFoundException("User not found");

      const passwordHash = await hashPassword(password);
      const updated = await tx.user.update({
        where: { id: targetId },
        data: { passwordHash, mustChangePassword: false },
        include: BOARD_COUNT_INCLUDE,
      });
      await this.revokeRefreshTokens(tx, targetId);
      return serialize(updated);
    });
  }

  /**
   * Admin-generated one-time temporary password (`design-prompt-group-3.md`
   * §3a-7). Unlike `setPassword`, the admin never sees/chooses the value —
   * it's returned once here and the target is forced to replace it via
   * `mustChangePassword` before doing anything else.
   */
  async resetPassword(targetId: string): Promise<string> {
    return this.prisma.$transaction(async (tx) => {
      const target = await tx.user.findUnique({ where: { id: targetId } });
      if (!target) throw new NotFoundException("User not found");

      const temporaryPassword = generateTemporaryPassword();
      const passwordHash = await hashPassword(temporaryPassword);
      await tx.user.update({
        where: { id: targetId },
        data: { passwordHash, mustChangePassword: true },
      });
      await this.revokeRefreshTokens(tx, targetId);
      return temporaryPassword;
    });
  }

  async updateRole(callerId: string, targetId: string, role: UserRole): Promise<AdminUser> {
    return this.prisma.$transaction(async (tx) => {
      const target = await tx.user.findUnique({ where: { id: targetId }, include: BOARD_COUNT_INCLUDE });
      if (!target) throw new NotFoundException("User not found");
      if (target.role === role) return serialize(target);

      if (role === "USER") {
        // Demotion. The caller's own JWT role claim can be stale, so the
        // invariants are enforced against the database, not the token.
        if (targetId === callerId) throw new ForbiddenException("You cannot demote yourself");
        await this.assertNotLastActiveAdmin(tx, target);
        // Revoke sessions so the demoted admin's elevated access ends at
        // access-token expiry instead of refresh-token expiry.
        await this.revokeRefreshTokens(tx, targetId);
      }

      const updated = await tx.user.update({
        where: { id: targetId },
        data: { role },
        include: BOARD_COUNT_INCLUDE,
      });
      return serialize(updated);
    });
  }

  async updateStatus(callerId: string, targetId: string, isActive: boolean): Promise<AdminUser> {
    return this.prisma.$transaction(async (tx) => {
      const target = await tx.user.findUnique({ where: { id: targetId }, include: BOARD_COUNT_INCLUDE });
      if (!target) throw new NotFoundException("User not found");
      if (target.isActive === isActive) return serialize(target);

      if (!isActive) {
        if (targetId === callerId) throw new ForbiddenException("You cannot deactivate yourself");
        await this.assertNotLastActiveAdmin(tx, target);
        // Block existing sessions: login is already rejected for inactive
        // users, and revoking refresh tokens caps live access tokens at TTL.
        await this.revokeRefreshTokens(tx, targetId);
      }

      const updated = await tx.user.update({
        where: { id: targetId },
        data: { isActive },
        include: BOARD_COUNT_INCLUDE,
      });
      return serialize(updated);
    });
  }

  private async assertNotLastActiveAdmin(tx: Prisma.TransactionClient, target: { id: string; role: string; isActive: boolean }) {
    if (target.role !== "ADMIN" || !target.isActive) return;
    const otherActiveAdmins = await tx.user.count({
      where: { role: "ADMIN", isActive: true, id: { not: target.id } },
    });
    if (otherActiveAdmins === 0) throw new ConflictException("Cannot remove the last active admin");
  }

  private async revokeRefreshTokens(tx: Prisma.TransactionClient, userId: string) {
    await tx.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
}
