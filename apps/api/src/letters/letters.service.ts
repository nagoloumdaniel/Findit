import { AiDisabledError, type StructuredRequest } from "@findit/ai";
import { DecisionSource, JobStatus, type PrismaClient } from "@findit/database";
import { renderCoverLetterPdf } from "@findit/documents";
import { canonicalizeSkill, detectSkillsInText } from "@findit/matching-engine";
import { Inject, Injectable } from "@nestjs/common";

import { PRISMA_CLIENT } from "../prisma/prisma.module.js";
import { resumeFactsSchema, type ResumeFacts } from "../resume/structured-resume.js";
import {
  generatedLetterSchema,
  type GeneratedLetter,
  type LetterAdditions,
} from "./letters-input.js";

export const LETTERS_AI_MODEL = Symbol("LETTERS_AI_MODEL");
export const LETTERS_CLOCK = Symbol("LETTERS_CLOCK");

export type LettersAiModel = {
  generateStructured: (request: StructuredRequest<GeneratedLetter>) => Promise<GeneratedLetter>;
};

/** Le CV existe mais n'est pas structuré : pas de faits, pas de lettre. */
export class ResumeNotStructuredForLetterError extends Error {
  override name = "ResumeNotStructuredForLetterError";

  constructor() {
    super(
      "Le CV n'est pas encore structuré : appeler POST /api/resumes/:id/structure avant de générer une lettre.",
    );
  }
}

/** La lettre cite des compétences que le CV structuré ne contient pas. */
export class LetterInventsFactsError extends Error {
  override name = "LetterInventsFactsError";

  constructor(readonly inventedSkills: string[]) {
    super(
      `La lettre générée cite des compétences absentes du CV : ${inventedSkills.join(", ")}. Sortie refusée.`,
    );
  }
}

export interface LetterJobView {
  slug: string;
  title: string;
  companyName: string;
}

export interface LetterView {
  job: LetterJobView;
  subject: string;
  paragraphs: string[];
  usedFacts: string[];
  warnings: string[];
  generatedAt: Date;
}

export interface LetterPdfExport {
  pdf: Buffer;
  fileName: string;
}

export type LetterFailure = "resume_not_found" | "job_not_found";

const LETTER_SYSTEM = [
  "Tu rediges une lettre de motivation en francais pour une candidature en alternance ou en stage.",
  "Tu n'utilises que les faits presents dans le CV structure et dans l'offre fournis.",
  "N'invente aucune competence, experience, entreprise, date, diplome ou niveau.",
  "Ne cite une technologie que si elle figure dans les competences ou experiences du CV.",
  "N'ecris ni formule d'adresse, ni formule de politesse, ni signature : le modele de document les ajoute.",
  "Deux a quatre paragraphes sobres, a la premiere personne, sans emphase creuse.",
  "Dans usedFacts, liste les faits du CV reellement utilises.",
  "Si un point est fragile ou manque, signale-le dans warnings au lieu de broder.",
].join(" ");

/** Compacte les faits utiles à la lettre : pas tout le CV, seulement le vrai. */
const buildLetterPrompt = (facts: ResumeFacts, job: LetterJobInput): string => {
  const cv = {
    identite: facts.identity,
    resume: facts.summary,
    competences: facts.skills.map((skill) => skill.name),
    experiences: facts.experiences.map((experience) => ({
      titre: experience.title,
      entreprise: experience.company,
      description: experience.description,
      competences: experience.skills,
    })),
    projets: facts.projects.map((project) => ({
      nom: project.name,
      description: project.description,
      competences: project.skills,
    })),
    formation: facts.education.map((education) => ({
      ecole: education.school,
      diplome: education.degree,
      domaine: education.field,
    })),
    langues: facts.languages,
  };
  const offre = {
    titre: job.title,
    entreprise: job.companyName,
    ville: job.city,
    exigences: job.requirements,
    missions: job.responsibilities,
    description: job.description.slice(0, 3000),
  };
  return [
    "Redige la lettre pour cette candidature.",
    "CV structure (seule source de faits sur le candidat) :",
    JSON.stringify(cv),
    "Offre visee :",
    JSON.stringify(offre),
  ].join("\n");
};

interface LetterJobInput {
  title: string;
  companyName: string;
  city: string;
  requirements: string[];
  responsibilities: string[];
  description: string;
}

/*
 * Garde-fou anti-invention : toute technologie du dictionnaire citée dans la
 * lettre doit exister dans le CV structuré. Le même dictionnaire que le score
 * de correspondance - la règle est donc identique partout et explicable.
 */
const findInventedSkills = (letter: GeneratedLetter, facts: ResumeFacts): string[] => {
  const resumeSkillIds = new Set(
    [
      ...facts.skills.map((skill) => skill.name),
      ...facts.experiences.flatMap((experience) => experience.skills),
      ...facts.projects.flatMap((project) => project.skills),
    ]
      .map((name) => canonicalizeSkill(name))
      .filter((entry) => entry !== null)
      .map((entry) => entry.id),
  );
  return detectSkillsInText([letter.subject, ...letter.paragraphs].join("\n"))
    .filter((entry) => !resumeSkillIds.has(entry.id))
    .map((entry) => entry.label);
};

@Injectable()
export class LettersService {
  constructor(
    @Inject(PRISMA_CLIENT) private readonly prisma: PrismaClient,
    @Inject(LETTERS_AI_MODEL) private readonly model: LettersAiModel | null,
    @Inject(LETTERS_CLOCK) private readonly now: () => Date,
  ) {}

  /*
   * Génère la lettre d'un CV actif pour une offre publiée, vérifie qu'elle ne
   * cite rien d'absent du CV, puis la stocke. Une seule lettre courante par
   * couple : régénérer remplace, la relecture passe par GET.
   */
  async generate(
    resumeId: string,
    jobSlug: string,
    input?: LetterAdditions,
  ): Promise<LetterView | LetterFailure> {
    const additions = input?.additions ?? [];
    await this.purgeExpired();

    const resume = await this.prisma.sourceResume.findFirst({
      where: { id: resumeId, expiresAt: { gt: this.now() } },
    });
    if (resume === null) {
      return "resume_not_found";
    }
    if (resume.structuredFacts === null) {
      throw new ResumeNotStructuredForLetterError();
    }

    const job = await this.prisma.job.findFirst({
      where: { slug: jobSlug, status: JobStatus.PUBLISHED },
      include: { company: { select: { name: true } } },
    });
    if (job === null) {
      return "job_not_found";
    }

    if (this.model === null) {
      throw new AiDisabledError("IA locale desactivee : AI_PROVIDER doit valoir ollama.");
    }

    const facts = resumeFactsSchema.parse(resume.structuredFacts);

    /*
     * Ajouts triés par le propriétaire dans la popup : une compétence
     * possédée se cite comme acquise (il est la source de vérité sur
     * lui-même), une compétence en cours d'acquisition ne se présente JAMAIS
     * comme acquise et produit ses notions à apprendre.
     */
    const possessed = additions.filter((a) => a.status === "possessed").map((a) => a.skill);
    const learning = additions.filter((a) => a.status === "learning").map((a) => a.skill);
    const additionsPrompt = [
      ...(possessed.length > 0
        ? [
            `Le candidat confirme posseder aussi, hors CV : ${possessed.join(", ")}. Tu peux les citer comme acquises.`,
          ]
        : []),
      ...(learning.length > 0
        ? [
            `Le candidat est EN COURS D'ACQUISITION de : ${learning.join(", ")}. Tu peux les mentionner uniquement comme apprentissage en cours, jamais comme acquises, et tu remplis learningNotes pour chacune avec 3 a 5 notions concretes a apprendre, en rapport direct avec l'offre.`,
          ]
        : []),
    ];

    const letter = await this.model.generateStructured({
      schema: generatedLetterSchema,
      system: LETTER_SYSTEM,
      prompt: [
        buildLetterPrompt(facts, {
          title: job.title,
          companyName: job.company.name,
          city: job.city,
          requirements: job.requirements,
          responsibilities: job.responsibilities,
          description: job.description,
        }),
        ...additionsPrompt,
      ].join("\n"),
      // Un peu de latitude pour que la lettre se lise bien ; les faits, eux,
      // sont verrouillés par le schéma et la vérification qui suit.
      temperature: 0.3,
    });

    // Le garde-fou tolère uniquement ce que le propriétaire a explicitement trié.
    const allowed = new Set(additions.map((a) => a.skill.toLowerCase()));
    const invented = findInventedSkills(letter, facts).filter(
      (skill) => !allowed.has(skill.toLowerCase()),
    );
    if (invented.length > 0) {
      throw new LetterInventsFactsError(invented);
    }

    /*
     * La traçabilité des ajouts vit dans la lettre stockée : les warnings
     * portent la raison de chaque ajout et les notions à apprendre - la
     * relecture et le PDF les montrent tels quels.
     */
    const additionWarnings = [
      ...possessed.map((skill) => `Ajout déclaré possédé (hors CV) : ${skill}.`),
      ...learning.map(
        (skill) => `En cours d'acquisition, jamais présenté comme acquis : ${skill}.`,
      ),
      ...letter.learningNotes.map(
        (note) => `À apprendre - ${note.skill} : ${note.notions.join(" ; ")}.`,
      ),
    ];

    const data = {
      subject: letter.subject,
      paragraphs: letter.paragraphs,
      usedFacts: letter.usedFacts,
      warnings: [...letter.warnings, ...additionWarnings],
      computedBy: DecisionSource.AI,
    };
    const stored = await this.prisma.sourceCoverLetter.upsert({
      where: { sourceResumeId_jobId: { sourceResumeId: resume.id, jobId: job.id } },
      update: data,
      create: { sourceResumeId: resume.id, jobId: job.id, ...data },
    });

    return {
      job: { slug: job.slug, title: job.title, companyName: job.company.name },
      subject: stored.subject,
      paragraphs: stored.paragraphs,
      usedFacts: stored.usedFacts,
      warnings: stored.warnings,
      generatedAt: stored.updatedAt,
    };
  }

  /** Les lettres du CV, la plus récente d'abord, pour relecture. */
  async list(resumeId: string): Promise<LetterView[] | "resume_not_found"> {
    await this.purgeExpired();

    const resume = await this.prisma.sourceResume.findFirst({
      where: { id: resumeId, expiresAt: { gt: this.now() } },
    });
    if (resume === null) {
      return "resume_not_found";
    }

    const rows = await this.prisma.sourceCoverLetter.findMany({
      where: { sourceResumeId: resumeId },
      orderBy: { updatedAt: "desc" },
      include: {
        job: { select: { slug: true, title: true, company: { select: { name: true } } } },
      },
    });

    return rows.map((row) => ({
      job: { slug: row.job.slug, title: row.job.title, companyName: row.job.company.name },
      subject: row.subject,
      paragraphs: row.paragraphs,
      usedFacts: row.usedFacts,
      warnings: row.warnings,
      generatedAt: row.updatedAt,
    }));
  }

  /** Rend en PDF la lettre déjà relue ; null si CV ou lettre absents. */
  async renderPdf(resumeId: string, jobSlug: string): Promise<LetterPdfExport | null> {
    await this.purgeExpired();

    const resume = await this.prisma.sourceResume.findFirst({
      where: { id: resumeId, expiresAt: { gt: this.now() } },
    });
    if (resume === null || resume.structuredFacts === null) {
      return null;
    }

    const row = await this.prisma.sourceCoverLetter.findFirst({
      where: { sourceResumeId: resumeId, job: { slug: jobSlug } },
      include: {
        job: { select: { slug: true, title: true, company: { select: { name: true } } } },
      },
    });
    if (row === null) {
      return null;
    }

    const facts = resumeFactsSchema.parse(resume.structuredFacts);
    const identity = facts.identity;
    const dateText = new Intl.DateTimeFormat("fr-FR", {
      day: "numeric",
      month: "long",
      year: "numeric",
    }).format(this.now());

    const pdf = await renderCoverLetterPdf({
      senderName: identity.fullName,
      senderContact: [identity.email, identity.phone, identity.location].filter(
        (line): line is string => line !== undefined,
      ),
      companyName: row.job.company.name,
      jobTitle: row.job.title,
      cityAndDate:
        identity.location === undefined ? `Le ${dateText}` : `${identity.location}, le ${dateText}`,
      subject: row.subject,
      paragraphs: row.paragraphs,
    });

    return { pdf, fileName: `lettre-${row.job.slug}.pdf` };
  }

  private async purgeExpired(): Promise<void> {
    await this.prisma.sourceResume.deleteMany({
      where: { expiresAt: { lte: this.now() } },
    });
  }
}
