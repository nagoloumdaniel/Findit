import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  NotFoundException,
  Param,
  Patch,
  Post,
  UseGuards,
} from "@nestjs/common";

import { ZodValidationPipe } from "../validation/zod-validation.pipe.js";
import { WorkspaceGuard } from "../workspace/workspace.guard.js";
import {
  applicationIdSchema,
  createApplicationSchema,
  updateApplicationSchema,
} from "./applications-input.js";
import type {
  ApplicationIdParam,
  CreateApplicationInput,
  UpdateApplicationInput,
} from "./applications-input.js";
import { ApplicationsService } from "./applications.service.js";
import type { ApplicationView } from "./applications.service.js";

/**
 * Suivi des candidatures de l'espace privé. Le dossier photographie l'offre,
 * le score et la lettre au moment de candidater ; il survit à l'expiration de
 * l'offre et à la purge du CV, et chaque changement de statut s'historise.
 */
@Controller("api/applications")
@UseGuards(WorkspaceGuard)
export class ApplicationsController {
  constructor(@Inject(ApplicationsService) private readonly applications: ApplicationsService) {}

  @Post()
  async create(
    @Body(new ZodValidationPipe(createApplicationSchema)) input: CreateApplicationInput,
  ): Promise<ApplicationView> {
    const result = await this.applications.create(input);
    if (result === "job_not_found") {
      throw new NotFoundException("Offre introuvable.");
    }
    return result;
  }

  @Get()
  list(): Promise<ApplicationView[]> {
    return this.applications.list();
  }

  @Patch(":id")
  async update(
    @Param(new ZodValidationPipe(applicationIdSchema)) params: ApplicationIdParam,
    @Body(new ZodValidationPipe(updateApplicationSchema)) input: UpdateApplicationInput,
  ): Promise<ApplicationView> {
    const result = await this.applications.update(params.id, input);
    if (result === null) {
      throw new NotFoundException("Candidature introuvable.");
    }
    return result;
  }

  @Delete(":id")
  @HttpCode(204)
  async remove(
    @Param(new ZodValidationPipe(applicationIdSchema)) params: ApplicationIdParam,
  ): Promise<void> {
    const removed = await this.applications.remove(params.id);
    if (!removed) {
      throw new NotFoundException("Candidature introuvable.");
    }
  }
}
