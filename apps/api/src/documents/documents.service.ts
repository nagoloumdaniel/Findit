import { type PrismaClient } from "@findit/database";
import { renderCvPdf, type CvDocumentData } from "@findit/documents";
import { Inject, Injectable } from "@nestjs/common";

import { PRISMA_CLIENT } from "../prisma/prisma.module.js";
import { resumeFactsSchema, type ResumeFacts } from "../resume/structured-resume.js";

export const DOCUMENTS_CLOCK = Symbol("DOCUMENTS_CLOCK");

/** Le CV existe mais n'est pas structuré : rien de fiable à mettre en page. */
export class ResumeNotStructuredForDocumentError extends Error {
  override name = "ResumeNotStructuredForDocumentError";

  constructor() {
    super(
      "Le CV n'est pas encore structuré : appeler POST /api/resumes/:id/structure avant d'exporter un document.",
    );
  }
}

export interface CvPdfExport {
  /** Le document lui-même. */
  pdf: Buffer;
  /** Nom de fichier proposé, dérivé du nom lu dans le CV - jamais inventé. */
  fileName: string;
}

/*
 * Les faits structurés passent tels quels au modèle : le service ne complète
 * rien, ne reformule rien. Un champ absent du CV reste absent du PDF.
 */
const toDocumentData = (facts: ResumeFacts): CvDocumentData => ({
  identity: facts.identity,
  summary: facts.summary,
  experiences: facts.experiences,
  projects: facts.projects,
  education: facts.education,
  skills: facts.skills,
  languages: facts.languages,
  certifications: facts.certifications,
  links: facts.links,
});

const toFileName = (facts: ResumeFacts): string => {
  const fullName = facts.identity.fullName;
  if (fullName === undefined) {
    return "cv.pdf";
  }
  const slug = fullName
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug === "" ? "cv.pdf" : `cv-${slug}.pdf`;
};

@Injectable()
export class DocumentsService {
  constructor(
    @Inject(PRISMA_CLIENT) private readonly prisma: PrismaClient,
    @Inject(DOCUMENTS_CLOCK) private readonly now: () => Date,
  ) {}

  /** Rend le CV pré-conçu d'un CV source actif et structuré, ou null si absent. */
  async renderCv(resumeId: string): Promise<CvPdfExport | null> {
    // Même rétention que les routes CV : un export ne ressuscite pas un CV mort.
    await this.prisma.sourceResume.deleteMany({
      where: { expiresAt: { lte: this.now() } },
    });

    const resume = await this.prisma.sourceResume.findFirst({
      where: { id: resumeId, expiresAt: { gt: this.now() } },
    });
    if (resume === null) {
      return null;
    }
    if (resume.structuredFacts === null) {
      throw new ResumeNotStructuredForDocumentError();
    }

    const facts = resumeFactsSchema.parse(resume.structuredFacts);
    const pdf = await renderCvPdf(toDocumentData(facts));
    return { pdf, fileName: toFileName(facts) };
  }
}
