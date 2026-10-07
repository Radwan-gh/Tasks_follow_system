import { ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import type {
  AdminUser,
  AdminUserList,
  CreateUserRequest,
  ListUsersQuery,
  UpdateUserPermissionsRequest,
  UpdateUserRequest,
  UserRole,
} from "@app/types";
import type { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { generateTemporaryPassword, hashPassword } from "../common/util/password.util";

type UserWithCounts = Prisma.UserGetPayload<{ include: typeof COUNT_INCLUDE }>;

/**
 * Relations whose foreign keys are *restrict*, not cascade: a row here pins the
 * user in place, so `remove` refuses and `hasContent` warns the UI first. The
 * cascading relations (memberships, assignments, notifications, sessions,
 * devices) are deliberately absent — those disappear with the account.
 */
const CONTENT_RELATIONS = [
  "ownedBoards",
  "createdCards",
  "cardActivities",
  "comments",
  "attachments",
  "createdSubtasks",
] as const;

function serialize(user: UserWithCounts): AdminUser {
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    displayName: user.displayName,
    role: user.role,
    isActive: user.isActive,
    mustChangePassword: user.mustChangePassword,
    canSendNotifications: user.canSendNotifications,
    canViewAllBoards: user.canViewAllBoards,
    canApproveBoards: user.canApproveBoards,
    createdAt: user.createdAt.toISOString(),
    boardCount: user._count.boardMemberships,
    hasContent: CONTENT_RELATIONS.some((relation) => user._count[relation] > 0),
  };
}

const COUNT_INCLUDE = {
  _count: {
    select: {
      boardMemberships: true,
      ownedBoards: true,
      createdCards: true,
      cardActivities: true,
      comments: true,
      attachments: true,
      createdSubtasks: true,
    },
  },
} as const;

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: ListUsersQuery): Promise<AdminUserList> {
    const where: Prisma.UserWhereInput = query.search
      ? {
          OR: [
            { username: { contains: query.search, mode: "insensitive" } },
            { displayName: { contains: query.search, mode: "insensitive" } },
            { email: { contains: query.search, mode: "insensitive" } },
          ],
        }
      : {};

    const [users, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        include: COUNT_INCLUDE,
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
   * sets the initial username, display name, password, and (optionally) role.
   * `email` is optional and purely contact information.
   */
  async create(input: CreateUserRequest): Promise<AdminUser> {
    // Usernames are stored lowercase so that sign-in can be case-insensitive
    // without a second index.
    const username = input.username.trim().toLowerCase();
    const email = input.email?.trim() || null;

    const takenUsername = await this.prisma.user.findUnique({ where: { username } });
    if (takenUsername) throw new ConflictException("Username already registered");
    if (email) {
      const takenEmail = await this.prisma.user.findUnique({ where: { email } });
      if (takenEmail) throw new ConflictException("Email already registered");
    }

    const passwordHash = await hashPassword(input.password);
    const user = await this.prisma.user.create({
      data: {
        username,
        email,
        passwordHash,
        displayName: input.displayName,
        role: input.role ?? "USER",
      },
      include: COUNT_INCLUDE,
    });
    return serialize(user);
  }

  /**
   * Admin edit of a user's descriptive fields (display name / contact email).
   * Credentials, role and status have their own endpoints — this one only
   * touches who the account *is*.
   *
   * Neither field is a credential — `username` is, and it is not editable here —
   * so no session is capped: an access token carries `sub`/`username`/`role`
   * and none of those change. The email column is still unique, so a duplicate
   * is a `Conflict`.
   */
  async update(targetId: string, input: UpdateUserRequest): Promise<AdminUser> {
    return this.prisma.$transaction(async (tx) => {
      const target = await tx.user.findUnique({ where: { id: targetId }, include: COUNT_INCLUDE });
      if (!target) throw new NotFoundException("User not found");

      const email = input.email === undefined ? undefined : input.email.trim() || null;
      const emailChanged = email !== undefined && email !== target.email;
      const nameChanged = input.displayName !== undefined && input.displayName !== target.displayName;
      if (!emailChanged && !nameChanged) return serialize(target);

      if (emailChanged && email) {
        const existing = await tx.user.findUnique({ where: { email } });
        if (existing) throw new ConflictException("Email already registered");
      }

      const updated = await tx.user.update({
        where: { id: targetId },
        data: {
          ...(emailChanged ? { email } : {}),
          ...(nameChanged ? { displayName: input.displayName } : {}),
        },
        include: COUNT_INCLUDE,
      });
      return serialize(updated);
    });
  }

  /**
   * Admin reset of another user's password. Revokes the target's refresh
   * tokens so any live sessions can't outlive the reset beyond an access-token
   * TTL — the same session-capping rationale as role/status changes.
   */
  async setPassword(targetId: string, password: string): Promise<AdminUser> {
    return this.prisma.$transaction(async (tx) => {
      const target = await tx.user.findUnique({ where: { id: targetId }, include: COUNT_INCLUDE });
      if (!target) throw new NotFoundException("User not found");

      const passwordHash = await hashPassword(password);
      const updated = await tx.user.update({
        where: { id: targetId },
        data: { passwordHash, mustChangePassword: false },
        include: COUNT_INCLUDE,
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
      const target = await tx.user.findUnique({ where: { id: targetId }, include: COUNT_INCLUDE });
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
        include: COUNT_INCLUDE,
      });
      return serialize(updated);
    });
  }

  async updateStatus(callerId: string, targetId: string, isActive: boolean): Promise<AdminUser> {
    return this.prisma.$transaction(async (tx) => {
      const target = await tx.user.findUnique({ where: { id: targetId }, include: COUNT_INCLUDE });
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
        include: COUNT_INCLUDE,
      });
      return serialize(updated);
    });
  }

  /**
   * Grants or revokes per-user permissions — "can send notifications", "can
   * view all boards" (oversight) and "can approve shared boards". Only the
   * flags present in `input` are touched. No session revocation needed:
   * `CanSendPushGuard`, `SupervisorGuard`, `BoardsService.assertMembership` and
   * `BoardsService.isApprover` all read the flags from the database on every
   * request, so a revoke takes effect immediately.
   * Reachable only through the ADMIN-guarded `/admin/users` controller.
   */
  async updatePermissions(targetId: string, input: UpdateUserPermissionsRequest): Promise<AdminUser> {
    const target = await this.prisma.user.findUnique({ where: { id: targetId }, select: { id: true } });
    if (!target) throw new NotFoundException("User not found");
    const updated = await this.prisma.user.update({
      where: { id: targetId },
      data: {
        canSendNotifications: input.canSendNotifications,
        canViewAllBoards: input.canViewAllBoards,
        canApproveBoards: input.canApproveBoards,
      },
      include: COUNT_INCLUDE,
    });
    return serialize(updated);
  }

  /**
   * Permanently delete an account. Everything that hangs off the user by a
   * *cascading* foreign key goes with it — board/task memberships, task and
   * sub-task assignments, notifications, refresh tokens — and push devices are
   * detached (`SetNull`) rather than dropped, so the install keeps receiving
   * anonymous pushes.
   *
   * What it deliberately does **not** do is rewrite history. Boards, tasks,
   * comments, attachments, sub-tasks and activity rows point at their author
   * with a restrict-level foreign key, so an account that produced any of them
   * is refused here (`Conflict`) instead of dragging other people's work out
   * of the database or silently re-attributing it. Deactivation
   * (`updateStatus`) is the answer for someone who has worked in the system:
   * it ends their access while leaving the record of what they did intact.
   */
  async remove(callerId: string, targetId: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const target = await tx.user.findUnique({ where: { id: targetId }, include: COUNT_INCLUDE });
      if (!target) throw new NotFoundException("User not found");

      // Same two invariants as demotion/deactivation, and for the same reason:
      // an admin must not be able to lock everyone (including themselves) out
      // of administering the system.
      if (targetId === callerId) throw new ForbiddenException("You cannot delete your own account");
      await this.assertNotLastActiveAdmin(tx, target);

      const blocking = CONTENT_RELATIONS.filter((relation) => target._count[relation] > 0);
      if (blocking.length > 0) {
        throw new ConflictException(
          `Cannot delete a user who owns boards or created content (${blocking.join(", ")}). Deactivate the account instead.`,
        );
      }

      await tx.user.delete({ where: { id: targetId } });
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
