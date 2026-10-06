import { parseApiEnv } from "@findit/config";
import { computeCostMicroUsd, createDeepSeekModel } from "@findit/ai";
import { type PrismaClient, JobStatus } from "@findit/database";
import { computeMatch, structureCv } from "@findit/matching";
import type { JobOfferLite } from "@findit/matching";
import { Inject, Injectable, Logger } from "@nestjs/common";

import { PRISMA_CLIENT } from "../prisma/prisma.module.js";

/** Ce que les appels de modèle du matching écrivent dans `ModelCall`. */
const MATCHING_PURPOSE = "cv-matching";

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
  readonly #logger = new Logger(MatchingService.name);

  constructor(@Inject(PRISMA_CLIENT) private readonly prisma: PrismaClient) {}

  /**
   * Structure un CV, puis le score contre les offres publiées les plus fraîches.
   *
   * Le POURQUOI : un score CV/offre coûte un appel de modèle par offre. On borne
   * à 15 offres récentes pour garder la requête rapide et le coût mesuré.
   *
   * Le coût est journalisé dans `ModelCall` : ces appels n'appartiennent à aucun
   * run d'agent, et sans cette ligne ils dépensaient sans laisser de trace.
   */
  async score(cvText: string): Promise<MatchItem[]> {
    const env = parseApiEnv(process.env);
    const model = createDeepSeekModel({ apiKey: env.DEEPSEEK_API_KEY, model: env.DEEPSEEK_MODEL });
    const usageBefore = model.usage();

    try {
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
    } finally {
      await this.#recordModelCall(model, usageBefore, env);
    }
  }

  /**
   * Écrit une ligne `ModelCall` pour tout ce que la requête a consommé, modèle de
   * structuration et scores compris. Un échec d'écriture est journalisé mais ne
   * fait pas échouer la requête : l'utilisateur a son résultat, le coût est
   * manquant — et ça se voit dans les logs.
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
          purpose: MATCHING_PURPOSE,
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
        `Coût du matching non journalisé : ${error instanceof Error ? error.message : "inconnu"}`,
      );
    }
  }
}
