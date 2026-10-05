import { ForbiddenException, HttpException, Injectable } from "@nestjs/common";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult, ToolAnnotations } from "@modelcontextprotocol/sdk/types.js";
import {
  CreateBoardRequestSchema,
  CreateCardRequestSchema,
  CreateCommentRequestSchema,
  CreateSubtaskRequestSchema,
  ListStatusCategory,
  UpdateCardAccessRequestSchema,
  UpdateCardRequestSchema,
} from "@app/types";
import { z } from "zod";
import { BoardsService } from "../boards/boards.service";
import { AttachmentsService } from "../cards/attachments.service";
import { CardsService } from "../cards/cards.service";
import { CommentsService } from "../cards/comments.service";
import { MyTasksService } from "../my-tasks/my-tasks.service";
import { OversightService } from "../oversight/oversight.service";
import { PrismaService } from "../prisma/prisma.service";
import { SubtasksService } from "../subtasks/subtasks.service";

const SERVER_INSTRUCTIONS = `غِراس (Ghiras) is a Kanban task tracker: boards contain lists, lists contain cards (tasks).
A card's status IS the list it sits in — to change a task's status, move the card with move_card.
Every board starts with five status lists (جديد/NEW, جاهز/READY, قيد التنفيذ/IN_PROGRESS, منجز/DONE, انتهى/CLOSED); lists cannot be created here.
People are shown by displayName with username as their unique handle; tools take user ids, which get_board lists under members.
All actions run as the signed-in user with their own board permissions.
A supervisor (an admin, or a user granted «الاطلاع على كل اللوحات») can also read every board and task through list_all_boards and search_all_tasks, and open any board or card read-only — they still cannot change boards they are not a member of.`;

/** Editable card fields, straight from the shared request schema; moving has its own tool. */
const cardUpdateFields = UpdateCardRequestSchema.omit({ targetListId: true, move: true }).shape;

interface ToolConfig<S extends z.ZodRawShape> {
  title: string;
  description: string;
  inputSchema?: S;
  annotations: ToolAnnotations;
}

type ToolHandler<S extends z.ZodRawShape> = (args: z.objectOutputType<S, z.ZodTypeAny>) => Promise<CallToolResult>;

/**
 * `server.registerTool`, typed simply. The SDK's own signature infers the
 * handler's arguments through its zod v3/v4 compatibility types, which sends
 * `tsc` out of memory on schemas the size of ours; here the arguments are
 * inferred straight from the zod shape instead. The SDK still validates every
 * call against `inputSchema` at runtime.
 */
function toolRegistrar(server: McpServer) {
  const register = server.registerTool.bind(server) as unknown as (
    name: string,
    config: ToolConfig<z.ZodRawShape>,
    handler: (args: Record<string, unknown>) => Promise<CallToolResult>,
  ) => void;
  return <S extends z.ZodRawShape = {}>(name: string, config: ToolConfig<S>, handler: ToolHandler<S>) =>
    register(name, config, handler as unknown as (args: Record<string, unknown>) => Promise<CallToolResult>);
}

const ok = (data: unknown): CallToolResult => ({
  content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
});

/**
 * Runs a tool body and turns the API's own `HttpException`s (403 not a member,
 * 404 restricted card, 400 bad move…) into a readable tool error instead of a
 * protocol failure, so the model can explain or recover.
 */
async function run(body: () => Promise<unknown>): Promise<CallToolResult> {
  try {
    return ok(await body());
  } catch (err) {
    if (err instanceof HttpException) {
      return { isError: true, content: [{ type: "text", text: `${err.getStatus()}: ${err.message}` }] };
    }
    throw err;
  }
}

/**
 * Builds the MCP server for one request, bound to the signed-in user
 * (docs/15-mcp-server.md). Each tool calls the same service method the REST
 * controller does, so `BoardsService.assertMembership`, restricted cards and
 * the closed-list rule all apply unchanged — this layer adds no authorization
 * of its own. The only direct Prisma reads resolve ids to names *after* the
 * service has authorized the request.
 */
@Injectable()
export class McpServerFactory {
  constructor(
    private readonly prisma: PrismaService,
    private readonly boards: BoardsService,
    private readonly cards: CardsService,
    private readonly comments: CommentsService,
    private readonly attachments: AttachmentsService,
    private readonly subtasks: SubtasksService,
    private readonly myTasks: MyTasksService,
    private readonly oversight: OversightService,
  ) {}

  /** Oversight tools sit outside `assertMembership`, so they check the system-level grant themselves — the same check as `SupervisorGuard`. */
  private async assertSupervisor(userId: string) {
    if (!(await this.boards.isSupervisor(userId))) {
      throw new ForbiddenException("Permission to view all boards required");
    }
  }

  create(userId: string): McpServer {
    const server = new McpServer({ name: "ghiras", title: "غِراس", version: "1.0.0" }, { instructions: SERVER_INSTRUCTIONS });
    const readOnly = { readOnlyHint: true, openWorldHint: false };
    const write = { readOnlyHint: false, destructiveHint: false, openWorldHint: false };
    const tool = toolRegistrar(server);

    // ── Read ──────────────────────────────────────────────────────────────

    tool(
      "list_boards",
      { title: "List my boards", description: "Boards the user is a member of (not archived), with card counts.", annotations: readOnly },
      () =>
        run(async () =>
          (await this.boards.listForUser(userId)).map((b) => ({
            id: b.id,
            name: b.name,
            description: b.description,
            dueDate: b.dueDate,
            memberCount: b.memberCount,
            cardCount: b.cardCount,
            doneCount: b.doneCount,
          })),
        ),
    );

    tool(
      "get_board",
      {
        title: "Get board",
        description:
          "A board's members (with user ids and roles) and its lists in order, each with its open cards. Use this to find list ids, card ids and user ids.",
        inputSchema: { boardId: z.string() },
        annotations: readOnly,
      },
      ({ boardId }) =>
        run(async () => {
          const board = await this.boards.getDetail(userId, boardId);
          const nameOf = new Map(board.members.map((m) => [m.userId, m.user.displayName]));
          return {
            id: board.id,
            name: board.name,
            description: board.description,
            dueDate: board.dueDate,
            myRole: board.members.find((m) => m.userId === userId)?.role,
            // Not a member — seen through oversight, so read-only.
            supervised: board.supervised,
            members: board.members.map((m) => ({
              userId: m.userId,
              username: m.user.username,
              displayName: m.user.displayName,
              role: m.role,
            })),
            lists: board.lists.map((l) => ({
              id: l.id,
              name: l.name,
              status: l.statusCategory,
              cards: l.cards.map((c) => ({
                id: c.id,
                title: c.title,
                priority: c.priority,
                dueDate: c.dueDate,
                assignees: c.assigneeIds.map((id) => nameOf.get(id) ?? id),
              })),
            })),
          };
        }),
    );

    tool(
      "get_card",
      {
        title: "Get card",
        description: "Everything about one card: all fields, its list (status), assignees, access, subtasks, comments and attachments.",
        inputSchema: { cardId: z.string() },
        annotations: readOnly,
      },
      ({ cardId }) =>
        run(async () => {
          const card = await this.cards.getDetail(userId, cardId);
          const [subtasks, comments, attachments, list] = await Promise.all([
            this.subtasks.list(userId, cardId),
            this.comments.list(userId, cardId),
            this.attachments.list(userId, cardId),
            this.prisma.list.findUnique({ where: { id: card.listId }, select: { name: true, statusCategory: true } }),
          ]);
          const people = await this.peopleById([
            ...card.assigneeIds,
            ...card.memberIds,
            card.createdById,
            ...subtasks.flatMap((s) => s.assigneeIds),
          ]);
          return {
            ...card,
            list: { id: card.listId, name: list?.name, status: list?.statusCategory },
            createdBy: people.get(card.createdById),
            assignees: card.assigneeIds.map((id) => people.get(id)),
            accessMembers: card.memberIds.map((id) => people.get(id)),
            subtasks: subtasks.map((s) => ({
              id: s.id,
              title: s.title,
              isDone: s.isDone,
              assignees: s.assigneeIds.map((id) => people.get(id)),
            })),
            comments: comments.map((c) => ({ id: c.id, body: c.body, createdAt: c.createdAt, author: c.author.displayName })),
            attachments: attachments.map((a) => ({ fileName: a.fileName, mimeType: a.mimeType, sizeBytes: a.sizeBytes })),
          };
        }),
    );

    tool(
      "get_card_history",
      {
        title: "Get card history",
        description: "The card's audit trail: who created, moved (status changes), renamed, edited or archived it, and when.",
        inputSchema: { cardId: z.string() },
        annotations: readOnly,
      },
      ({ cardId }) =>
        run(async () =>
          (await this.cards.getHistory(userId, cardId)).map((a) => ({
            type: a.type,
            from: a.fromValue,
            to: a.toValue,
            at: a.createdAt,
            by: a.actor.displayName,
          })),
        ),
    );

    tool(
      "my_tasks",
      {
        title: "My tasks",
        description: "Open cards and subtasks assigned to the signed-in user across all boards (excludes done/closed).",
        annotations: readOnly,
      },
      () => run(async () => (await this.myTasks.list(userId)).items),
    );

    // ── Oversight (supervisors only) ──────────────────────────────────────

    tool(
      "list_all_boards",
      {
        title: "List all boards (oversight)",
        description:
          "Every board in the system, regardless of membership, with owner and card counts. Supervisors only (an admin, or a user granted view-all-boards). Open one with get_board — read-only unless you are a member.",
        inputSchema: { archived: z.boolean().optional().describe("true lists archived boards instead of active ones") },
        annotations: readOnly,
      },
      ({ archived }) =>
        run(async () => {
          await this.assertSupervisor(userId);
          return (await this.oversight.boardsList(archived ?? false)).map((b) => ({
            id: b.id,
            name: b.name,
            owner: b.owner.displayName,
            dueDate: b.dueDate,
            isArchived: b.isArchived,
            memberCount: b.memberCount,
            cardCount: b.cardCount,
            doneCount: b.doneCount,
          }));
        }),
    );

    tool(
      "search_all_tasks",
      {
        title: "Search all tasks (oversight)",
        description:
          "Cards across every board, regardless of membership. Supervisors only. Filters combine; completed cards are excluded unless includeCompleted or a done status is asked for. Returns up to `limit` rows and a nextCursor for the next page.",
        inputSchema: {
          assigneeId: z.string().optional().describe("only cards assigned to this user id"),
          boardId: z.string().optional(),
          status: ListStatusCategory.optional(),
          overdue: z.boolean().optional().describe("past due and not done/closed"),
          dueFrom: z.string().datetime().optional(),
          dueTo: z.string().datetime().optional(),
          includeCompleted: z.boolean().optional(),
          query: z.string().max(200).optional().describe("case-insensitive title search"),
          cursor: z.string().optional(),
          limit: z.number().int().min(1).max(100).optional(),
        },
        annotations: readOnly,
      },
      (args) =>
        run(async () => {
          await this.assertSupervisor(userId);
          const page = await this.oversight.tasks({
            assigneeId: args.assigneeId,
            boardId: args.boardId,
            statusCategory: args.status,
            overdue: args.overdue ?? false,
            dueFrom: args.dueFrom,
            dueTo: args.dueTo,
            includeCompleted: args.includeCompleted ?? false,
            q: args.query,
            cursor: args.cursor,
            limit: args.limit ?? 50,
          });
          return {
            nextCursor: page.nextCursor,
            items: page.items.map((t) => ({
              id: t.id,
              title: t.title,
              board: t.boardName,
              boardId: t.boardId,
              list: t.listName,
              status: t.statusCategory,
              priority: t.priority,
              dueDate: t.dueDate,
              assignees: t.assignees.map((a) => a.displayName),
              createdBy: t.createdBy.displayName,
              subtasks: t.subtaskTotal ? `${t.subtaskDone}/${t.subtaskTotal}` : null,
            })),
          };
        }),
    );

    // ── Cards ─────────────────────────────────────────────────────────────

    tool(
      "create_card",
      {
        title: "Create card",
        description:
          "Add a card (task) to a list, with any of its details. dueDate is ISO 8601; set dueDateHasTime when the time of day matters. costAmount is a decimal string. assigneeIds must be board members.",
        inputSchema: {
          listId: z.string(),
          ...CreateCardRequestSchema.shape,
          assigneeIds: z.array(z.string()).optional(),
        },
        annotations: write,
      },
      ({ listId, assigneeIds, ...input }) =>
        run(async () => {
          const card = await this.cards.create(userId, listId, input);
          return assigneeIds?.length
            ? this.cards.updateAssignees(userId, card.id, { userIds: assigneeIds })
            : card;
        }),
    );

    tool(
      "update_card",
      {
        title: "Update card",
        description:
          "Edit any card details: title, description, dueDate, dueDateHasTime, priority, costAmount, costNote, recurrence, or isArchived. Pass null to clear a field. To change status use move_card.",
        inputSchema: { cardId: z.string(), ...cardUpdateFields },
        annotations: write,
      },
      ({ cardId, ...input }) => run(() => this.cards.update(userId, cardId, input)),
    );

    tool(
      "move_card",
      {
        title: "Move card",
        description:
          "Change a card's status by moving it to another list on the same board (or reorder within its list). position: 'top', 'bottom' (default), or the id of a card in the target list to place it after.",
        inputSchema: {
          cardId: z.string(),
          targetListId: z.string(),
          position: z.union([z.enum(["top", "bottom"]), z.object({ afterCardId: z.string() })]).optional(),
        },
        annotations: write,
      },
      ({ cardId, targetListId, position }) =>
        run(async () => {
          // Neighbours only — the service re-reads their positions inside its
          // transaction and computes the key (`computeMovePosition`).
          const siblings = await this.prisma.card.findMany({
            where: { listId: targetListId, isArchived: false, id: { not: cardId } },
            orderBy: { position: "asc" },
            select: { id: true },
          });
          const ids = siblings.map((s) => s.id);
          let move: { beforeId: string | null; afterId: string | null };
          if (position === "top") {
            move = { beforeId: null, afterId: ids[0] ?? null };
          } else if (position && typeof position === "object") {
            const index = ids.indexOf(position.afterCardId);
            if (index === -1) throw new HttpException("afterCardId is not a card in the target list", 400);
            move = { beforeId: ids[index], afterId: ids[index + 1] ?? null };
          } else {
            move = { beforeId: ids[ids.length - 1] ?? null, afterId: null };
          }
          return this.cards.update(userId, cardId, { targetListId, move });
        }),
    );

    tool(
      "set_card_assignees",
      {
        title: "Set card assignees",
        description: "Replace who the card is assigned to (user ids of board members). Pass an empty list to unassign everyone.",
        inputSchema: { cardId: z.string(), userIds: z.array(z.string()) },
        annotations: write,
      },
      ({ cardId, userIds }) => run(() => this.cards.updateAssignees(userId, cardId, { userIds })),
    );

    tool(
      "set_card_access",
      {
        title: "Set card access",
        description:
          "Restrict a card to specific board members (isRestricted: true + memberUserIds) or open it to the whole board (isRestricted: false). Only the board owner or the card's creator can do this.",
        inputSchema: { cardId: z.string(), ...UpdateCardAccessRequestSchema.shape },
        annotations: write,
      },
      ({ cardId, ...input }) => run(() => this.cards.updateAccess(userId, cardId, input)),
    );

    // ── Subtasks & comments ───────────────────────────────────────────────

    tool(
      "add_subtask",
      {
        title: "Add subtask",
        description: "Add a checklist item (subtask) to a card.",
        inputSchema: { cardId: z.string(), ...CreateSubtaskRequestSchema.shape },
        annotations: write,
      },
      ({ cardId, ...input }) => run(() => this.subtasks.create(userId, cardId, input)),
    );

    tool(
      "update_subtask",
      {
        title: "Update subtask",
        description: "Rename a subtask or tick/untick it (isDone).",
        inputSchema: {
          subtaskId: z.string(),
          title: z.string().min(1).max(300).optional(),
          isDone: z.boolean().optional(),
        },
        annotations: write,
      },
      ({ subtaskId, ...input }) => run(() => this.subtasks.update(userId, subtaskId, input)),
    );

    tool(
      "set_subtask_assignees",
      {
        title: "Set subtask assignees",
        description: "Replace who a subtask is assigned to (user ids of board members).",
        inputSchema: { subtaskId: z.string(), userIds: z.array(z.string()) },
        annotations: write,
      },
      ({ subtaskId, userIds }) => run(() => this.subtasks.updateAssignees(userId, subtaskId, { userIds })),
    );

    tool(
      "add_comment",
      {
        title: "Add comment",
        description: "Post a comment on a card as the signed-in user. Board members are notified as in the app.",
        inputSchema: { cardId: z.string(), ...CreateCommentRequestSchema.shape },
        annotations: write,
      },
      ({ cardId, ...input }) => run(() => this.comments.create(userId, cardId, input)),
    );

    // ── Boards & members ──────────────────────────────────────────────────

    tool(
      "create_board",
      {
        title: "Create board",
        description:
          "Create a new board owned by the signed-in user. It comes with the five standard status lists, ready for cards.",
        // `template` is deliberately left out: an EMPTY board would have no
        // lists, and lists can't be created over MCP.
        inputSchema: {
          name: CreateBoardRequestSchema.shape.name,
          description: CreateBoardRequestSchema.shape.description,
          dueDate: CreateBoardRequestSchema.shape.dueDate,
        },
        annotations: write,
      },
      (input) => run(() => this.boards.create(userId, input)),
    );

    tool(
      "find_users_to_add",
      {
        title: "Find users to add to a board",
        description: "Search active users who are not yet members of the board, by username or display name. Board owner only.",
        inputSchema: { boardId: z.string(), search: z.string().optional() },
        annotations: readOnly,
      },
      ({ boardId, search }) => run(() => this.boards.listMemberCandidates(userId, boardId, { search, limit: 20 })),
    );

    tool(
      "add_board_member",
      {
        title: "Add board member",
        description:
          "Add a user (id from find_users_to_add) to a board. MEMBER can edit, VIEWER can only read. Board owner only.",
        inputSchema: { boardId: z.string(), userId: z.string(), role: z.enum(["MEMBER", "VIEWER"]).optional() },
        annotations: write,
      },
      ({ boardId, userId: targetUserId, role }) =>
        run(() => this.boards.addMember(userId, boardId, targetUserId, role ?? "MEMBER")),
    );

    return server;
  }

  private async peopleById(ids: string[]) {
    const users = await this.prisma.user.findMany({
      where: { id: { in: [...new Set(ids)] } },
      select: { id: true, username: true, displayName: true },
    });
    return new Map(users.map((u) => [u.id, u]));
  }
}
