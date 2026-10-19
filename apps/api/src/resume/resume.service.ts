import { computeCostMicroUsd, createDeepSeekModel } from "@findit/ai";
import { parseApiEnv } from "@findit/config";
import type { PrismaClient } from "@findit/database";
import { BadRequestException, Inject, Injectable, Logger } from "@nestjs/common";

import { PRISMA_CLIENT } from "../prisma/prisma.module.js";
import { extractResumeText, resumeFileType, ResumeExtractionError } from "./extract-text.js";
import {
  sanitizeDatesAgainstSource,
  structuredResumeSchema,
  type ResumeFacts,
} from "./structured-resume.js";

/** Ce que les appels de structuration écrivent dans `ModelCall`. */
const RESUME_IMPORT_PURPOSE = "resume-import";

/** Plafond de taille du fichier reçu, en octets (5 Mo). */
const MAX_RESUME_BYTES = 5 * 1024 * 1024;

/** Corps attendu de `POST /api/resume/import`. */
export type ResumeImportInput = {
  fileName: string;
  mimeType: string;
  contentBase64: string;
};

/**
 * Faits structurés d'un CV, rendus à l'appelant sans rien écrire en base.
 * L'utilisateur relit puis valide via le `PUT` du profil.
 */
export type ResumeImportResult = {
  facts: ResumeFacts;
  confidence: number;
  warnings: string[];
};

/*
 * Consigne d'extraction : la structuration ne doit rien inventer. Tout ce qui
 * n'est pas écrit dans le CV reste absent ; les dates sont recopiées telles
 * quelles, jamais complétées en une précision que la source ne donne pas.
 */
const RESUME_SYSTEM = [
  "Tu extrais les faits d'un CV en JSON, en français, sans rien inventer.",
  "Un fait absent du texte reste absent : ne complète ni nom, ni date, ni compétence, ni entreprise, ni école.",
  "Recopie les dates telles qu'elles sont écrites, jamais une précision que la source ne donne pas.",
].join(" ");

@Injectable()
export class ResumeService {
  readonly #logger = new Logger(ResumeService.name);

  constructor(@Inject(PRISMA_CLIENT) private readonly prisma: PrismaClient) {}

  /**
   * Importe un CV (PDF/DOCX/TXT) : extrait le texte, le structure en faits, et
   * rend ces faits avec un score de confiance, sans écrire en base.
   *
   * Le garde-fou anti-invention opère deux fois : la consigne interdit
   * d'inventer, puis `sanitizeDatesAgainstSource` retire ou réduit toute date
   * que la source n'écrit pas. Le coût du modèle est journalisé dans
   * `ModelCall`.
   */
  async import(input: ResumeImportInput): Promise<ResumeImportResult> {
    const fileType = resumeFileType(input.mimeType, input.fileName);
    if (fileType === null) {
      throw new BadRequestException(
        "Type de fichier non pris en charge : envoyer un PDF, un DOCX ou un TXT.",
      );
    }

    const buffer = Buffer.from(input.contentBase64, "base64");
    if (buffer.length === 0) {
      throw new BadRequestException("Le fichier est vide ou le contenu base64 est illisible.");
    }
    if (buffer.length > MAX_RESUME_BYTES) {
      throw new BadRequestException("Le fichier dépasse la taille maximale de 5 Mo.");
    }

    let text: string;
    try {
      text = await extractResumeText(buffer, fileType);
    } catch (error) {
      if (error instanceof ResumeExtractionError) {
        throw new BadRequestException(error.message);
      }
      throw error;
    }

    const env = parseApiEnv(process.env);
    const model = createDeepSeekModel({ apiKey: env.DEEPSEEK_API_KEY, model: env.DEEPSEEK_MODEL });
    const usageBefore = model.usage();

    try {
      const structured = await model.generateStructured({
        schema: structuredResumeSchema,
        system: RESUME_SYSTEM,
        prompt: text,
      });

      const sanitized = sanitizeDatesAgainstSource(structured.facts, text);

      return {
        facts: sanitized.facts,
        confidence: structured.confidence,
        warnings: [...structured.warnings, ...sanitized.warnings],
      };
    } finally {
      await this.#recordModelCall(model, usageBefore, env);
    }
  }

  /**
   * Écrit une ligne `ModelCall` pour ce que la requête a consommé. Un échec
   * d'écriture est journalisé mais ne fait pas échouer la requête : l'appelant
   * a ses faits, le coût manquant se voit dans les logs.
   */
  async #recordModelCall(
    model: ReturnType<typeof createDeepSeekModel>,
    before: ReturnType<ReturnType<typeof createDeepSeekModel>["usage"]>,
    env: ReturnType<typeof parseApiEnv>,
  ): Promise<void> {
    const usage = model.usage();
    const inputTokens = Math.max(0, usage.inputTokens - before.inputTokens);
    const outputTokens = Math.max(0, usage.outputTokens - before.outputTokens);

    try {
      await this.prisma.modelCall.create({
        data: {
          purpose: RESUME_IMPORT_PURPOSE,
          model: env.DEEPSEEK_MODEL,
          inputTokens,
          outputTokens,
          costMicroUsd: computeCostMicroUsd(
            { inputTokens, outputTokens, calls: Math.max(0, usage.calls - before.calls) },
            {
              inputUsdPerMillionTokens: env.DEEPSEEK_INPUT_USD_PER_MTOK ?? 0,
              outputUsdPerMillionTokens: env.DEEPSEEK_OUTPUT_USD_PER_MTOK ?? 0,
            },
          ),
        },
      });
    } catch (error) {
      this.#logger.error(
        `Coût de l'import non journalisé : ${error instanceof Error ? error.message : "inconnu"}`,
      );
    }
  }
}
