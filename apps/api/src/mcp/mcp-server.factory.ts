import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  Injectable,
  PayloadTooLargeException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult, ToolAnnotations } from "@modelcontextprotocol/sdk/types.js";
import {
  type Attachment,
  CreateBoardCategoryRequestSchema,
  CreateBoardRequestSchema,
  CreateCardRequestSchema,
  CreateCommentRequestSchema,
  CreateSubtaskRequestSchema,
  ListStatusCategory,
  UpdateBoardMemberRoleRequestSchema,
  UpdateBoardRequestSchema,
  UpdateCardAccessRequestSchema,
  UpdateCardRequestSchema,
} from "@app/types";
import { z } from "zod";
import { BoardCategoriesService } from "../board-categories/board-categories.service";
import { BoardsService } from "../boards/boards.service";
import { AttachmentsService } from "../cards/attachments.service";
import { CardsService } from "../cards/cards.service";
import { CommentsService } from "../cards/comments.service";
import { MyTasksService } from "../my-tasks/my-tasks.service";
import { OversightService } from "../oversight/oversight.service";
import { PrismaService } from "../prisma/prisma.service";
import { SubtasksService } from "../subtasks/subtasks.service";
import { MAX_ATTACHMENT_BYTES, PENDING_UPLOAD_TTL_MS } from "../cards/attachments.service";
import { mcpUrls } from "./mcp.config";
import { UploadLinkService } from "./uploads/upload-link.service";

const SERVER_INSTRUCTIONS = `غِراس (Ghiras) is a Kanban task tracker: boards contain lists, lists contain cards (tasks).
A card's status IS the list it sits in — to change a task's status, move the card with move_card.
Every board starts with five status lists (جديد/NEW, جاهز/READY, قيد التنفيذ/IN_PROGRESS, منجز/DONE, انتهى/CLOSED); lists cannot be created here.
People are shown by displayName with username as their unique handle; tools take user ids, which get_board lists under members.
All actions run as the signed-in user with their own board permissions.
Only a board's owner can archive it, delete it (archive first) or manage its members; any other member can leave it with leave_board.
Only a card's owner — the board owner or the card's creator — can change it: edit its details (update_card), move it (move_card), set its assignees or access, attach files, or add, rename, reorder, assign and delete its subtasks. Every other member can only tick subtasks done (update_subtask isDone) and comment.
A supervisor (an admin, or a user granted «الاطلاع على كل اللوحات») can also read every board and task through list_all_boards and search_all_tasks, and open any board or card read-only — they still cannot change boards they are not a member of.`;

/**
 * Largest file `read_attachment` returns. Its bytes travel as base64 inside the
 * tool result, so this sits well under the app's 30MB (`MAX_ATTACHMENT_BYTES`).
 */
const MCP_MAX_READ_BYTES = 5 * 1024 * 1024;
/**
 * Largest `text` `add_attachment` takes inline. Files go through an upload
 * link instead; `mountMcp` sizes the `/mcp` body limit from this.
 */
export const MCP_MAX_INLINE_TEXT_BYTES = 1024 * 1024;
const toMb = (bytes: number) => bytes / (1024 * 1024);

/** Types `read_attachment` returns as an image the model can see. */
const IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/gif", "image/webp"]);
/** Returned as plain text; anything else comes back as a base64 blob. */
const TEXT_TYPES = /^text\/|^application\/(json|xml|x-yaml|yaml|csv)$|\+(json|xml)$/;
const TEXT_EXTENSIONS = /\.(txt|md|markdown|csv|tsv|json|xml|ya?ml|html?|log)$/i;

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

/** Where to place an item among its siblings: an end, or after the sibling whose id is under `afterKey`. */
const placement = (afterKey: string) => z.union([z.enum(["top", "bottom"]), z.object({ [afterKey]: z.string() })]);

/**
 * Neighbour ids for a move to `position` among `siblingIds` (in order, without
 * the item being moved). Ids only — the service re-reads their positions
 * inside its transaction and computes the key (`computeMovePosition`).
 */
function neighbours(
  siblingIds: string[],
  position: "top" | "bottom" | Record<string, string> | undefined,
  notASiblingMessage: string,
): { beforeId: string | null; afterId: string | null } {
  if (position === "top") return { beforeId: null, afterId: siblingIds[0] ?? null };
  if (position && typeof position === "object") {
    const index = siblingIds.indexOf(Object.values(position)[0]);
    if (index === -1) throw new BadRequestException(notASiblingMessage);
    return { beforeId: siblingIds[index], afterId: siblingIds[index + 1] ?? null };
  }
  return { beforeId: siblingIds[siblingIds.length - 1] ?? null, afterId: null };
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
  /** Attachment links are handed to Claude absolute, on the API's public address. */
  private readonly publicBase: URL;

  constructor(
    config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly boards: BoardsService,
    private readonly boardCategories: BoardCategoriesService,
    private readonly cards: CardsService,
    private readonly comments: CommentsService,
    private readonly attachments: AttachmentsService,
    private readonly subtasks: SubtasksService,
    private readonly myTasks: MyTasksService,
    private readonly oversight: OversightService,
    private readonly uploadLinks: UploadLinkService,
  ) {
    this.publicBase = mcpUrls(config).issuer;
  }

  /** `url` is the same public, unguessable `/uploads/<file>` link the apps load (docs/14). */
  private attachmentView(a: Attachment) {
    return {
      id: a.id,
      fileName: a.fileName,
      mimeType: a.mimeType,
      sizeBytes: a.sizeBytes,
      url: new URL(a.url.replace(/^\//, ""), this.publicBase).toString(),
      uploadedBy: a.uploader.displayName,
      createdAt: a.createdAt,
    };
  }

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
    const destructive = { readOnlyHint: false, destructiveHint: true, openWorldHint: false };
    const tool = toolRegistrar(server);

    // ── Read ──────────────────────────────────────────────────────────────

    const boardSummary = (b: Awaited<ReturnType<BoardsService["listForUser"]>>[number]) => ({
      id: b.id,
      name: b.name,
      description: b.description,
      category: b.category?.name ?? null,
      dueDate: b.dueDate,
      // Owner-only actions (archive, delete, members) hinge on this.
      isOwner: b.ownerId === userId,
      memberCount: b.memberCount,
      cardCount: b.cardCount,
      doneCount: b.doneCount,
    });

    tool(
      "list_boards",
      { title: "List my boards", description: "Boards the user is a member of (not archived), with card counts.", annotations: readOnly },
      () => run(async () => (await this.boards.listForUser(userId)).map(boardSummary)),
    );

    tool(
      "list_archived_boards",
      {
        title: "List my archived boards",
        description: "Archived boards the user is a member of. They are read-only; the owner can restore one with update_board (isArchived: false) or delete it for good with delete_board.",
        annotations: readOnly,
      },
      () => run(async () => (await this.boards.listArchivedForUser(userId)).map(boardSummary)),
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
            category: board.category,
            dueDate: board.dueDate,
            isArchived: board.isArchived,
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
        description: "Everything about one card: all fields, its list (status), assignees, access, subtasks, comments and attachments (with ids and links — open one with read_attachment).",
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
            attachments: attachments.map((a) => this.attachmentView(a)),
          };
        }),
    );

    tool(
      "get_card_history",
      {
        title: "Get card history",
        description: "The card's audit trail: who created, moved (status changes), renamed, assigned or archived it, or changed its description, due date, priority, repeat rule or cost — and when. Due dates are YYYY-MM-DD when date-only, a full timestamp when timed; priorities are LOW/NORMAL/URGENT; repeat rules are Arabic summaries.",
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
          "Add a card (task) to a list, with any of its details. dueDate is ISO 8601; set dueDateHasTime when the time of day matters. costAmount is a decimal string. assigneeIds must be board members. recurrence makes it a repeating task — read that field's description for when the next one appears.",
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
          "Edit any card details: title, description, dueDate, dueDateHasTime, priority, costAmount, costNote, recurrence, or isArchived. Pass null to clear a field. To change status use move_card. A repeating card spawns its next instance only when moved to CLOSED (see the recurrence field).",
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
          position: placement("afterCardId").optional(),
        },
        annotations: write,
      },
      ({ cardId, targetListId, position }) =>
        run(async () => {
          const siblings = await this.prisma.card.findMany({
            where: { listId: targetListId, isArchived: false, id: { not: cardId } },
            orderBy: { position: "asc" },
            select: { id: true },
          });
          const move = neighbours(
            siblings.map((s) => s.id),
            position,
            "afterCardId is not a card in the target list",
          );
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
        description:
          "Rename a subtask, tick/untick it (isDone), or reorder it within its card's checklist. position: 'top', 'bottom', or the id of another subtask on the same card to place it after.",
        inputSchema: {
          subtaskId: z.string(),
          title: z.string().min(1).max(300).optional(),
          isDone: z.boolean().optional(),
          position: placement("afterSubtaskId").optional(),
        },
        annotations: write,
      },
      ({ subtaskId, position, ...input }) =>
        run(async () => {
          if (!position) return this.subtasks.update(userId, subtaskId, input);
          const subtask = await this.prisma.subtask.findUnique({ where: { id: subtaskId }, select: { cardId: true } });
          const siblings = subtask
            ? await this.prisma.subtask.findMany({
                where: { cardId: subtask.cardId, id: { not: subtaskId } },
                orderBy: { position: "asc" },
                select: { id: true },
              })
            : [];
          const move = neighbours(
            siblings.map((s) => s.id),
            position,
            "afterSubtaskId is not another subtask of the same card",
          );
          return this.subtasks.update(userId, subtaskId, { ...input, move });
        }),
    );

    tool(
      "delete_subtask",
      {
        title: "Delete subtask",
        description: "Permanently remove a checklist item (subtask) from its card. This cannot be undone.",
        inputSchema: { subtaskId: z.string() },
        annotations: destructive,
      },
      ({ subtaskId }) =>
        run(async () => {
          await this.subtasks.remove(userId, subtaskId);
          return { deleted: subtaskId };
        }),
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

    // ── Attachments ───────────────────────────────────────────────────────

    tool(
      "read_attachment",
      {
        title: "Read attachment",
        description: `Open a file attached to a card (attachment id from get_card). Images come back as images, text files as text, and other files (PDF, Word…) as a base64 resource. Files over ${toMb(MCP_MAX_READ_BYTES)}MB are refused — share their url instead.`,
        inputSchema: { cardId: z.string(), attachmentId: z.string() },
        annotations: readOnly,
      },
      async ({ cardId, attachmentId }) => {
        let file: Awaited<ReturnType<AttachmentsService["read"]>> | undefined;
        const failure = await run(async () => {
          file = await this.attachments.read(userId, cardId, attachmentId, MCP_MAX_READ_BYTES);
        });
        if (!file) return failure;

        const view = this.attachmentView(file.attachment);
        const header = { type: "text" as const, text: JSON.stringify(view, null, 2) };
        const mimeType = file.attachment.mimeType.split(";")[0].trim().toLowerCase();
        if (IMAGE_TYPES.has(mimeType)) {
          return { content: [header, { type: "image", data: file.data.toString("base64"), mimeType }] };
        }
        if (TEXT_TYPES.test(mimeType) || TEXT_EXTENSIONS.test(file.attachment.fileName)) {
          return { content: [header, { type: "text", text: file.data.toString("utf8") }] };
        }
        return {
          content: [header, { type: "resource", resource: { uri: view.url, mimeType, blob: file.data.toString("base64") } }],
        };
      },
    );

    tool(
      "create_upload_link",
      {
        title: "Create upload link",
        description:
          `Step 1 of attaching a file: get a short-lived URL to upload it to. POST the file there as multipart/form-data in a field named "file" — e.g. curl -F "file=@report.docx" "<uploadUrl>" — and the response's uploadId goes to add_attachment. ` +
          `Files up to ${toMb(MAX_ATTACHMENT_BYTES)}MB, any type; the link works for several files until it expires. Only needed for real files — for a short text note, pass text to add_attachment directly.`,
        annotations: write,
      },
      () =>
        run(async () => ({
          ...(await this.uploadLinks.create(userId)),
          method: "POST",
          field: "file",
          uploadsExpireAfterMinutes: PENDING_UPLOAD_TTL_MS / 60_000,
        })),
    );

    tool(
      "add_attachment",
      {
        title: "Add attachment",
        description:
          `Attach a file to a card as the signed-in user. Either uploadId — from uploading the file to a create_upload_link URL — or text, to save a short plain-text note as a file (with fileName, e.g. notes.md; up to ${toMb(MCP_MAX_INLINE_TEXT_BYTES)}MB). Exactly one. At most 10 attachments per card.`,
        inputSchema: {
          cardId: z.string(),
          uploadId: z.string().optional().describe("From the upload link's response; single use"),
          text: z.string().optional().describe("The content of a plain-text file, stored as UTF-8"),
          fileName: z
            .string()
            .min(1)
            .max(255)
            .optional()
            .describe("With text only: the name shown in the app, with its extension. An upload keeps its own name"),
        },
        annotations: write,
      },
      ({ cardId, uploadId, text, fileName }) =>
        run(async () => {
          if ((uploadId === undefined) === (text === undefined)) {
            throw new BadRequestException("Pass exactly one of uploadId or text");
          }
          if (uploadId !== undefined) {
            return this.attachmentView(await this.attachments.attachStaged(userId, cardId, uploadId));
          }
          if (!fileName) throw new BadRequestException("fileName is required with text");
          const buffer = Buffer.from(text!, "utf8");
          if (buffer.length === 0) throw new BadRequestException("The file is empty");
          if (buffer.length > MCP_MAX_INLINE_TEXT_BYTES) {
            throw new PayloadTooLargeException(
              `Text over ${toMb(MCP_MAX_INLINE_TEXT_BYTES)}MB — upload it as a file through create_upload_link`,
            );
          }
          const attachment = await this.attachments.create(userId, cardId, {
            originalname: fileName,
            mimetype: "text/plain",
            size: buffer.length,
            buffer,
          });
          return this.attachmentView(attachment);
        }),
    );

    tool(
      "delete_attachment",
      {
        title: "Delete attachment",
        description:
          "Permanently remove a file from a card. Allowed for whoever uploaded it, the card's creator, or the board owner. This cannot be undone.",
        inputSchema: { cardId: z.string(), attachmentId: z.string() },
        annotations: destructive,
      },
      ({ cardId, attachmentId }) =>
        run(async () => {
          await this.attachments.remove(userId, cardId, attachmentId);
          return { deleted: attachmentId };
        }),
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
          categoryId: CreateBoardRequestSchema.shape.categoryId.describe("Id from list_board_categories; omit for none"),
        },
        annotations: write,
      },
      (input) => run(() => this.boards.create(userId, input)),
    );

    tool(
      "list_board_categories",
      {
        title: "List board categories",
        description:
          "Every board category (the groups boards are shown under, e.g. a project holding several boards). Shared by all users; set a board's with create_board or update_board (categoryId).",
        annotations: readOnly,
      },
      () => run(() => this.boardCategories.list()),
    );

    tool(
      "create_board_category",
      {
        title: "Create board category",
        description: "Create a new board category by name. Admins only. Names are unique regardless of case. Then file boards under it with update_board (categoryId).",
        inputSchema: CreateBoardCategoryRequestSchema.shape,
        annotations: write,
      },
      ({ name }) => run(() => this.boardCategories.create(userId, name)),
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

    tool(
      "set_board_member_role",
      {
        title: "Set board member role",
        description: "Switch a board member between MEMBER (can edit) and VIEWER (read-only). Board owner only; the owner's own role can't change.",
        inputSchema: { boardId: z.string(), userId: z.string(), ...UpdateBoardMemberRoleRequestSchema.shape },
        annotations: write,
      },
      ({ boardId, userId: targetUserId, role }) =>
        run(() => this.boards.updateMemberRole(userId, boardId, targetUserId, role)),
    );

    tool(
      "remove_board_member",
      {
        title: "Remove board member",
        description:
          "Take a user off a board. They lose access to it and to any restricted cards on it; their task assignments stay. Board owner only, and the owner can't be removed. To take yourself off a board, use leave_board.",
        inputSchema: { boardId: z.string(), userId: z.string() },
        annotations: destructive,
      },
      ({ boardId, userId: targetUserId }) =>
        run(async () => {
          await this.boards.removeMember(userId, boardId, targetUserId);
          return { removed: targetUserId, boardId };
        }),
    );

    tool(
      "leave_board",
      {
        title: "Leave board",
        description:
          "Take the signed-in user off a board they are a member or viewer of, archived or not, so it no longer appears in their list. Only the owner can add them back. The owner can't leave — archive the board (update_board) or delete it instead.",
        inputSchema: { boardId: z.string() },
        annotations: destructive,
      },
      ({ boardId }) =>
        run(async () => {
          await this.boards.removeMember(userId, boardId, userId);
          return { left: boardId };
        }),
    );

    tool(
      "update_board",
      {
        title: "Update board",
        description:
          "Edit a board's name, description, dueDate (ISO 8601; null clears it) or categoryId (from list_board_categories; null takes it out of any category), or archive / restore it with isArchived. Any member can edit the details; archiving and restoring are owner only. An archived board is read-only and drops out of list_boards (see list_archived_boards).",
        inputSchema: { boardId: z.string(), ...UpdateBoardRequestSchema.shape },
        annotations: write,
      },
      ({ boardId, ...input }) => run(() => this.boards.update(userId, boardId, input)),
    );

    tool(
      "delete_board",
      {
        title: "Delete board",
        description:
          "Permanently delete a board with all its lists, cards, comments, attachments and history. Board owner only, and only once the board is archived (update_board with isArchived: true) — a live board is refused. This cannot be undone.",
        inputSchema: { boardId: z.string() },
        annotations: destructive,
      },
      ({ boardId }) =>
        run(async () => {
          await this.boards.remove(userId, boardId);
          return { deleted: boardId };
        }),
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
