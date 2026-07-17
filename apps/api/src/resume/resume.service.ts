import { createHash } from "node:crypto";

import { type PrismaClient } from "@findit/database";
import { Inject, Injectable } from "@nestjs/common";

import { PRISMA_CLIENT } from "../prisma/prisma.module.js";
import type { ResumeFileType } from "./extract-text.js";
import { extractResumeText } from "./extract-text.js";

export interface ResumeSummary {
  id: string;
  fileType: string;
  originalFileName: string;
  fileSize: number;
  /** Nombre de caractères du texte extrait. Donne une idée sans tout renvoyer. */
  textLength: number;
  createdAt: Date;
}

export type ResumeDetail = ResumeSummary & { extractedText: string };

@Injectable()
export class ResumeService {
  constructor(@Inject(PRISMA_CLIENT) private readonly prisma: PrismaClient) {}

  /*
   * Importe un CV : extrait son texte, puis l'enregistre. L'empreinte du contenu
   * déduplique — réimporter le même fichier retombe sur la même ligne plutôt que
   * d'en créer une seconde. Rien n'écrase un import précédent : chaque contenu
   * distinct est une ligne à part, et le CV source reste conservé.
   */
  async ingest(
    buffer: Buffer,
    fileType: ResumeFileType,
    originalFileName: string,
  ): Promise<ResumeDetail> {
    const extractedText = await extractResumeText(buffer, fileType);
    const contentHash = createHash("sha256").update(buffer).digest("hex");

    const row = await this.prisma.sourceResume.upsert({
      where: { contentHash },
      update: {},
      create: {
        fileType,
        originalFileName,
        fileSize: buffer.length,
        contentHash,
        extractedText,
      },
    });

    return this.toDetail(row);
  }

  async list(): Promise<ResumeSummary[]> {
    const rows = await this.prisma.sourceResume.findMany({ orderBy: { createdAt: "desc" } });
    return rows.map((row) => this.toSummary(row));
  }

  async get(id: string): Promise<ResumeDetail | null> {
    const row = await this.prisma.sourceResume.findUnique({ where: { id } });
    return row === null ? null : this.toDetail(row);
  }

  private toSummary(row: {
    id: string;
    fileType: string;
    originalFileName: string;
    fileSize: number;
    extractedText: string;
    createdAt: Date;
  }): ResumeSummary {
    return {
      id: row.id,
      fileType: row.fileType,
      originalFileName: row.originalFileName,
      fileSize: row.fileSize,
      textLength: row.extractedText.length,
      createdAt: row.createdAt,
    };
  }

  private toDetail(row: {
    id: string;
    fileType: string;
    originalFileName: string;
    fileSize: number;
    extractedText: string;
    createdAt: Date;
  }): ResumeDetail {
    return { ...this.toSummary(row), extractedText: row.extractedText };
  }
}
