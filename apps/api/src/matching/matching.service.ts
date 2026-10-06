import { parseApiEnv } from "@findit/config";
import { createDeepSeekModel } from "@findit/ai";
import { type PrismaClient, JobStatus } from "@findit/database";
import { computeMatch, structureCv } from "@findit/matching";
import type { JobOfferLite } from "@findit/matching";
import { Inject, Injectable } from "@nestjs/common";

import { PRISMA_CLIENT } from "../prisma/prisma.module.js";

export type MatchItem = {
  jobSlug: string;
  jobTitle: string;
  companyName: string;
  score: number;
  relevance: string;
  matchedSkills: string[];
  missingSkills: string[];
  strengths: string[];
  weaknesses: string[];
  recommendation: string;
};

@Injectable()
export class MatchingService {
  constructor(@Inject(PRISMA_CLIENT) private readonly prisma: PrismaClient) {}

  /**
   * Structure un CV, puis le score contre les offres publiées les plus fraîches.
   *
   * Le POURQUOI : un score CV/offre coûte un appel de modèle par offre. On borne
   * à 15 offres récentes pour garder la requête rapide et le coût mesuré.
   */
  async score(cvText: string): Promise<MatchItem[]> {
    const env = parseApiEnv(process.env);
    const model = createDeepSeekModel({ apiKey: env.DEEPSEEK_API_KEY, model: env.DEEPSEEK_MODEL });

    const cv = await structureCv(cvText, model);

    const jobs = await this.prisma.job.findMany({
      where: { status: JobStatus.PUBLISHED },
      orderBy: { publishedAt: "desc" },
      take: 15,
      select: {
        slug: true,
        title: true,
        description: true,
        requirements: true,
        contractType: true,
        city: true,
        company: { select: { name: true } },
      },
    });

    const items: MatchItem[] = [];
    for (const job of jobs) {
      const offer: JobOfferLite = {
        title: job.title,
        description: job.description,
        requiredSkills: job.requirements,
        contract: job.contractType,
        location: job.city,
      };
      const match = await computeMatch(cv, offer, model);

      items.push({
        jobSlug: job.slug,
        jobTitle: job.title,
        companyName: job.company.name,
        score: match.score,
        relevance: match.relevance,
        matchedSkills: [...match.matchedSkills],
        missingSkills: [...match.missingSkills],
        strengths: [...match.strengths],
        weaknesses: [...match.weaknesses],
        recommendation: match.recommendation,
      });
    }

    return items.sort((a, b) => b.score - a.score);
  }
}
