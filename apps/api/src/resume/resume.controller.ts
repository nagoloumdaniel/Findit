import { Body, Controller, HttpCode, Inject, Post, UseGuards, UsePipes } from "@nestjs/common";
import { z } from "zod";

import { ProfileKeyGuard } from "../profile/profile.controller.js";
import { ZodValidationPipe } from "../validation/zod-validation.pipe.js";
import { ResumeService } from "./resume.service.js";
import type { ResumeImportResult } from "./resume.service.js";

const resumeImportSchema = z.object({
  fileName: z.string().min(1).max(255),
  mimeType: z.string().min(1).max(200),
  contentBase64: z.string().min(1),
});

type ResumeImportBody = z.infer<typeof resumeImportSchema>;

@Controller("api/resume")
@UseGuards(ProfileKeyGuard)
export class ResumeController {
  /*
   * Dépendance nommée explicitement (voir `jobs.controller.ts`) : sans
   * `emitDecoratorMetadata` en développement, Nest n'a rien à injecter sinon.
   */
  constructor(@Inject(ResumeService) private readonly resume: ResumeService) {}

  /**
   * Structure un CV reçu en base64, sans rien écrire : l'appelant relit les
   * faits puis valide via le `PUT` du profil. Rien n'est créé : 200, pas le 201
   * par défaut d'un POST.
   */
  @Post("import")
  @HttpCode(200)
  @UsePipes(new ZodValidationPipe(resumeImportSchema))
  import(@Body() body: ResumeImportBody): Promise<ResumeImportResult> {
    return this.resume.import(body);
  }
}
