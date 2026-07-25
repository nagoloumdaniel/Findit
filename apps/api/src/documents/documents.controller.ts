import {
  ConflictException,
  Controller,
  Get,
  Inject,
  NotFoundException,
  Param,
  StreamableFile,
  UseGuards,
  UsePipes,
} from "@nestjs/common";

import { ZodValidationPipe } from "../validation/zod-validation.pipe.js";
import { WorkspaceGuard } from "../workspace/workspace.guard.js";
import { resumeIdSchema } from "../resume/resume-input.js";
import type { ResumeIdParam } from "../resume/resume-input.js";
import { DocumentsService, ResumeNotStructuredForDocumentError } from "./documents.service.js";

/**
 * Export des documents de candidature de l'espace privé. Le rendu est
 * déterministe et se rejoue à volonté : rien n'est stocké, le PDF se
 * regénère des faits structurés à chaque appel.
 */
@Controller("api/resumes/:id/documents")
@UseGuards(WorkspaceGuard)
export class DocumentsController {
  constructor(@Inject(DocumentsService) private readonly documents: DocumentsService) {}

  @Get("cv.pdf")
  @UsePipes(new ZodValidationPipe(resumeIdSchema))
  async cv(@Param() params: ResumeIdParam): Promise<StreamableFile> {
    try {
      const result = await this.documents.renderCv(params.id);
      if (result === null) {
        throw new NotFoundException("CV introuvable.");
      }
      return new StreamableFile(result.pdf, {
        type: "application/pdf",
        disposition: `attachment; filename="${result.fileName}"`,
      });
    } catch (error) {
      if (error instanceof ResumeNotStructuredForDocumentError) {
        throw new ConflictException(error.message);
      }
      throw error;
    }
  }
}
