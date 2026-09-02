import { extendZodWithOpenApi, OpenAPIRegistry, OpenApiGeneratorV3 } from "@asteasolutions/zod-to-openapi";
import type { SchemaObject } from "@nestjs/swagger/dist/interfaces/open-api-spec.interface";
import { z } from "zod";
import {
  UserSchema,
  AdminUserSchema,
  AdminUserListSchema,
  BoardMemberSchema,
  BoardSummarySchema,
  BoardDetailSchema,
  BoardOwnerSummarySchema,
  CardSchema,
  SubtaskSchema,
  CardActivitySchema,
  ListSchema,
  CommentSchema,
  AttachmentSchema,
  NotificationSchema,
  TemplateSchema,
  NotificationPrefsSchema,
  CreateBoardRequestSchema,
  UpdateBoardRequestSchema,
  AddBoardMemberRequestSchema,
  CreateUserRequestSchema,
  AdminSetPasswordRequestSchema,
  AdminResetPasswordResponseSchema,
  ListUsersQuerySchema,
  UpdateUserRoleRequestSchema,
  UpdateUserStatusRequestSchema,
  CreateListRequestSchema,
  UpdateListRequestSchema,
  CreateCardRequestSchema,
  UpdateCardRequestSchema,
  UpdateCardAccessRequestSchema,
  CreateSubtaskRequestSchema,
  UpdateSubtaskRequestSchema,
  UpdateAssigneesRequestSchema,
  CreateCommentRequestSchema,
  UpdateNotificationPrefsRequestSchema,
  LoginRequestSchema,
  ChangePasswordRequestSchema,
  RefreshRequestSchema,
  AuthResponseSchema,
  ReportOverviewSchema,
  CompletedTasksReportSchema,
  OverdueTasksReportSchema,
  WorkloadReportSchema,
  MyTasksResponseSchema,
  NotificationsResponseSchema,
} from "@app/types";

// Enables `.openapi()` on any zod schema. `apps/api` and `packages/types`
// resolve to the same `zod` module instance in this workspace, so this
// module-level patch is applied once, safely, before any schema is used.
extendZodWithOpenApi(z);

const registry = new OpenAPIRegistry();

// Entities
registry.register("User", UserSchema);
registry.register("AdminUser", AdminUserSchema);
registry.register("AdminUserList", AdminUserListSchema);
registry.register("BoardMember", BoardMemberSchema);
registry.register("BoardSummary", BoardSummarySchema);
registry.register("BoardDetail", BoardDetailSchema);
registry.register("BoardOwnerSummary", BoardOwnerSummarySchema);
registry.register("Card", CardSchema);
registry.register("Subtask", SubtaskSchema);
registry.register("CardActivity", CardActivitySchema);
registry.register("List", ListSchema);
registry.register("Comment", CommentSchema);
registry.register("Attachment", AttachmentSchema);
registry.register("Notification", NotificationSchema);
registry.register("Template", TemplateSchema);
registry.register("NotificationPrefs", NotificationPrefsSchema);

// Request bodies / queries
registry.register("CreateBoardRequest", CreateBoardRequestSchema);
registry.register("UpdateBoardRequest", UpdateBoardRequestSchema);
registry.register("AddBoardMemberRequest", AddBoardMemberRequestSchema);
registry.register("CreateUserRequest", CreateUserRequestSchema);
registry.register("AdminSetPasswordRequest", AdminSetPasswordRequestSchema);
registry.register("AdminResetPasswordResponse", AdminResetPasswordResponseSchema);
registry.register("ListUsersQuery", ListUsersQuerySchema);
registry.register("UpdateUserRoleRequest", UpdateUserRoleRequestSchema);
registry.register("UpdateUserStatusRequest", UpdateUserStatusRequestSchema);
registry.register("CreateListRequest", CreateListRequestSchema);
registry.register("UpdateListRequest", UpdateListRequestSchema);
registry.register("CreateCardRequest", CreateCardRequestSchema);
registry.register("UpdateCardRequest", UpdateCardRequestSchema);
registry.register("UpdateCardAccessRequest", UpdateCardAccessRequestSchema);
registry.register("CreateSubtaskRequest", CreateSubtaskRequestSchema);
registry.register("UpdateSubtaskRequest", UpdateSubtaskRequestSchema);
registry.register("UpdateAssigneesRequest", UpdateAssigneesRequestSchema);
registry.register("CreateCommentRequest", CreateCommentRequestSchema);
registry.register("UpdateNotificationPrefsRequest", UpdateNotificationPrefsRequestSchema);
registry.register("LoginRequest", LoginRequestSchema);
registry.register("ChangePasswordRequest", ChangePasswordRequestSchema);
registry.register("RefreshRequest", RefreshRequestSchema);
registry.register("AuthResponse", AuthResponseSchema);

// Ad-hoc aggregate response shapes (reports / my-tasks / notifications list)
registry.register("ReportOverview", ReportOverviewSchema);
registry.register("CompletedTasksReport", CompletedTasksReportSchema);
registry.register("OverdueTasksReport", OverdueTasksReportSchema);
registry.register("WorkloadReport", WorkloadReportSchema);
registry.register("MyTasksResponse", MyTasksResponseSchema);
registry.register("NotificationsResponse", NotificationsResponseSchema);

/**
 * Component schemas generated from the registrations above, keyed by the
 * names passed to `register()`. Merged into the `@nestjs/swagger`-generated
 * document in `main.ts` — paths/operations still come entirely from Nest
 * decorators; this only supplies the `#/components/schemas/*` bodies those
 * decorators reference by name via `zodRef`/`zodArrayRef` (`./zod-ref`).
 */
export function buildZodComponents(): Record<string, SchemaObject> {
  const generator = new OpenApiGeneratorV3(registry.definitions);
  // `zod-to-openapi` returns `openapi3-ts`'s SchemaObject, which is
  // structurally close to but not identical to @nestjs/swagger's own
  // interface (e.g. `type` as string | string[] vs string) — both describe
  // the same OpenAPI 3.0 JSON, so this cast is safe.
  return (generator.generateComponents().components?.schemas ?? {}) as Record<string, SchemaObject>;
}
