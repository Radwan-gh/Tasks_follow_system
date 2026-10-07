import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { generateKeyBetween } from "@app/ordering";
import { canManageBoardCategories, type BoardCategory, type UpdateBoardCategoryRequest } from "@app/types";
import { computeMovePosition } from "../common/util/position.util";
import { PrismaService } from "../prisma/prisma.service";

function serialize(row: {
  id: string;
  name: string;
  position: string;
  createdById: string | null;
  createdAt: Date;
}): BoardCategory {
  return {
    id: row.id,
    name: row.name,
    position: row.position,
    createdById: row.createdById,
    createdAt: row.createdAt.toISOString(),
  };
}

/**
 * Board categories («التصنيفات») — `docs/17-board-categories.md`. Global, not
 * board-scoped: any signed-in user lists them, and only an ADMIN creates,
 * renames, reorders or deletes one (`canManageBoardCategories`). Order is a
 * fractional-index `position`, moved by neighbour ids exactly like a list. `createdById` is kept
 * as a record of which admin made it, not as a permission.
 * Putting a board *into* a category is a board edit and goes through
 * `BoardsService` (and so `assertMembership`), not through here.
 */
@Injectable()
export class BoardCategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(): Promise<BoardCategory[]> {
    const rows = await this.prisma.boardCategory.findMany({ orderBy: { position: "asc" } });
    return rows.map(serialize);
  }

  async create(userId: string, name: string): Promise<BoardCategory> {
    await this.assertAdmin(userId);
    await this.assertNameFree(name);
    // A new category goes last; the admin moves it from there.
    const last = await this.prisma.boardCategory.findFirst({ orderBy: { position: "desc" }, select: { position: true } });
    const position = generateKeyBetween(last?.position ?? null, null);
    return serialize(await this.prisma.boardCategory.create({ data: { name, position, createdById: userId } }));
  }

  /** Rename and/or reorder. Neighbour positions are re-read inside the transaction, as for lists. */
  async update(userId: string, categoryId: string, input: UpdateBoardCategoryRequest): Promise<BoardCategory> {
    await this.assertAdmin(userId);
    await this.assertFound(categoryId);
    if (input.name !== undefined) await this.assertNameFree(input.name, categoryId);

    const move = input.move;
    if (move) {
      const neighbourIds = [move.beforeId, move.afterId].filter((id): id is string => !!id);
      if (neighbourIds.includes(categoryId)) throw new BadRequestException("A category cannot be its own neighbour");
      const found = await this.prisma.boardCategory.count({ where: { id: { in: neighbourIds } } });
      if (found !== new Set(neighbourIds).size) throw new BadRequestException("Unknown neighbour category");
    }

    const row = await this.prisma.$transaction(async (tx) => {
      const position = move
        ? await computeMovePosition(move.beforeId, move.afterId, async (id) => {
            const neighbour = await tx.boardCategory.findUnique({ where: { id }, select: { position: true } });
            return neighbour?.position ?? null;
          })
        : undefined;
      return tx.boardCategory.update({ where: { id: categoryId }, data: { name: input.name, position } });
    });
    return serialize(row);
  }

  /** Its boards are not touched beyond losing the category (`onDelete: SetNull`) — they fall back to «بلا تصنيف». */
  async remove(userId: string, categoryId: string): Promise<void> {
    await this.assertAdmin(userId);
    await this.assertFound(categoryId);
    await this.prisma.boardCategory.delete({ where: { id: categoryId } });
  }

  /** Rejects an id that names no category — the board create/update paths call this before writing `categoryId`. */
  async assertExists(categoryId: string): Promise<void> {
    const found = await this.prisma.boardCategory.findUnique({ where: { id: categoryId }, select: { id: true } });
    if (!found) throw new BadRequestException("No such board category");
  }

  /** Role is read from the database, not the JWT, so a demotion takes effect on the next request. */
  private async assertAdmin(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { role: true } });
    if (!user || !canManageBoardCategories(user)) {
      throw new ForbiddenException("Only an admin can create, rename or delete board categories");
    }
  }

  private async assertFound(categoryId: string) {
    const found = await this.prisma.boardCategory.findUnique({ where: { id: categoryId }, select: { id: true } });
    if (!found) throw new NotFoundException("Board category not found");
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
