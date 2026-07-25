import { AiDisabledError, AiOutputError, AiUnavailableError } from "@findit/ai";
import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  NotFoundException,
  Param,
  Post,
  Req,
  ServiceUnavailableException,
  UseGuards,
  UsePipes,
} from "@nestjs/common";
import type { FastifyRequest } from "fastify";

import { ZodValidationPipe } from "../validation/zod-validation.pipe.js";
import { WorkspaceGuard } from "../workspace/workspace.guard.js";
import { resumeFileType } from "./extract-text.js";
import type { ResumeDetail, ResumeSummary } from "./resume.service.js";
import { ResumeService } from "./resume.service.js";
import { resumeIdSchema } from "./resume-input.js";
import type { ResumeIdParam } from "./resume-input.js";

/**
 * Le CV source du propriétaire. Toutes les routes sont derrière la clé de
 * l'espace privé : un CV ne se lit ni ne s'importe sans elle.
 */
@Controller("api/resumes")
@UseGuards(WorkspaceGuard)
export class ResumeController {
  constructor(@Inject(ResumeService) private readonly resumes: ResumeService) {}

  @Post("upload")
  async upload(@Req() request: FastifyRequest): Promise<ResumeDetail> {
    const file = await request.file();
    if (file === undefined) {
      throw new BadRequestException("Aucun fichier n'a été fourni.");
    }

    const fileType = resumeFileType(file.mimetype, file.filename);
    if (fileType === null) {
      throw new BadRequestException("Format non pris en charge : attendu PDF, DOCX ou TXT.");
    }

    const buffer = await file.toBuffer();

    // `@fastify/multipart` tronque au-delà de la limite : le drapeau le signale
    // plutôt que d'accepter un fichier amputé.
    if (file.file.truncated) {
      throw new BadRequestException("Le fichier dépasse la taille maximale autorisée.");
    }

    try {
      return await this.resumes.ingest(buffer, fileType, file.filename);
    } catch (error) {
      // Une extraction ratée est une entrée invalide, pas une panne serveur.
      const detail = error instanceof Error ? error.message : "Le fichier n'a pas pu être lu.";
      throw new BadRequestException(detail);
    }
  }

  @Get()
  list(): Promise<ResumeSummary[]> {
    return this.resumes.list();
  }

  @Get(":id")
  @UsePipes(new ZodValidationPipe(resumeIdSchema))
  async get(@Param() params: ResumeIdParam): Promise<ResumeDetail> {
    const resume = await this.resumes.get(params.id);
    if (resume === null) {
      throw new NotFoundException("CV introuvable.");
    }
    return resume;
  }

  @Delete(":id")
  @HttpCode(204)
  @UsePipes(new ZodValidationPipe(resumeIdSchema))
  async remove(@Param() params: ResumeIdParam): Promise<void> {
    const removed = await this.resumes.remove(params.id);
    if (!removed) {
      throw new NotFoundException("CV introuvable.");
    }
  }

  @Post(":id/structure")
  @UsePipes(new ZodValidationPipe(resumeIdSchema))
  async structure(@Param() params: ResumeIdParam): Promise<ResumeDetail> {
    try {
      const resume = await this.resumes.structure(params.id);
      if (resume === null) {
        throw new NotFoundException("CV introuvable.");
      }
      return resume;
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      if (error instanceof AiDisabledError) {
        throw new ConflictException(error.message);
      }
      if (error instanceof AiUnavailableError) {
        throw new ServiceUnavailableException(error.message);
      }
      if (error instanceof AiOutputError) {
        throw new BadGatewayException(error.message);
      }
      throw error;
    }
  }
}
