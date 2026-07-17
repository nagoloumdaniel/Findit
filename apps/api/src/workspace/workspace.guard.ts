import { Inject, Injectable, UnauthorizedException } from "@nestjs/common";
import type { CanActivate, ExecutionContext } from "@nestjs/common";
import type { FastifyRequest } from "fastify";

import { WORKSPACE_KEY_HEADER, workspaceKeyMatches } from "./workspace-key.js";

/** Jeton d'injection du secret de l'espace privé. */
export const WORKSPACE_SECRET = Symbol("WORKSPACE_SECRET");

/**
 * Protège les routes de l'espace privé. Sans la clé attendue dans l'en-tête,
 * la requête est refusée avant d'atteindre le contrôleur — aucune donnée privée
 * ne sort sans elle.
 *
 * Le refus ne dit jamais *pourquoi* il refuse : un message unique, quelle que
 * soit la raison, pour ne rien révéler du secret ni de sa longueur.
 */
@Injectable()
export class WorkspaceGuard implements CanActivate {
  constructor(@Inject(WORKSPACE_SECRET) private readonly secret: string) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<FastifyRequest>();
    const header = request.headers[WORKSPACE_KEY_HEADER];
    const provided = Array.isArray(header) ? header[0] : header;

    if (!workspaceKeyMatches(provided, this.secret)) {
      throw new UnauthorizedException("Accès à l'espace privé refusé.");
    }

    return true;
  }
}
