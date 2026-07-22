import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { ListUsersQuerySchema, type ListUsersQuery } from "@app/types";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe";
import { UsersService } from "./users.service";

/**
 * Member-facing user directory used by the "add board member" picker. Any
 * authenticated user may browse/search it; only minimal fields are returned
 * (see UsersService.searchDirectory). Distinct from the admin `/admin/users`
 * routes, which are AdminGuard-protected and expose role/status.
 */
@UseGuards(JwtAuthGuard)
@Controller("users")
export class UserDirectoryController {
  constructor(private readonly users: UsersService) {}

  @Get()
  search(@Query(new ZodValidationPipe(ListUsersQuerySchema)) query: ListUsersQuery) {
    return this.users.searchDirectory(query);
  }
}
