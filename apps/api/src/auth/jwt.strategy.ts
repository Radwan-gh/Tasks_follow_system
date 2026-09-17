import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PassportStrategy } from "@nestjs/passport";
import { ExtractJwt, Strategy } from "passport-jwt";

interface AccessTokenPayload {
  sub: string;
  /** Absent on tokens issued before login moved from email to username. */
  username?: string;
  role?: "USER" | "ADMIN";
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
    // Tokens issued before the role claim existed degrade to USER. An
    // email-era token has no `username` claim; nothing reads it off the request
    // (authorization keys off `id`), so those keep working until they expire.
    return { id: payload.sub, username: payload.username ?? "", role: payload.role ?? "USER" };
  }
}
