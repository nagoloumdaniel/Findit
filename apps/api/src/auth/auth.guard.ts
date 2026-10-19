import {
  type CanActivate,
  type ExecutionContext,
  createParamDecorator,
  ForbiddenException,
  Inject,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";

import { AuthService } from "./auth.service.js";
import type { AuthUser } from "./auth.service.js";

/** Vue minimale de la requête : l'en-tête d'autorisation et l'utilisateur attaché. */
export interface AuthenticatedRequest {
  readonly headers: Record<string, string | string[] | undefined>;
  user?: AuthUser;
}

/** Lit le jeton `Authorization: Bearer ...` et attache l'utilisateur à la requête. */
@Injectable()
export class SessionGuard implements CanActivate {
  constructor(@Inject(AuthService) private readonly auth: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const header = request.headers["authorization"];
    const token =
      typeof header === "string" && header.startsWith("Bearer ")
        ? header.slice("Bearer ".length)
        : null;
    if (token === null) {
      throw new UnauthorizedException("Session requise.");
    }
    const user = await this.auth.authenticate(token);
    if (user === null) {
      throw new UnauthorizedException("Session invalide ou expirée.");
    }
    request.user = user;
    return true;
  }
}

/** Exige le rôle `OPERATOR`, après une authentification par `SessionGuard`. */
@Injectable()
export class OperatorGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (request.user?.role !== "OPERATOR") {
      throw new ForbiddenException("Rôle operator requis.");
    }
    return true;
  }
}

/**
 * Paramètre de contrôleur : l'utilisateur authentifié par `SessionGuard`, ou
 * `null` quand aucune session n'a été posée (historique antérieur aux comptes).
 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthUser | null => {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    return request.user ?? null;
  },
);
