import { Controller, Get, NotFoundException, Param, Res } from "@nestjs/common";
import { ApiExcludeController } from "@nestjs/swagger";
import type { Response } from "express";
import { AttachmentStorageService, SIGNED_URL_TTL_SECONDS } from "../common/storage/attachment-storage.service";
import { setUploadHeaders } from "../common/util/uploads.util";

/**
 * `GET /uploads/<stored filename>` — the URL every `Attachment.url` points at.
 * Public, no auth: the UUID in the name is the access control, so `<img>` and
 * React Native's `<Image>` can load it without attaching a token. In bucket
 * mode it 302s to a short-lived signed URL; on local disk it sends the file.
 */
@ApiExcludeController()
@Controller("uploads")
export class UploadsController {
  constructor(private readonly storage: AttachmentStorageService) {}

  @Get(":filename")
  async serve(@Param("filename") filename: string, @Res() res: Response) {
    // Express decodes `%2F` inside a param — a key never contains a separator.
    if (/[\\/]/.test(filename)) throw new NotFoundException();

    const stored = await this.storage.resolve(filename);
    if (!stored) throw new NotFoundException();

    if (stored.kind === "redirect") {
      // Let clients reuse the redirect for a while, but well inside the signature's lifetime.
      res.setHeader("Cache-Control", `private, max-age=${Math.floor(SIGNED_URL_TTL_SECONDS / 2)}`);
      res.redirect(302, stored.url);
      return;
    }
    setUploadHeaders(res, stored.path);
    res.sendFile(stored.path);
  }
}
