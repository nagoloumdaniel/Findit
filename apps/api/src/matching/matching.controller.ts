import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  NotFoundException,
  Param,
  Post,
  UsePipes,
} from "@nestjs/common";
import { z } from "zod";

import { ZodValidationPipe } from "../validation/zod-validation.pipe.js";
import { MatchingService } from "./matching.service.js";
import type { MatchItem, MatchingRunDetail, MatchingRunSummary } from "./matching.service.js";

const scoreBodySchema = z.object({ cvText: z.string().min(1) });

type ScoreBody = z.infer<typeof scoreBodySchema>;

/*
 * Les identifiants de matching viennent de la base (UUID ou cuid) : le motif
 * refuse tout ce qui n'a pas cette forme avant que la valeur n'atteigne
 * Prisma, comme le fait `jobSlugSchema` pour les offres.
 */
const matchingRunIdSchema = z.object({
  id: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[A-Za-z0-9-]+$/, "Identifiant invalide"),
});

type MatchingRunId = z.infer<typeof matchingRunIdSchema>;

@Controller("api/matching")
export class MatchingController {
  /*
   * La dépendance est nommée explicitement (voir `jobs.controller.ts`) : sans
   * `emitDecoratorMetadata` en développement, Nest n'a rien à injecter sinon.
   */
  constructor(@Inject(MatchingService) private readonly matching: MatchingService) {}

  /*
   * `POST` crée 201 par défaut dans Nest, mais cette route ne crée aucune
   * ressource : elle rend un calcul. 200 dit ce qui se passe réellement.
   */
  @Post("score")
  @HttpCode(200)
  @UsePipes(new ZodValidationPipe(scoreBodySchema))
  score(@Body() body: ScoreBody): Promise<MatchItem[]> {
    return this.matching.score(body.cvText);
  }

  /** Matchings passés, du plus récent au plus ancien, sans le CV. */
  @Get("history")
  history(): Promise<MatchingRunSummary[]> {
    return this.matching.history();
  }

  /**
   * Un matching passé, avec le CV soumis et ses résultats.
   *
   * Un identifiant inconnu rend 404, comme `GET /api/agent/runs/:id` : même
   * API, même contrat pour la même situation.
   */
  @Get("history/:id")
  async historyDetail(
    @Param(new ZodValidationPipe(matchingRunIdSchema)) params: MatchingRunId,
  ): Promise<MatchingRunDetail> {
    const detail = await this.matching.historyDetail(params.id);

    if (detail === null) {
      throw new NotFoundException("Ce matching n'existe pas.");
    }

    return detail;
  }
}
