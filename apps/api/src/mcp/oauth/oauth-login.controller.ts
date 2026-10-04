import { Body, Controller, ForbiddenException, HttpCode, Post, Res, UnauthorizedException } from "@nestjs/common";
import { ApiExcludeController } from "@nestjs/swagger";
import type { Response } from "express";
import { AuthService } from "../../auth/auth.service";
import { renderLoginPage } from "./login-page";
import { McpOAuthProvider, OAUTH_LOGIN_PATH } from "./oauth.provider";

interface LoginForm {
  request?: string;
  username?: string;
  password?: string;
}

/**
 * The form on the MCP login page (`McpOAuthProvider.authorize`) posts here.
 * Credentials are checked by `AuthService.validateCredentials` — the same rules
 * as the apps' sign-in — and on success the browser is sent back to the MCP
 * client with a single-use authorization code.
 */
@ApiExcludeController()
@Controller()
export class OAuthLoginController {
  constructor(
    private readonly provider: McpOAuthProvider,
    private readonly auth: AuthService,
  ) {}

  @Post(OAUTH_LOGIN_PATH)
  @HttpCode(200)
  async login(@Body() form: LoginForm, @Res() res: Response) {
    const pending = form.request ? await this.provider.verifyPendingAuthorization(form.request) : null;
    if (!pending) {
      res.status(400).type("text/plain; charset=utf-8").send("انتهت صلاحية طلب الربط. ابدأ الربط من جديد من التطبيق.");
      return;
    }

    const rerender = (error: string) =>
      res
        .status(200)
        .type("html")
        .setHeader("Cache-Control", "no-store")
        .send(
          renderLoginPage({
            clientName: pending.clientName,
            requestToken: form.request!,
            action: OAUTH_LOGIN_PATH,
            username: form.username,
            error,
          }),
        );

    let user;
    try {
      user = await this.auth.validateCredentials({ username: form.username ?? "", password: form.password ?? "" });
    } catch (err) {
      if (err instanceof UnauthorizedException) return rerender("اسم المستخدم أو كلمة المرور غير صحيحة.");
      if (err instanceof ForbiddenException) return rerender("هذا الحساب معطّل.");
      throw err;
    }
    // A temporary admin-issued password must be replaced in the app first —
    // the same gate the apps put in front of everything else.
    if (user.mustChangePassword) {
      return rerender("عيّن كلمة مرور جديدة من تطبيق غِراس أولًا، ثم أعد المحاولة.");
    }

    res.setHeader("Cache-Control", "no-store");
    res.redirect(302, await this.provider.completeAuthorization(pending, user.id));
  }
}
