import type { WorkerEnv } from "@findit/config";
import type { PrismaClient } from "@findit/database";
import { createAgentMemoryStore, createAgentRunStore } from "@findit/agent";
import { createDeepSeekModel, computeCostMicroUsd } from "@findit/ai";
import type { ModelUsage } from "@findit/ai";
import { crawl, resolveFinalUrl } from "@findit/crawler";
import type { CrawledPage } from "@findit/crawler";
import { BraveSearchProvider, decideDiscoveredSourceAccess } from "@findit/job-connectors";
import type { SourceAccessVerdict, WebSearchProvider } from "@findit/job-connectors";
import { runAgent } from "@findit/orchestrator";
import { createLlmQueryPlanner, createLlmSourceSelector } from "@findit/orchestrator";
import { persistOffers } from "@findit/persist";
import { TelegramSender, notifyAgentRun } from "@findit/notifications";
import {
  Inject,
  Injectable,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from "@nestjs/common";
import type { ConnectionOptions, Queue } from "bullmq";
import { Worker } from "bullmq";

import { notifyAfterCycle } from "./notify-after-cycle.js";

import {
  AGENT_COLLECTION_JOB,
  AGENT_COLLECTION_SCHEDULER_ID,
  COLLECTION_CYCLE_JOB,
  COLLECTION_SCHEDULER_ID,
  FINDIT_QUEUE,
  JOB_PIPELINE_QUEUE,
  SCRAPED_COLLECTION_JOB,
  SCRAPED_COLLECTION_SCHEDULER_ID,
  WORKER_ENV,
  WORKER_PRISMA,
  WORKER_REDIS_CONNECTION,
} from "../queue/queue.constants.js";
import { createCycleDeps, createScrapedCycleDeps } from "./cycle-deps.js";
import { createJobHandler } from "./job-handler.js";
import { registerDiscoveryFromUrl } from "./register-discovery.js";
import { runCycle } from "./run-cycle.js";
import { runScrapedCycle } from "./run-scraped-cycle.js";

/** Moteur de recherche inactif : sans clé Brave, l'agent ne découvre rien. */
const NO_SEARCH: WebSearchProvider = {
  name: "none",
  search: () => Promise.resolve([]),
  healthCheck: () =>
    Promise.resolve({ healthy: false, detail: "Aucune clé de recherche configurée." }),
};

/**
 * Durée maximale d'une relecture de page vide. Elle est plus courte que le run
 * entier : une relecture est une seconde chance, pas un second run.
 */
const PAGE_RECOVERY_TIMEOUT_MS = 30_000;

/**
 * Programme la collecte et l'exécute.
 *
 * La planification est récurrente - toutes les quatre heures, heure de Paris -
 * et posée par `upsertJobScheduler`, donc idempotente : redémarrer le worker ne
 * l'empile pas. Le consommateur tourne en **concurrence 1** : c'est le verrou.
 * Deux cycles ne se chevauchent jamais, et si l'un dépasse quatre heures, le
 * suivant attend son tour au lieu de démarrer en parallèle.
 */
@Injectable()
export class CollectionSchedulerService implements OnApplicationBootstrap, OnApplicationShutdown {
  #worker: Worker | null = null;

  constructor(
    @Inject(FINDIT_QUEUE) private readonly queue: Queue,
    @Inject(WORKER_PRISMA) private readonly prisma: PrismaClient,
    @Inject(WORKER_ENV) private readonly env: WorkerEnv,
    @Inject(WORKER_REDIS_CONNECTION) private readonly connection: ConnectionOptions,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.queue.upsertJobScheduler(
      COLLECTION_SCHEDULER_ID,
      { pattern: this.env.JOB_COLLECTION_CRON, tz: this.env.JOB_COLLECTION_TIMEZONE },
      { name: COLLECTION_CYCLE_JOB, opts: { removeOnComplete: 50, removeOnFail: 100 } },
    );

    /*
     * Les job boards ont leur propre planification, une fois par jour : un run
     * coûte du crédit, la cadence de 4 h des ATS n'a pas lieu de les concerner.
     * Interrupteur éteint, la planification est RETIRÉE (et non seulement
     * ignorée) : couper l'interrupteur puis redémarrer arrête vraiment la
     * dépense, même si une planification a été posée lors d'un démarrage
     * précédent.
     */
    if (this.env.SCRAPED_SOURCES_ENABLED) {
      await this.queue.upsertJobScheduler(
        SCRAPED_COLLECTION_SCHEDULER_ID,
        { pattern: this.env.SCRAPED_COLLECTION_CRON, tz: this.env.JOB_COLLECTION_TIMEZONE },
        { name: SCRAPED_COLLECTION_JOB, opts: { removeOnComplete: 50, removeOnFail: 100 } },
      );
    } else {
      await this.queue.removeJobScheduler(SCRAPED_COLLECTION_SCHEDULER_ID);
    }

    // L'agent autonome a sa propre planification quotidienne. Même règle que les
    // sources scrapées : interrupteur éteint, la planification est retirée.
    if (this.env.AGENT_RUN_ENABLED) {
      await this.queue.upsertJobScheduler(
        AGENT_COLLECTION_SCHEDULER_ID,
        { pattern: this.env.AGENT_COLLECTION_CRON, tz: this.env.JOB_COLLECTION_TIMEZONE },
        { name: AGENT_COLLECTION_JOB, opts: { removeOnComplete: 50, removeOnFail: 100 } },
      );
    } else {
      await this.queue.removeJobScheduler(AGENT_COLLECTION_SCHEDULER_ID);
    }

    const handle = createJobHandler({
      native: () => this.#runNativeCycle(),
      scraped: () => this.#runScrapedCycle(),
      agent: () => this.#runAgent(),
    });

    this.#worker = new Worker(JOB_PIPELINE_QUEUE, (job) => handle(job), {
      connection: this.connection,
      concurrency: 1,
    });
  }

  async #runNativeCycle(): Promise<unknown> {
    // Des dépendances neuves par cycle : chacune porte son propre
    // identifiant de corrélation, qui relie tous ses journaux.
    const started = new Date();
    const summary = await runCycle(createCycleDeps(this.prisma, this.env));

    const notified = await this.#notify(started);

    // Journal structuré : une ligne par cycle, lisible et filtrable.
    console.log(
      JSON.stringify({
        event: "collection-cycle",
        correlationId: summary.collection.correlationId,
        startedAt: started.toISOString(),
        queriesRun: summary.queriesRun,
        companiesDiscovered: summary.companiesDiscovered,
        sourcesRegistered: summary.sourcesRegistered,
        accepted: summary.collection.totalAccepted,
        quarantined: summary.collection.totalQuarantined,
        rejected: summary.collection.totalRejected,
        notified,
      }),
    );

    return summary;
  }

  async #runScrapedCycle(): Promise<unknown> {
    const started = new Date();
    const summary = await runScrapedCycle(createScrapedCycleDeps(this.prisma, this.env));

    const notified = await this.#notify(started);

    console.log(
      JSON.stringify({
        event: "scraped-collection",
        correlationId: summary.correlationId,
        startedAt: started.toISOString(),
        sources: summary.jobs.map((job) => ({
          connector: job.connectorName,
          failed: job.failed,
          reason: job.failureReason,
          discovered: job.discovered,
          accepted: job.accepted,
        })),
        accepted: summary.totalAccepted,
        quarantined: summary.totalQuarantined,
        rejected: summary.totalRejected,
        notified,
      }),
    );

    return summary;
  }

  /**
   * Exécute un run complet de l'agent autonome : recherche, découverte, crawl,
   * extraction, déduplication, consignation. Les dépendances sont fabriquées
   * ici, à partir de l'environnement validé, et jamais réutilisées d'un run à
   * l'autre.
   */
  async #runAgent(): Promise<unknown> {
    if (this.env.DEEPSEEK_API_KEY === undefined) {
      throw new Error("DEEPSEEK_API_KEY manquante : l'agent ne peut pas s'initialiser.");
    }

    const started = new Date();
    const model = createDeepSeekModel({
      apiKey: this.env.DEEPSEEK_API_KEY,
      model: this.env.DEEPSEEK_MODEL,
    });

    /*
     * Le tarif vient du compte, pas d'une supposition : sans les deux variables,
     * le run trace les tokens mais laisse le coût à zéro.
     */
    const inputPrice = this.env.DEEPSEEK_INPUT_USD_PER_MTOK;
    const outputPrice = this.env.DEEPSEEK_OUTPUT_USD_PER_MTOK;
    const modelCost =
      inputPrice === undefined || outputPrice === undefined
        ? undefined
        : (usage: ModelUsage): number =>
            computeCostMicroUsd(usage, {
              inputUsdPerMillionTokens: inputPrice,
              outputUsdPerMillionTokens: outputPrice,
            });

    const search: WebSearchProvider =
      this.env.BRAVE_SEARCH_API_KEY === undefined
        ? NO_SEARCH
        : new BraveSearchProvider({
            apiKey: this.env.BRAVE_SEARCH_API_KEY,
            fetch: globalThis.fetch,
          });

    /*
     * Le registre est relu une fois par hôte et par run : la porte est appelée
     * pour chaque source gardée, et deux requêtes du même board ne méritent pas
     * deux lectures de la même ligne.
     */
    const verdicts = new Map<string, SourceAccessVerdict>();
    const sourceGate = async (url: string): Promise<SourceAccessVerdict> => {
      let host = url;
      try {
        host = new URL(url).hostname;
      } catch {
        // Hôte illisible : le verdict se prend sur l'URL telle quelle.
      }
      const cached = verdicts.get(host);
      if (cached !== undefined) {
        return cached;
      }
      const verdict = await decideDiscoveredSourceAccess(this.prisma, url, new Date());
      verdicts.set(host, verdict);
      return verdict;
    };

    const result = await runAgent(this.env.AGENT_OBJECTIVE, {
      runStore: createAgentRunStore(this.prisma),
      memoryStore: createAgentMemoryStore(this.prisma),
      search,
      crawl,
      model,
      // Section 5 : le modèle choisit les recherches, le plan déterministe sert
      // de repli automatique si sa réponse est inutilisable.
      planner: createLlmQueryPlanner({ model }),
      // Section 5 : le modèle choisit aussi quelles sources visiter.
      sourceSelector: createLlmSourceSelector({ model }),
      // Un alias de redirection est reconnu avant d'être payé.
      resolveUrl: (url) => resolveFinalUrl(url),
      /*
       * Les découvertes de l'agent alimentent le registre. Sans ce branchement,
       * une entreprise trouvée par l'agent — et payée en crawl et en extraction —
       * n'est jamais recollectée : mesuré, 0 `CompanySource` créée par un run
       * d'agent, alors que le cycle natif en tire un flux complet par simple
       * reconnaissance d'URL.
       */
      discoverSource: (url) => registerDiscoveryFromUrl(this.prisma, url),
      sourceGate,
      ...(modelCost === undefined ? {} : { modelCost }),
      recoverPage: (url) => this.#recoverPage(url),
      persist: (offers) => persistOffers(offers, { prisma: this.prisma }),
    });

    const notified = await this.#notifyAgentRun(result.runId);

    console.log(
      JSON.stringify({
        event: "agent-run",
        runId: result.runId,
        status: result.status,
        startedAt: started.toISOString(),
        searchCount: result.searchCount,
        sourceCount: result.sourceCount,
        pageCount: result.pageCount,
        extractedCount: result.extractedCount,
        retainedCount: result.retainedCount,
        errorCount: result.errorCount,
        notified,
      }),
    );

    return result;
  }

  /**
   * Relit une page que le crawl a rendue vide (erreur réseau, réponse sans
   * contenu). Elle repasse par le crawler borné : `robots.txt` est revérifié,
   * et le repli navigateur reste disponible. Une page toujours vide rend
   * `null` : l'appelant la consigne comme perdue au lieu de l'ignorer.
   */
  async #recoverPage(url: string): Promise<CrawledPage | null> {
    const result = await crawl({
      startUrl: url,
      maxDepth: 0,
      maxPages: 1,
      maxRuntimeMs: PAGE_RECOVERY_TIMEOUT_MS,
    });

    const page = result.pages[0];
    if (page === undefined || (page.text.trim() === "" && page.html.trim() === "")) {
      return null;
    }

    return page;
  }

  /**
   * Notifie les nouvelles offres du cycle, si les deux interrupteurs sont mis
   * et qu'un token et un chat sont fournis. Éteint par défaut : sans cela, la
   * collecte tourne sans jamais rien envoyer.
   */
  async #notify(since: Date): Promise<{ sent: number; simulated: number } | "disabled"> {
    const { TELEGRAM_NOTIFICATIONS_ENABLED, TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID } = this.env;

    if (
      !TELEGRAM_NOTIFICATIONS_ENABLED ||
      TELEGRAM_BOT_TOKEN === undefined ||
      TELEGRAM_CHAT_ID === undefined
    ) {
      return "disabled";
    }

    const sender = new TelegramSender({
      botToken: TELEGRAM_BOT_TOKEN,
      chatId: TELEGRAM_CHAT_ID,
      dryRun: this.env.TELEGRAM_DRY_RUN,
      fetch: globalThis.fetch,
    });

    const summary = await notifyAfterCycle({
      prisma: this.prisma,
      sender,
      since,
      now: new Date(),
      appUrl: this.env.APP_URL ?? null,
      options: {
        chatId: TELEGRAM_CHAT_ID,
        maxJobsPerMessage: this.env.TELEGRAM_MAX_JOBS_PER_MESSAGE,
        maxJobsPerRun: this.env.TELEGRAM_MAX_JOBS_PER_RUN,
      },
    });

    return { sent: summary.sent, simulated: summary.simulated };
  }

  /**
   * Notifie le résumé d'un run de l'agent, sous les mêmes interrupteurs que
   * `#notify`. Sans token ni chat, rien ne part - exactement comme les cycles.
   */
  async #notifyAgentRun(runId: string): Promise<{ sent: number; simulated: number } | "disabled"> {
    const { TELEGRAM_NOTIFICATIONS_ENABLED, TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID } = this.env;

    if (
      !TELEGRAM_NOTIFICATIONS_ENABLED ||
      TELEGRAM_BOT_TOKEN === undefined ||
      TELEGRAM_CHAT_ID === undefined
    ) {
      return "disabled";
    }

    const sender = new TelegramSender({
      botToken: TELEGRAM_BOT_TOKEN,
      chatId: TELEGRAM_CHAT_ID,
      dryRun: this.env.TELEGRAM_DRY_RUN,
      fetch: globalThis.fetch,
    });

    const summary = await notifyAgentRun({
      prisma: this.prisma,
      sender,
      runId,
      appUrl: this.env.APP_URL ?? null,
    });

    return { sent: summary.sent, simulated: summary.simulated };
  }

  async onApplicationShutdown(): Promise<void> {
    await this.#worker?.close();
  }
}
