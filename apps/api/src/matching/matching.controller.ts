import {
  ConflictException,
  Controller,
  Get,
  HttpCode,
  Inject,
  NotFoundException,
  Param,
  Post,
  UseGuards,
  UsePipes,
} from "@nestjs/common";

import { ZodValidationPipe } from "../validation/zod-validation.pipe.js";
import { WorkspaceGuard } from "../workspace/workspace.guard.js";
import { matchListParamsSchema, matchParamsSchema } from "./matching-input.js";
import type { MatchListParams, MatchParams } from "./matching-input.js";
import { MatchingService, ResumeNotStructuredError } from "./matching.service.js";
import type { MatchView } from "./matching.service.js";

/**
 * Correspondance CV/offre de l'espace privé. Le calcul est déterministe et se
 * rejoue à volonté : POST remplace le score courant du couple au lieu d'en
 * empiler un nouveau, d'où le 200 plutôt qu'un 201.
 */
@Controller("api/resumes/:id/matches")
@UseGuards(WorkspaceGuard)
export class MatchingController {
  constructor(@Inject(MatchingService) private readonly matching: MatchingService) {}

  @Post(":slug")
  @HttpCode(200)
  @UsePipes(new ZodValidationPipe(matchParamsSchema))
  async compute(@Param() params: MatchParams): Promise<MatchView> {
    try {
      const result = await this.matching.compute(params.id, params.slug);
      if (result === "resume_not_found") {
        throw new NotFoundException("CV introuvable.");
      }
      if (result === "job_not_found") {
        throw new NotFoundException("Offre introuvable ou non publiée.");
      }
      return result;
    } catch (error) {
      if (error instanceof ResumeNotStructuredError) {
        throw new ConflictException(error.message);
      }
      throw error;
    }
  }

  /** « Faire matcher mon CV » : score contre toutes les offres publiées. */
  @Post()
  @HttpCode(200)
  @UsePipes(new ZodValidationPipe(matchListParamsSchema))
  async computeAll(@Param() params: MatchListParams): Promise<MatchView[]> {
    try {
      const result = await this.matching.computeAll(params.id);
      if (result === "resume_not_found") {
        throw new NotFoundException("CV introuvable.");
      }
      return result;
    } catch (error) {
      if (error instanceof ResumeNotStructuredError) {
        throw new ConflictException(error.message);
      }
      throw error;
    }
  }

  @Get()
  @UsePipes(new ZodValidationPipe(matchListParamsSchema))
  async list(@Param() params: MatchListParams): Promise<MatchView[]> {
    const result = await this.matching.list(params.id);
    if (result === "resume_not_found") {
      throw new NotFoundException("CV introuvable.");
    }
    return result;
  }
}
