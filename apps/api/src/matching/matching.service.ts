import { DecisionSource, JobStatus, type PrismaClient } from "@findit/database";
import { computeMatch, type JobMatchInput, type ResumeMatchInput } from "@findit/matching-engine";
import { Inject, Injectable } from "@nestjs/common";

import { PRISMA_CLIENT } from "../prisma/prisma.module.js";
import { resumeFactsSchema, type ResumeFacts } from "../resume/structured-resume.js";

export const MATCHING_CLOCK = Symbol("MATCHING_CLOCK");

/** Le CV existe mais n'est pas structuré : un score serait un chiffre aveugle. */
export class ResumeNotStructuredError extends Error {
  override name = "ResumeNotStructuredError";

  constructor() {
    super(
      "Le CV n'est pas encore structuré : appeler POST /api/resumes/:id/structure avant de calculer un score.",
    );
  }
}

export interface MatchJobView {
  slug: string;
  title: string;
  companyName: string;
}

export interface MatchView {
  job: MatchJobView;
  score: number;
  /** Critères pondérés et raisons, stockés tels quels : le total est vérifiable. */
  scoreBreakdown: unknown;
  matchedSkills: string[];
  missingSkills: string[];
  missingKeywords: string[];
  strengths: string[];
  weaknesses: string[];
  recommendations: string[];
  confidence: number;
  insufficientDataWarning: string | null;
  computedAt: Date;
}

export type MatchFailure = "resume_not_found" | "job_not_found";

/*
 * Le CV structuré nourrit le moteur : la section compétences pèse comme
 * déclaration, les expériences et projets comme preuve, les intitulés et les
 * langues comme contexte. Rien d'autre n'entre dans le score.
 */
const toResumeInput = (facts: ResumeFacts): ResumeMatchInput => ({
  sectionSkills: facts.skills.map((skill) => skill.name),
  evidenceSkills: [
    ...facts.experiences.flatMap((experience) => experience.skills),
    ...facts.projects.flatMap((project) => project.skills),
  ],
  titles: [
    ...(facts.identity.title === undefined ? [] : [facts.identity.title]),
    ...facts.experiences.flatMap((experience) =>
      experience.title === undefined ? [] : [experience.title],
    ),
  ],
  languages: facts.languages.map((language) => ({ name: language.name, level: language.level })),
});

const toJobInput = (job: {
  title: string;
  normalizedTitle: string;
  roleCategory: string;
  requirements: string[];
  responsibilities: string[];
  description: string;
}): JobMatchInput => ({
  title: job.title,
  normalizedTitle: job.normalizedTitle,
  roleCategory: job.roleCategory,
  requirements: job.requirements,
  responsibilities: job.responsibilities,
  description: job.description,
});

@Injectable()
export class MatchingService {
  constructor(
    @Inject(PRISMA_CLIENT) private readonly prisma: PrismaClient,
    @Inject(MATCHING_CLOCK) private readonly now: () => Date,
  ) {}

  /*
   * Calcule le score d'un CV actif contre une offre publiée, puis le stocke.
   * Un seul score courant existe par couple : recalculer remplace, l'unicité
   * est portée par la base.
   */
  async compute(resumeId: string, jobSlug: string): Promise<MatchView | MatchFailure> {
    await this.purgeExpired();

    const resume = await this.prisma.sourceResume.findFirst({
      where: { id: resumeId, expiresAt: { gt: this.now() } },
    });
    if (resume === null) {
      return "resume_not_found";
    }
    if (resume.structuredFacts === null) {
      throw new ResumeNotStructuredError();
    }

    const job = await this.prisma.job.findFirst({
      where: { slug: jobSlug, status: JobStatus.PUBLISHED },
      include: { company: { select: { name: true } } },
    });
    if (job === null) {
      return "job_not_found";
    }

    const facts = resumeFactsSchema.parse(resume.structuredFacts);
    const result = computeMatch(toResumeInput(facts), toJobInput(job));

    const data = {
      score: result.score,
      scoreBreakdown: result.breakdown,
      matchedSkills: result.matchedSkills,
      missingSkills: result.missingSkills,
      missingKeywords: result.missingKeywords,
      strengths: result.strengths,
      weaknesses: result.weaknesses,
      recommendations: result.recommendations,
      confidence: result.confidence,
      insufficientDataWarning: result.insufficientDataWarning,
      computedBy: DecisionSource.RULE,
    };

    const stored = await this.prisma.sourceResumeMatch.upsert({
      where: { sourceResumeId_jobId: { sourceResumeId: resume.id, jobId: job.id } },
      update: data,
      create: { sourceResumeId: resume.id, jobId: job.id, ...data },
    });

    return {
      job: { slug: job.slug, title: job.title, companyName: job.company.name },
      score: stored.score,
      scoreBreakdown: stored.scoreBreakdown,
      matchedSkills: stored.matchedSkills,
      missingSkills: stored.missingSkills,
      missingKeywords: stored.missingKeywords,
      strengths: stored.strengths,
      weaknesses: stored.weaknesses,
      recommendations: stored.recommendations,
      confidence: stored.confidence,
      insufficientDataWarning: stored.insufficientDataWarning,
      computedAt: stored.updatedAt,
    };
  }

  /** Les scores du CV, du meilleur au moins bon, avec l'offre identifiable. */
  async list(resumeId: string): Promise<MatchView[] | "resume_not_found"> {
    await this.purgeExpired();

    const resume = await this.prisma.sourceResume.findFirst({
      where: { id: resumeId, expiresAt: { gt: this.now() } },
    });
    if (resume === null) {
      return "resume_not_found";
    }

    const rows = await this.prisma.sourceResumeMatch.findMany({
      where: { sourceResumeId: resumeId },
      orderBy: { score: "desc" },
      include: {
        job: { select: { slug: true, title: true, company: { select: { name: true } } } },
      },
    });

    return rows.map((row) => ({
      job: { slug: row.job.slug, title: row.job.title, companyName: row.job.company.name },
      score: row.score,
      scoreBreakdown: row.scoreBreakdown,
      matchedSkills: row.matchedSkills,
      missingSkills: row.missingSkills,
      missingKeywords: row.missingKeywords,
      strengths: row.strengths,
      weaknesses: row.weaknesses,
      recommendations: row.recommendations,
      confidence: row.confidence,
      insufficientDataWarning: row.insufficientDataWarning,
      computedAt: row.updatedAt,
    }));
  }

  /*
   * Les routes de matching touchent aussi aux CV : elles honorent la même
   * rétention que les routes CV, un CV expiré ne sert plus à rien calculer.
   */
  private async purgeExpired(): Promise<void> {
    await this.prisma.sourceResume.deleteMany({
      where: { expiresAt: { lte: this.now() } },
    });
  }
}
