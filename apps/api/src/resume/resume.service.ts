import { createHash } from "node:crypto";

import { computeCostMicroUsd, createDeepSeekModel } from "@findit/ai";
import { parseApiEnv } from "@findit/config";
import type { PrismaClient } from "@findit/database";
import { BadRequestException, Inject, Injectable, Logger, NotFoundException } from "@nestjs/common";

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
 * Faits structurés d'un CV, rendus à l'appelant avec l'identifiant du CV
 * conservé. L'utilisateur relit puis valide via le `PUT` du profil.
 */
export type ResumeImportResult = {
  resumeId: string;
  facts: ResumeFacts;
  confidence: number;
  warnings: string[];
};

/** Vue d'un CV conservé, sans le texte ni les faits complets. */
export type ResumeSummary = {
  id: string;
  fileName: string;
  fileType: string;
  confidence: number;
  active: boolean;
  createdAt: string;
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
   * le conserve comme version active. Il rend les faits avec un score de
   * confiance et l'identifiant de la version conservée.
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
      const warnings = [...structured.warnings, ...sanitized.warnings];

      const resumeId = await this.#persist(
        input,
        fileType,
        buffer,
        text,
        sanitized.facts,
        structured.confidence,
        warnings,
      );

      return {
        resumeId,
        facts: sanitized.facts,
        confidence: structured.confidence,
        warnings,
      };
    } finally {
      await this.#recordModelCall(model, usageBefore, env);
    }
  }

  /**
   * Conserve le CV importé comme version active, en désactivant les autres : un
   * seul CV de référence à la fois. Une réimportation du même fichier ne crée
   * pas de doublon détecté ici — le hash est conservé pour audit, pas dédupliqué.
   */
  async #persist(
    input: ResumeImportInput,
    fileType: string,
    buffer: Buffer,
    text: string,
    facts: ResumeFacts,
    confidence: number,
    warnings: string[],
  ): Promise<string> {
    const contentHash = createHash("sha256").update(buffer).digest("hex");
    return this.prisma.$transaction(async (tx) => {
      await tx.resume.updateMany({ where: { active: true }, data: { active: false } });
      const created = await tx.resume.create({
        data: {
          fileName: input.fileName,
          fileType,
          fileSize: buffer.length,
          contentHash,
          extractedText: text,
          structuredFacts: facts,
          confidence,
          warnings,
          active: true,
        },
        select: { id: true },
      });
      return created.id;
    });
  }

  /** Liste les CV conservés, du plus récent au plus ancien, sans leur contenu. */
  async list(): Promise<ResumeSummary[]> {
    await this.#purgeExpired();
    const rows = await this.prisma.resume.findMany({
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        fileName: true,
        fileType: true,
        confidence: true,
        active: true,
        createdAt: true,
      },
    });
    return rows.map((row) => ({
      id: row.id,
      fileName: row.fileName,
      fileType: row.fileType,
      confidence: row.confidence,
      active: row.active,
      createdAt: row.createdAt.toISOString(),
    }));
  }

  /** Fait d'un CV la version de référence : il devient le seul actif. */
  async activate(id: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const found = await tx.resume.findUnique({ where: { id }, select: { id: true } });
      if (found === null) {
        throw new NotFoundException("Ce CV n'existe pas.");
      }
      await tx.resume.updateMany({ where: { active: true }, data: { active: false } });
      await tx.resume.update({ where: { id }, data: { active: true } });
    });
  }

  /** Supprime un CV conservé. Un CV inconnu est signalé, pas inventé. */
  async remove(id: string): Promise<void> {
    try {
      await this.prisma.resume.delete({ where: { id } });
    } catch {
      throw new NotFoundException("Ce CV n'existe pas.");
    }
  }

  /**
   * Purge les CV dont la rétention est dépassée, à la lecture plutôt que par une
   * tâche planifiée : un CV est une donnée personnelle, et la lecture est le seul
   * moment garanti de ne pas la laisser traîner. Un échec est journalisé sans
   * faire échouer l'appel.
   */
  async #purgeExpired(): Promise<void> {
    const env = parseApiEnv(process.env);
    const cutoff = new Date(Date.now() - env.RESUME_RETENTION_HOURS * 60 * 60 * 1000);
    try {
      await this.prisma.resume.deleteMany({ where: { createdAt: { lt: cutoff } } });
    } catch (error) {
      this.#logger.error(
        `Rétention des CV non appliquée : ${error instanceof Error ? error.message : "inconnu"}.`,
      );
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
