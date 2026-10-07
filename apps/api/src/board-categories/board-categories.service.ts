import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { canManageBoardCategory, type BoardCategory } from "@app/types";
import { PrismaService } from "../prisma/prisma.service";

function serialize(row: { id: string; name: string; createdById: string | null; createdAt: Date }): BoardCategory {
  return { id: row.id, name: row.name, createdById: row.createdById, createdAt: row.createdAt.toISOString() };
}

/**
 * Board categories («التصنيفات») — `docs/17-board-categories.md`. Global, not
 * board-scoped: any signed-in user lists and creates them, and only the
 * creator or an ADMIN renames or deletes one (`canManageBoardCategory`).
 * Putting a board *into* a category is a board edit and goes through
 * `BoardsService` (and so `assertMembership`), not through here.
 */
@Injectable()
export class BoardCategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(): Promise<BoardCategory[]> {
    const rows = await this.prisma.boardCategory.findMany({ orderBy: { name: "asc" } });
    return rows.map(serialize);
  }

  async create(userId: string, name: string): Promise<BoardCategory> {
    await this.assertNameFree(name);
    return serialize(await this.prisma.boardCategory.create({ data: { name, createdById: userId } }));
  }

  async rename(userId: string, categoryId: string, name: string): Promise<BoardCategory> {
    await this.assertCanManage(userId, categoryId);
    await this.assertNameFree(name, categoryId);
    return serialize(await this.prisma.boardCategory.update({ where: { id: categoryId }, data: { name } }));
  }

  /** Its boards are not touched beyond losing the category (`onDelete: SetNull`) — they fall back to «بلا تصنيف». */
  async remove(userId: string, categoryId: string): Promise<void> {
    await this.assertCanManage(userId, categoryId);
    await this.prisma.boardCategory.delete({ where: { id: categoryId } });
  }

  /** Rejects an id that names no category — the board create/update paths call this before writing `categoryId`. */
  async assertExists(categoryId: string): Promise<void> {
    const found = await this.prisma.boardCategory.findUnique({ where: { id: categoryId }, select: { id: true } });
    if (!found) throw new BadRequestException("No such board category");
  }

  /** Role is read from the database, not the JWT, so a demotion takes effect on the next request. */
  private async assertCanManage(userId: string, categoryId: string) {
    const [category, user] = await Promise.all([
      this.prisma.boardCategory.findUnique({ where: { id: categoryId }, select: { createdById: true } }),
      this.prisma.user.findUnique({ where: { id: userId }, select: { id: true, role: true } }),
    ]);
    if (!category) throw new NotFoundException("Board category not found");
    if (!user || !canManageBoardCategory(user, category)) {
      throw new ForbiddenException("Only the category's creator or an admin can change it");
    }
  }

  /** Two «الجامع» sections would be indistinguishable on the list, so names are unique ignoring case. */
  private async assertNameFree(name: string, exceptId?: string) {
    const clash = await this.prisma.boardCategory.findFirst({
      where: { name: { equals: name, mode: "insensitive" }, ...(exceptId ? { id: { not: exceptId } } : {}) },
      select: { id: true },
    });
    if (clash) throw new ConflictException("A category with this name already exists");
  }
}
