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

/// Un matching passé, tel qu'affiché dans l'historique : sans le CV ni les items.
export type MatchingRunSummary = {
  id: string;
  createdAt: string;
  jobCount: number;
  bestScore: number;
};

/// Un matching passé, complet : le CV soumis et les résultats rendus.
export type MatchingRunDetail = MatchingRunSummary & {
  cvText: string;
  items: MatchItem[];
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

      const sorted = items.sort((a, b) => b.score - a.score);
      await this.#saveRun(cvText, sorted, env);
      return sorted;
    } finally {
      await this.#recordModelCall(model, usageBefore, env);
    }
  }

  /**
   * Historique des matchings, du plus récent au plus ancien.
   *
   * Sans le CV : la liste n'en a pas besoin, et ne pas le charger est la même
   * minimisation que la rétention.
   */
  async history(limit = 20): Promise<MatchingRunSummary[]> {
    const runs = await this.prisma.matchingRun.findMany({
      orderBy: { createdAt: "desc" },
      take: Math.max(1, Math.min(100, limit)),
      select: { id: true, createdAt: true, jobCount: true, bestScore: true },
    });

    return runs.map((run) => ({
      id: run.id,
      createdAt: run.createdAt.toISOString(),
      jobCount: run.jobCount,
      bestScore: run.bestScore,
    }));
  }

  /** Un matching passé, avec le CV soumis et les résultats rendus. */
  async historyDetail(id: string): Promise<MatchingRunDetail | null> {
    const run = await this.prisma.matchingRun.findUnique({ where: { id } });
    if (run === null) {
      return null;
    }

    return {
      id: run.id,
      createdAt: run.createdAt.toISOString(),
      jobCount: run.jobCount,
      bestScore: run.bestScore,
      cvText: run.cvText,
      items: run.items as unknown as MatchItem[],
    };
  }

  /**
   * Garde le matching et purge ce qui a dépassé la rétention.
   *
   * La purge se fait ici plutôt que par une tâche planifiée : une écriture est le
   * seul moment où l'on est sûr qu'un matching vient d'avoir lieu, et cela évite
   * un cron de plus à surveiller. Un échec est journalisé sans faire échouer la
   * requête : l'utilisateur a son résultat.
   */
  async #saveRun(
    cvText: string,
    items: readonly MatchItem[],
    env: ReturnType<typeof parseApiEnv>,
  ): Promise<void> {
    try {
      await this.prisma.matchingRun.create({
        data: {
          cvText,
          jobCount: items.length,
          bestScore: items[0]?.score ?? 0,
          items,
        },
      });

      const cutoff = new Date(Date.now() - env.MATCHING_RETENTION_HOURS * 60 * 60 * 1000);
      await this.prisma.matchingRun.deleteMany({ where: { createdAt: { lt: cutoff } } });
    } catch (error) {
      this.#logger.error(
        `Matching non historisé : ${error instanceof Error ? error.message : "inconnu"}`,
      );
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
