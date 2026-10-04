import { Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PassportStrategy } from "@nestjs/passport";
import { ExtractJwt, Strategy } from "passport-jwt";

interface AccessTokenPayload {
  sub: string;
  /** Absent on tokens issued before login moved from email to username. */
  username?: string;
  role?: "USER" | "ADMIN";
  /** Only set on tokens issued to an MCP client — see `OAuthGrant` in auth.service.ts. */
  aud?: string | string[];
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(config: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.getOrThrow<string>("JWT_ACCESS_SECRET"),
    });
  }

  async validate(payload: AccessTokenPayload) {
    // An audience-bound token was issued to an MCP client for `/mcp` only;
    // the REST API accepts nothing but the apps' own (audience-less) tokens.
    if (payload.aud !== undefined) throw new UnauthorizedException();
    // Tokens issued before the role claim existed degrade to USER. An
    // email-era token has no `username` claim; nothing reads it off the request
    // (authorization keys off `id`), so those keep working until they expire.
    return { id: payload.sub, username: payload.username ?? "", role: payload.role ?? "USER" };
  }
}
