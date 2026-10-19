import { Body, Controller, HttpCode, Inject, Post, Res, UseGuards, UsePipes } from "@nestjs/common";
import { isValidHexColor } from "@findit/documents";
import type { FastifyReply } from "fastify";
import { z } from "zod";

import { ProfileKeyGuard } from "../profile/profile.controller.js";
import { ZodValidationPipe } from "../validation/zod-validation.pipe.js";
import { DocumentsService } from "./documents.service.js";
import type { DocumentFile } from "./documents.service.js";

/*
 * Un slug d'offre vient de la base : le motif refuse tout ce qui n'a pas cette
 * forme avant que la valeur n'atteigne Prisma, comme `matching.controller.ts`.
 */
const jobSlugSchema = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z0-9-]+$/, "Slug invalide");

const cvBodySchema = z.object({
  jobSlug: jobSlugSchema,
  template: z.enum(["classique", "moderne", "compact"]).optional(),
  showPhoto: z.boolean().optional(),
  photoDataUrl: z.string().nullable().optional(),
  accentColor: z
    .string()
    .refine((value) => isValidHexColor(value), "Couleur hexadécimale #rrggbb attendue")
    .optional(),
  format: z.enum(["pdf", "docx"]).optional(),
});

const letterBodySchema = z.object({
  jobSlug: jobSlugSchema,
  accentColor: z
    .string()
    .refine((value) => isValidHexColor(value), "Couleur hexadécimale #rrggbb attendue")
    .optional(),
  format: z.enum(["pdf", "docx"]).optional(),
});

type CvBody = z.infer<typeof cvBodySchema>;
type LetterBody = z.infer<typeof letterBodySchema>;

/**
 * Envoie un fichier en pièce jointe : l'en-tête `Content-Disposition` porte le
 * nom du fichier, le corps est le `Buffer` rendu par le service. `passthrough`
 * garde le retour du contrôleur comme corps de réponse, sans court-circuiter
 * la sérialisation de Fastify.
 */
const sendFile = (reply: FastifyReply, file: DocumentFile): Buffer => {
  reply.header("content-type", file.contentType);
  reply.header("content-disposition", `attachment; filename="${file.fileName}"`);
  return file.buffer;
};

@Controller("api/documents")
@UseGuards(ProfileKeyGuard)
export class DocumentsController {
  /*
   * Dépendance nommée explicitement (voir `jobs.controller.ts`) : sans
   * `emitDecoratorMetadata` en développement, Nest n'a rien à injecter sinon.
   */
  constructor(@Inject(DocumentsService) private readonly documents: DocumentsService) {}

  /** Rend le CV du profil pour une offre, en PDF ou DOCX. */
  @Post("cv")
  @HttpCode(200)
  @UsePipes(new ZodValidationPipe(cvBodySchema))
  async cv(@Body() body: CvBody, @Res({ passthrough: true }) reply: FastifyReply): Promise<Buffer> {
    return sendFile(reply, await this.documents.generateCv(body));
  }

  /** Génère et rend la lettre de motivation pour une offre, en PDF ou DOCX. */
  @Post("letter")
  @HttpCode(200)
  @UsePipes(new ZodValidationPipe(letterBodySchema))
  async letter(
    @Body() body: LetterBody,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<Buffer> {
    return sendFile(reply, await this.documents.generateLetter(body));
  }
}
