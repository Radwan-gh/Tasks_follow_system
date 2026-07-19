import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PassportStrategy } from "@nestjs/passport";
import { ExtractJwt, Strategy } from "passport-jwt";

interface AccessTokenPayload {
  sub: string;
  email: string;
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
    // Tokens issued before the role claim existed degrade to USER.
    return { id: payload.sub, email: payload.email, role: payload.role ?? "USER" };
  }
}
