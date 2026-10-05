import {
  BadRequestException,
  CanActivate,
  Controller,
  ExecutionContext,
  Injectable,
  Post,
  Req,
  UnauthorizedException,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { ApiExcludeController } from "@nestjs/swagger";
import { FileInterceptor } from "@nestjs/platform-express";
import { memoryStorage } from "multer";
import type { Express, Request } from "express";
import { AttachmentsService, MAX_ATTACHMENT_BYTES } from "../../cards/attachments.service";
import { PrismaService } from "../../prisma/prisma.service";
import { UPLOAD_LINK_PATH, UploadLinkService } from "./upload-link.service";

type LinkRequest = Request & { uploadUserId?: string };

/**
 * Checks the link before anything else runs: guards come before interceptors,
 * so a forged or expired link is turned away before multer buffers up to 30MB.
 * The account must still be active — a link outliving a deactivation is dead.
 */
@Injectable()
class UploadLinkGuard implements CanActivate {
  constructor(
    private readonly links: UploadLinkService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<LinkRequest>();
    const userId = await this.links.verify(String(req.params.token ?? ""));
    const user = userId ? await this.prisma.user.findUnique({ where: { id: userId }, select: { isActive: true } }) : null;
    if (!userId || !user?.isActive) {
      throw new UnauthorizedException("This upload link is invalid or expired — ask Claude for a new one");
    }
    req.uploadUserId = userId;
    return true;
  }
}

/**
 * `POST /mcp-uploads/:token` — first half of attaching a file over MCP
 * (docs/15-mcp-server.md). The `create_upload_link` tool hands out the URL;
 * the client posts the file here as multipart field `file` and gets back an
 * `uploadId`, which `add_attachment` turns into an attachment. Outside `/mcp`
 * on purpose: everything under `/mcp` requires the MCP bearer token, which is
 * exactly what the model's own tools don't have.
 */
@ApiExcludeController()
@Controller(UPLOAD_LINK_PATH)
export class McpUploadsController {
  constructor(private readonly attachments: AttachmentsService) {}

  @Post(":token")
  @UseGuards(UploadLinkGuard)
  @UseInterceptors(FileInterceptor("file", { storage: memoryStorage(), limits: { fileSize: MAX_ATTACHMENT_BYTES } }))
  upload(@Req() req: LinkRequest, @UploadedFile() file?: Express.Multer.File) {
    if (!file) throw new BadRequestException('Send the file as multipart/form-data in a field named "file"');
    return this.attachments.stage(req.uploadUserId!, file);
  }
}

export { UploadLinkGuard };
