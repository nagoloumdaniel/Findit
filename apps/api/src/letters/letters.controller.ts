import { AiDisabledError, AiOutputError, AiUnavailableError } from "@findit/ai";
import {
  BadGatewayException,
  ConflictException,
  Controller,
  Get,
  HttpCode,
  Inject,
  NotFoundException,
  Param,
  Post,
  ServiceUnavailableException,
  StreamableFile,
  UseGuards,
  UsePipes,
} from "@nestjs/common";

import { ZodValidationPipe } from "../validation/zod-validation.pipe.js";
import { WorkspaceGuard } from "../workspace/workspace.guard.js";
import { letterListParamsSchema, letterParamsSchema } from "./letters-input.js";
import type { LetterListParams, LetterParams } from "./letters-input.js";
import {
  LetterInventsFactsError,
  LettersService,
  ResumeNotStructuredForLetterError,
} from "./letters.service.js";
import type { LetterView } from "./letters.service.js";

/**
 * Lettres de motivation de l'espace privé. POST régénère et remplace la
 * lettre du couple CV/offre - d'où le 200 - puis l'utilisateur la relit via
 * GET avant d'en tirer un PDF. Une sortie IA invalide ou qui cite des
 * compétences absentes du CV est refusée, jamais stockée.
 */
@Controller("api/resumes/:id/letters")
@UseGuards(WorkspaceGuard)
export class LettersController {
  constructor(@Inject(LettersService) private readonly letters: LettersService) {}

  @Post(":slug")
  @HttpCode(200)
  @UsePipes(new ZodValidationPipe(letterParamsSchema))
  async generate(@Param() params: LetterParams): Promise<LetterView> {
    try {
      const result = await this.letters.generate(params.id, params.slug);
      if (result === "resume_not_found") {
        throw new NotFoundException("CV introuvable.");
      }
      if (result === "job_not_found") {
        throw new NotFoundException("Offre introuvable ou non publiée.");
      }
      return result;
    } catch (error) {
      if (error instanceof ResumeNotStructuredForLetterError) {
        throw new ConflictException(error.message);
      }
      if (error instanceof AiDisabledError) {
        throw new ConflictException(error.message);
      }
      if (error instanceof AiUnavailableError) {
        throw new ServiceUnavailableException(error.message);
      }
      if (error instanceof AiOutputError || error instanceof LetterInventsFactsError) {
        throw new BadGatewayException(error.message);
      }
      throw error;
    }
  }

  @Get()
  @UsePipes(new ZodValidationPipe(letterListParamsSchema))
  async list(@Param() params: LetterListParams): Promise<LetterView[]> {
    const result = await this.letters.list(params.id);
    if (result === "resume_not_found") {
      throw new NotFoundException("CV introuvable.");
    }
    return result;
  }

  @Get(":slug/pdf")
  @UsePipes(new ZodValidationPipe(letterParamsSchema))
  async pdf(@Param() params: LetterParams): Promise<StreamableFile> {
    const result = await this.letters.renderPdf(params.id, params.slug);
    if (result === null) {
      throw new NotFoundException("Lettre introuvable pour ce CV et cette offre.");
    }
    return new StreamableFile(result.pdf, {
      type: "application/pdf",
      disposition: `attachment; filename="${result.fileName}"`,
    });
  }
}
