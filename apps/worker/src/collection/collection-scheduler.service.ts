import type { WorkerEnv } from "@findit/config";
import type { PrismaClient } from "@findit/database";
import { TelegramSender } from "@findit/notifications";
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
  COLLECTION_CYCLE_JOB,
  COLLECTION_SCHEDULER_ID,
  FINDIT_QUEUE,
  JOB_PIPELINE_QUEUE,
  WORKER_ENV,
  WORKER_PRISMA,
  WORKER_REDIS_CONNECTION,
} from "../queue/queue.constants.js";
import { createCycleDeps } from "./cycle-deps.js";
import { runCycle } from "./run-cycle.js";

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

    this.#worker = new Worker(
      JOB_PIPELINE_QUEUE,
      async () => {
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
      },
      { connection: this.connection, concurrency: 1 },
    );
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

  async onApplicationShutdown(): Promise<void> {
    await this.#worker?.close();
  }
}
