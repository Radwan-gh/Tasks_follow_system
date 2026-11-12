import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiResponse, ApiTags } from "@nestjs/swagger";
import { SearchQuerySchema, type SearchQuery } from "@app/types";
import { CurrentUser, type AuthUser } from "../common/decorators/current-user.decorator";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe";
import { zodRef } from "../swagger/zod-ref";
import { SearchService } from "./search.service";

/**
 * `/search` — the boards screen's «ابحث: لوحات، مهام، مهام فرعية» box and the in-board
 * search (docs/19-search.md). Any signed-in user, over their own boards only.
 */
@ApiTags("Search")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller("search")
export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  @Get()
  @ApiOperation({ summary: "Find boards, tasks and subtasks the current user can open" })
  @ApiQuery({ name: "q", description: "At least 2 characters; Arabic letter forms and tashkeel are ignored" })
  @ApiQuery({ name: "boardId", required: false, description: "Search inside this board only" })
  @ApiResponse({ status: 200, schema: zodRef("SearchResponse") })
  @ApiResponse({ status: 403, description: "boardId given and the caller cannot open that board" })
  search(@CurrentUser() user: AuthUser, @Query(new ZodValidationPipe(SearchQuerySchema)) query: SearchQuery) {
    return this.searchService.search(user.id, query);
  }
}
