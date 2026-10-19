import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Param,
  Post,
  UseGuards,
} from "@nestjs/common";
import { z } from "zod";

import { CurrentUser, SessionGuard } from "../auth/auth.guard.js";
import type { AuthUser } from "../auth/auth.service.js";
import { ZodValidationPipe } from "../validation/zod-validation.pipe.js";
import { ResumeService } from "./resume.service.js";
import type { ResumeImportResult, ResumeSummary } from "./resume.service.js";

const resumeImportSchema = z.object({
  fileName: z.string().min(1).max(255),
  mimeType: z.string().min(1).max(200),
  contentBase64: z.string().min(1),
});

const resumeIdSchema = z.object({
  id: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[A-Za-z0-9-]+$/, "Identifiant invalide"),
});

type ResumeImportBody = z.infer<typeof resumeImportSchema>;
type ResumeId = z.infer<typeof resumeIdSchema>;

@Controller("api/resume")
@UseGuards(SessionGuard)
export class ResumeController {
  /*
   * Dépendance nommée explicitement (voir `jobs.controller.ts`) : sans
   * `emitDecoratorMetadata` en développement, Nest n'a rien à injecter sinon.
   */
  constructor(@Inject(ResumeService) private readonly resume: ResumeService) {}

  /**
   * Structure un CV reçu en base64 et le conserve comme version active. Rien
   * n'est « créé » au sens REST : le contrat reste un calcul + une persistance
   * de données personnelles, donc 200, pas le 201 par défaut d'un POST.
   */
  @Post("import")
  @HttpCode(200)
  import(
    @Body(new ZodValidationPipe(resumeImportSchema)) body: ResumeImportBody,
    @CurrentUser() user: AuthUser | null,
  ): Promise<ResumeImportResult> {
    return this.resume.import(body, user?.id ?? null);
  }

  /** Liste les CV conservés, sans leur contenu. */
  @Get()
  list(@CurrentUser() user: AuthUser | null): Promise<ResumeSummary[]> {
    return this.resume.list(user?.id ?? null);
  }

  /** Fait d'un CV la version de référence. */
  @Post(":id/activate")
  @HttpCode(200)
  activate(
    @Param(new ZodValidationPipe(resumeIdSchema)) params: ResumeId,
    @CurrentUser() user: AuthUser | null,
  ): Promise<void> {
    return this.resume.activate(params.id, user?.id ?? null);
  }

  /** Supprime un CV conservé. */
  @Delete(":id")
  @HttpCode(200)
  remove(
    @Param(new ZodValidationPipe(resumeIdSchema)) params: ResumeId,
    @CurrentUser() user: AuthUser | null,
  ): Promise<void> {
    return this.resume.remove(params.id, user?.id ?? null);
  }
}
