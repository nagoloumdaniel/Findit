import { createHash } from "node:crypto";

import { AiDisabledError, type StructuredRequest } from "@findit/ai";
import { type PrismaClient } from "@findit/database";
import { Inject, Injectable } from "@nestjs/common";

import { PRISMA_CLIENT } from "../prisma/prisma.module.js";
import type { ResumeFileType } from "./extract-text.js";
import { extractResumeText } from "./extract-text.js";
import {
  resumeFactsSchema,
  structuredResumeSchema,
  type ResumeFacts,
  type StructuredResume,
} from "./structured-resume.js";

export const RESUME_AI_MODEL = Symbol("RESUME_AI_MODEL");
export const RESUME_CLOCK = Symbol("RESUME_CLOCK");
export const RESUME_RETENTION_HOURS = Symbol("RESUME_RETENTION_HOURS");

export type ResumeAiModel = {
  generateStructured: (request: StructuredRequest<StructuredResume>) => Promise<StructuredResume>;
};

export interface StructuredResumeView {
  facts: ResumeFacts;
  warnings: string[];
  confidence: number;
  structuredAt: Date;
}

export interface ResumeSummary {
  id: string;
  fileType: string;
  originalFileName: string;
  fileSize: number;
  /** Nombre de caracteres du texte extrait. Donne une idee sans tout renvoyer. */
  textLength: number;
  structuredAt: Date | null;
  structuredConfidence: number | null;
  expiresAt: Date;
  createdAt: Date;
}

export type ResumeDetail = ResumeSummary & {
  extractedText: string;
  structured: StructuredResumeView | null;
};

const RESUME_STRUCTURE_SYSTEM = [
  "Tu extrais des faits presents dans un CV pour une application personnelle de candidature.",
  "N'invente aucune competence, experience, date, ecole, entreprise, niveau ou lien.",
  "Si une information est absente ou ambigue, omets le champ et ajoute un avertissement.",
  "Les champs de texte doivent citer uniquement des elements visibles dans le CV.",
  // Constaté sur le modèle réel : sans ces deux consignes, il transforme
  // l'e-mail en « lien » invalide et omet parfois l'identité pourtant lisible.
  "Recopie tels quels le nom complet, le titre, l'e-mail et le telephone quand ils sont visibles.",
  "N'inclus un element dans links que si le CV contient une URL complete commencant par http:// ou https:// ; un e-mail ou un telephone n'est jamais un lien.",
].join(" ");

const buildResumeStructurePrompt = (text: string): string =>
  [
    "Structure ce CV en JSON selon le schema fourni.",
    "Garde les dates au format lu dans le document quand elles ne sont pas normalisables avec certitude.",
    "Texte extrait du CV :",
    "```text",
    text,
    "```",
  ].join("\n");

@Injectable()
export class ResumeService {
  constructor(
    @Inject(PRISMA_CLIENT) private readonly prisma: PrismaClient,
    @Inject(RESUME_AI_MODEL) private readonly model: ResumeAiModel | null,
    @Inject(RESUME_CLOCK) private readonly now: () => Date,
    @Inject(RESUME_RETENTION_HOURS) private readonly retentionHours: number,
  ) {}

  /*
   * Importe un CV : extrait son texte, puis l'enregistre. L'empreinte du contenu
   * deduplique le meme fichier sans ecraser un import distinct.
   */
  async ingest(
    buffer: Buffer,
    fileType: ResumeFileType,
    originalFileName: string,
  ): Promise<ResumeDetail> {
    await this.purgeExpired();
    const extractedText = await extractResumeText(buffer, fileType);
    const contentHash = createHash("sha256").update(buffer).digest("hex");
    const expiresAt = this.expirationDate();

    const row = await this.prisma.sourceResume.upsert({
      where: { contentHash },
      update: { expiresAt },
      create: {
        fileType,
        originalFileName,
        fileSize: buffer.length,
        contentHash,
        extractedText,
        expiresAt,
      },
    });

    return this.toDetail(row);
  }

  async list(): Promise<ResumeSummary[]> {
    await this.purgeExpired();
    const rows = await this.prisma.sourceResume.findMany({
      where: { expiresAt: { gt: this.now() } },
      orderBy: { createdAt: "desc" },
    });
    return rows.map((row) => this.toSummary(row));
  }

  async get(id: string): Promise<ResumeDetail | null> {
    await this.purgeExpired();
    const row = await this.findActive(id);
    return row === null ? null : this.toDetail(row);
  }

  async structure(id: string): Promise<ResumeDetail | null> {
    await this.purgeExpired();
    const row = await this.findActive(id);
    if (row === null) {
      return null;
    }

    if (this.model === null) {
      throw new AiDisabledError("IA locale desactivee : AI_PROVIDER doit valoir ollama.");
    }

    const structured = await this.model.generateStructured({
      schema: structuredResumeSchema,
      system: RESUME_STRUCTURE_SYSTEM,
      prompt: buildResumeStructurePrompt(row.extractedText),
      temperature: 0,
    });
    const structuredAt = this.now();

    const updated = await this.prisma.sourceResume.update({
      where: { id },
      data: {
        structuredFacts: structured.facts,
        structuredWarnings: structured.warnings,
        structuredConfidence: structured.confidence,
        structuredAt,
      },
    });

    return this.toDetail(updated);
  }

  async remove(id: string): Promise<boolean> {
    await this.purgeExpired();
    const row = await this.findActive(id);
    if (row === null) {
      return false;
    }

    await this.prisma.candidateProfile.updateMany({
      where: { activeResumeId: id },
      data: { activeResumeId: null },
    });
    await this.prisma.sourceResume.delete({ where: { id } });
    return true;
  }

  async purgeExpired(): Promise<number> {
    const result = await this.prisma.sourceResume.deleteMany({
      where: { expiresAt: { lte: this.now() } },
    });
    return result.count;
  }

  private findActive(id: string) {
    return this.prisma.sourceResume.findFirst({
      where: { id, expiresAt: { gt: this.now() } },
    });
  }

  private expirationDate(): Date {
    return new Date(this.now().getTime() + this.retentionHours * 60 * 60 * 1000);
  }

  private toSummary(row: {
    id: string;
    fileType: string;
    originalFileName: string;
    fileSize: number;
    extractedText: string;
    structuredAt: Date | null;
    structuredConfidence: number | null;
    expiresAt: Date;
    createdAt: Date;
  }): ResumeSummary {
    return {
      id: row.id,
      fileType: row.fileType,
      originalFileName: row.originalFileName,
      fileSize: row.fileSize,
      textLength: row.extractedText.length,
      structuredAt: row.structuredAt,
      structuredConfidence: row.structuredConfidence,
      expiresAt: row.expiresAt,
      createdAt: row.createdAt,
    };
  }

  private toDetail(row: {
    id: string;
    fileType: string;
    originalFileName: string;
    fileSize: number;
    extractedText: string;
    structuredFacts: unknown;
    structuredWarnings: string[];
    structuredConfidence: number | null;
    structuredAt: Date | null;
    expiresAt: Date;
    createdAt: Date;
  }): ResumeDetail {
    return {
      ...this.toSummary(row),
      extractedText: row.extractedText,
      structured: this.toStructured(row),
    };
  }

  private toStructured(row: {
    structuredFacts: unknown;
    structuredWarnings: string[];
    structuredConfidence: number | null;
    structuredAt: Date | null;
  }): StructuredResumeView | null {
    if (
      row.structuredFacts === null ||
      row.structuredConfidence === null ||
      row.structuredAt === null
    ) {
      return null;
    }

    return {
      facts: resumeFactsSchema.parse(row.structuredFacts),
      warnings: row.structuredWarnings,
      confidence: row.structuredConfidence,
      structuredAt: row.structuredAt,
    };
  }
}
