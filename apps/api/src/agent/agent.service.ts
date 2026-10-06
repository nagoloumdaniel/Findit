import { type PrismaClient, JobStatus } from "@findit/database";
import { Inject, Injectable } from "@nestjs/common";

import { PRISMA_CLIENT } from "../prisma/prisma.module.js";

const runSelect = {
  id: true,
  objective: true,
  status: true,
  searches: true,
  pages: true,
  extracted: true,
  validated: true,
  duplicates: true,
  inserted: true,
  errors: true,
  costMicroUsd: true,
  startedAt: true,
  endedAt: true,
} as const;

export type AgentRunSummary = {
  id: string;
  objective: string;
  status: string;
  searches: number;
  pages: number;
  extracted: number;
  validated: number;
  duplicates: number;
  inserted: number;
  errors: number;
  costMicroUsd: number;
  startedAt: Date;
  endedAt: Date | null;
};

export type AgentActionItem = {
  kind: string;
  detail: string | null;
  costMicroUsd: number;
  createdAt: Date;
};

export type AgentErrorItem = {
  kind: string;
  message: string;
  retried: boolean;
  createdAt: Date;
};

export type AgentRunDetail = AgentRunSummary & {
  actions: AgentActionItem[];
  errorLogs: AgentErrorItem[];
};

export type AgentStats = {
  lastRun: AgentRunSummary | null;
  sourceCount: number;
  pageCount: number;
  publishedJobCount: number;
};

export type SourceItem = {
  id: string;
  name: string;
  url: string;
  type: string;
  schedule: string;
  maxDepth: number;
  maxPages: number;
  priority: number;
  enabled: boolean;
  lastCrawlAt: Date | null;
};

/// Un jour de la série d'offres publiées. Le jour est une clé ISO « AAAA-MM-JJ »
/// découpée en UTC, pas un timestamp : la série doit rester stable quel que soit
/// le fuseau de la machine qui consulte le dashboard.
export type PublishedPerDay = {
  date: string;
  count: number;
};

export type SourcePageCount = {
  name: string;
  pageCount: number;
};

export type CompanyJobCount = {
  name: string;
  jobCount: number;
};

/// Les trois issues qui comptent pour un dashboard. Les runs encore RUNNING
/// sont une donnée de suivi opérationnel, pas un résultat : ils n'apparaissent
/// pas ici, sinon la somme ne décrirait pas le travail terminé.
export type RunStatusBreakdown = {
  succeeded: number;
  failed: number;
  stopped: number;
};

export type AgentAnalytics = {
  publishedPerDay: PublishedPerDay[];
  topSources: SourcePageCount[];
  topCompanies: CompanyJobCount[];
  runStatuses: RunStatusBreakdown;
  modelCost: ModelCost;
};

/// Coût et tokens d'un jour de la fenêtre. Le jour est la même clé UTC que
/// `publishedPerDay`, pour que les deux séries se lisent côte à côte.
export type ModelCostDay = {
  date: string;
  costMicroUsd: number;
  inputTokens: number;
  outputTokens: number;
};

/// Ce que le modèle a coûté sur la fenêtre. `runCount` compte les runs de la
/// fenêtre, y compris ceux qui n'ont rien dépensé : c'est le dénominateur.
export type ModelCost = {
  totalCostMicroUsd: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  runCount: number;
  perDay: ModelCostDay[];
};

/// Forme écrite par l'orchestrateur dans le détail d'une action d'extraction :
/// « … · 1200+340 tok ».
const USAGE_SUFFIX = /(\d+)\+(\d+) tok/u;

/**
 * Lit les tokens dans le détail d'une action d'extraction.
 *
 * Le POURQUOI de cette lecture d'un champ texte : les tokens n'ont pas encore de
 * colonne, et ce format est écrit par `packages/orchestrator/src/run-agent.ts`.
 * Le coût, lui, est structuré (`AgentAction.costMicroUsd`). Le jour où les
 * tokens ont une colonne, cette fonction disparaît. Le format est testé, donc
 * une dérive se voit.
 */
export const parseUsageFromDetail = (
  detail: string | null,
): { inputTokens: number; outputTokens: number } | null => {
  const match = detail === null ? null : USAGE_SUFFIX.exec(detail);
  if (match === null) {
    return null;
  }
  const input = match[1];
  const output = match[2];
  if (input === undefined || output === undefined) {
    return null;
  }
  return { inputTokens: Number(input), outputTokens: Number(output) };
};

/// Longueur de la fenêtre d'analytics : les deux dernières semaines. Assez
/// longue pour laisser voir une tendance, assez courte pour rester lisible.
const ANALYTICS_DAYS = 14;

/// Découpe une date en clé de jour UTC « AAAA-MM-JJ ». `publishedAt` est stocké
/// sans fuseau ; découper en UTC évite qu'une même offre bascule de jour selon
/// l'heure de consultation.
const utcDayKey = (date: Date): string => date.toISOString().slice(0, 10);

/// Fabrique la série des `ANALYTICS_DAYS` derniers jours, chacun à zéro. C'est
/// le canevas sur lequel viennent s'ajouter les comptes : un jour sans offre
/// reste visible à zéro, il ne disparaît pas de la tendance.
const emptyDaySeries = (now: Date): PublishedPerDay[] => {
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const days: PublishedPerDay[] = [];

  for (let offset = ANALYTICS_DAYS - 1; offset >= 0; offset -= 1) {
    const day = new Date(today.getTime() - offset * 86_400_000);
    days.push({ date: utcDayKey(day), count: 0 });
  }

  return days;
};

@Injectable()
export class AgentService {
  constructor(@Inject(PRISMA_CLIENT) private readonly prisma: PrismaClient) {}

  listRuns(): Promise<AgentRunSummary[]> {
    return this.prisma.agentRun.findMany({
      orderBy: { startedAt: "desc" },
      take: 20,
      select: runSelect,
    });
  }

  runDetail(id: string): Promise<AgentRunDetail | null> {
    return this.prisma.agentRun.findUnique({
      where: { id },
      select: {
        ...runSelect,
        actions: {
          orderBy: { createdAt: "asc" },
          select: { kind: true, detail: true, costMicroUsd: true, createdAt: true },
        },
        errorLogs: {
          orderBy: { createdAt: "asc" },
          select: { kind: true, message: true, retried: true, createdAt: true },
        },
      },
    });
  }

  listSources(): Promise<SourceItem[]> {
    return this.prisma.source.findMany({
      orderBy: [{ enabled: "desc" }, { priority: "desc" }],
      select: {
        id: true,
        name: true,
        url: true,
        type: true,
        schedule: true,
        maxDepth: true,
        maxPages: true,
        priority: true,
        enabled: true,
        lastCrawlAt: true,
      },
    });
  }

  async stats(): Promise<AgentStats> {
    const [lastRun, sourceCount, pageCount, publishedJobCount] = await Promise.all([
      this.prisma.agentRun.findFirst({ orderBy: { startedAt: "desc" }, select: runSelect }),
      this.prisma.source.count(),
      this.prisma.crawlPage.count(),
      this.prisma.job.count({ where: { status: JobStatus.PUBLISHED } }),
    ]);

    return { lastRun, sourceCount, pageCount, publishedJobCount };
  }

  async analytics(now: Date = new Date()): Promise<AgentAnalytics> {
    /*
     * La borne basse de la fenêtre est minuit UTC du premier jour couvert, pas
     * « maintenant moins 14 jours » : compter en jours calendaires entiers évite
     * qu'une offre publiée ce matin soit amputée d'une partie de sa journée.
     */
    const since = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - (ANALYTICS_DAYS - 1)),
    );

    const [publishedRows, crawlJobs, companies, statusRows, runCosts, extractActions] =
      await Promise.all([
        this.prisma.job.findMany({
          where: { status: JobStatus.PUBLISHED, publishedAt: { gte: since } },
          select: { publishedAt: true },
        }),
        // Un crawl job porte déjà le nom de sa source : compter les pages par
        // crawl job puis additionner en mémoire évite un groupBy sur une jointure,
        // que Prisma ne sait pas faire proprement.
        this.prisma.crawlJob.findMany({
          select: {
            source: { select: { name: true } },
            _count: { select: { pages: true } },
          },
        }),
        // Le tri par nombre d'offres se fait côté base, le top 5 est donc exact
        // même si le nombre d'entreprises dépasse largement cinq.
        this.prisma.company.findMany({
          select: { name: true, _count: { select: { jobs: true } } },
          orderBy: { jobs: { _count: "desc" } },
          take: 5,
        }),
        this.prisma.agentRun.groupBy({ by: ["status"], _count: { _all: true } }),
        // Le coût est porté par le run, les tokens par l'action d'extraction :
        // chaque série suit l'horodatage de sa propre ligne.
        this.prisma.agentRun.findMany({
          where: { startedAt: { gte: since } },
          select: { startedAt: true, costMicroUsd: true },
        }),
        this.prisma.agentAction.findMany({
          where: { createdAt: { gte: since }, kind: "EXTRACT" },
          select: { detail: true, createdAt: true },
        }),
      ]);

    const publishedByDay = new Map<string, number>();
    for (const row of publishedRows) {
      const key = utcDayKey(row.publishedAt);
      publishedByDay.set(key, (publishedByDay.get(key) ?? 0) + 1);
    }

    const pagesBySource = new Map<string, number>();
    for (const crawlJob of crawlJobs) {
      const name = crawlJob.source.name;
      pagesBySource.set(name, (pagesBySource.get(name) ?? 0) + crawlJob._count.pages);
    }

    const runStatuses = { succeeded: 0, failed: 0, stopped: 0 };
    for (const row of statusRows) {
      if (row.status === "SUCCEEDED") {
        runStatuses.succeeded += row._count._all;
      } else if (row.status === "FAILED") {
        runStatuses.failed += row._count._all;
      } else if (row.status === "STOPPED") {
        runStatuses.stopped += row._count._all;
      }
    }

    const costByDay = new Map<string, number>();
    for (const run of runCosts) {
      const key = utcDayKey(run.startedAt);
      costByDay.set(key, (costByDay.get(key) ?? 0) + run.costMicroUsd);
    }

    const tokensByDay = new Map<string, { inputTokens: number; outputTokens: number }>();
    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    for (const action of extractActions) {
      const usage = parseUsageFromDetail(action.detail);
      if (usage === null) {
        continue;
      }
      totalInputTokens += usage.inputTokens;
      totalOutputTokens += usage.outputTokens;

      const key = utcDayKey(action.createdAt);
      const day = tokensByDay.get(key) ?? { inputTokens: 0, outputTokens: 0 };
      tokensByDay.set(key, {
        inputTokens: day.inputTokens + usage.inputTokens,
        outputTokens: day.outputTokens + usage.outputTokens,
      });
    }

    const modelCost: ModelCost = {
      totalCostMicroUsd: runCosts.reduce((sum, run) => sum + run.costMicroUsd, 0),
      totalInputTokens,
      totalOutputTokens,
      runCount: runCosts.length,
      perDay: emptyDaySeries(now).map((day) => {
        const tokens = tokensByDay.get(day.date);
        return {
          date: day.date,
          costMicroUsd: costByDay.get(day.date) ?? 0,
          inputTokens: tokens?.inputTokens ?? 0,
          outputTokens: tokens?.outputTokens ?? 0,
        };
      }),
    };

    return {
      publishedPerDay: emptyDaySeries(now).map((day) => ({
        date: day.date,
        count: publishedByDay.get(day.date) ?? 0,
      })),
      topSources: [...pagesBySource.entries()]
        .map(([name, pageCount]) => ({ name, pageCount }))
        .sort((a, b) => b.pageCount - a.pageCount)
        .slice(0, 5),
      topCompanies: companies.map((company) => ({
        name: company.name,
        jobCount: company._count.jobs,
      })),
      runStatuses,
      modelCost,
    };
  }
}
