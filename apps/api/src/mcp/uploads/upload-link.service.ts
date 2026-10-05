import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import { mcpUrls } from "../mcp.config";

/** How long an upload link from `create_upload_link` accepts files. */
export const UPLOAD_LINK_TTL_SECONDS = 15 * 60;
export const UPLOAD_LINK_PATH = "mcp-uploads";

/**
 * Signs and checks the token inside an MCP upload link
 * (`POST /mcp-uploads/:token`). The link stands in for the MCP access token,
 * which the model's own tools (a shell, code execution) never see: whoever
 * holds the link can stage files as that user for `UPLOAD_LINK_TTL_SECONDS`,
 * and nothing more — a staged file still goes through `add_attachment`'s
 * checks before it lands on a card. Signed with a key distinct from every
 * other token's, so it is never a usable JWT elsewhere.
 */
@Injectable()
export class UploadLinkService {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  async create(userId: string): Promise<{ uploadUrl: string; expiresAt: string }> {
    const token = await this.jwt.signAsync({ sub: userId }, { secret: this.secret(), expiresIn: UPLOAD_LINK_TTL_SECONDS });
    return {
      uploadUrl: new URL(`${UPLOAD_LINK_PATH}/${token}`, mcpUrls(this.config).issuer).toString(),
      expiresAt: new Date(Date.now() + UPLOAD_LINK_TTL_SECONDS * 1000).toISOString(),
    };
  }

  /** The user the link was issued to, or `null` if it is forged or expired. */
  async verify(token: string): Promise<string | null> {
    try {
      const { sub } = await this.jwt.verifyAsync<{ sub: string }>(token, { secret: this.secret() });
      return sub;
    } catch {
      return null;
    }
  }

  private secret(): string {
    return `${this.config.getOrThrow<string>("JWT_ACCESS_SECRET")}:mcp-upload-link`;
  }
}
