import { Body, Controller, Headers, HttpCode, Inject, Post, UsePipes } from "@nestjs/common";
import { z } from "zod";

import { ZodValidationPipe } from "../validation/zod-validation.pipe.js";
import { AuthService } from "./auth.service.js";
import type { AuthUser } from "./auth.service.js";

const emailSchema = z.string().email().max(200);
const registerSchema = z.object({
  email: emailSchema,
  password: z.string().min(8).max(200),
});
const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1).max(200),
});

type RegisterBody = z.infer<typeof registerSchema>;
type LoginBody = z.infer<typeof loginSchema>;

@Controller("api/auth")
export class AuthController {
  constructor(@Inject(AuthService) private readonly auth: AuthService) {}

  /**
   * Crée un compte candidat. Le rôle `operator` ne se demande pas ici : il est
   * attribué hors API (seed), pour qu'une inscription publique ne puisse pas
   * ouvrir l'administration.
   */
  @Post("register")
  @HttpCode(201)
  @UsePipes(new ZodValidationPipe(registerSchema))
  register(@Body() body: RegisterBody): Promise<AuthUser> {
    return this.auth.register(body.email, body.password, "CANDIDATE");
  }

  /** Ouvre une session et rend le jeton au client (jamais stocké en clair). */
  @Post("login")
  @HttpCode(200)
  @UsePipes(new ZodValidationPipe(loginSchema))
  login(@Body() body: LoginBody): Promise<{ token: string; user: AuthUser }> {
    return this.auth.login(body.email, body.password);
  }

  /** Révoque la session portée par l'en-tête d'autorisation. */
  @Post("logout")
  @HttpCode(200)
  async logout(@Headers("authorization") authorization?: string): Promise<void> {
    const token = authorization?.startsWith("Bearer ")
      ? authorization.slice("Bearer ".length)
      : null;
    if (token !== null) {
      await this.auth.logout(token);
    }
  }
}
