import type { WorkerEnv } from "@findit/config";
import { JobStatus, type PrismaClient } from "@findit/database";
import { pollTelegramCommands, TelegramSender } from "@findit/notifications";
import { Inject, Injectable, Logger } from "@nestjs/common";
import type { OnApplicationShutdown, OnModuleInit } from "@nestjs/common";

import { WORKER_ENV, WORKER_PRISMA } from "../queue/queue.constants.js";

const POLL_INTERVAL_MS = 30_000;
const LATEST_LIMIT = 5;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Sonde les commandes du bot (/start, /status, /latest, /help) toutes les
 * 30 secondes. Actif seulement quand Telegram est réellement configuré :
 * activé, hors simulation, token et chat présents - sinon le service ne
 * démarre simplement pas. Seul le chat configuré est servi.
 */
@Injectable()
export class TelegramCommandsService implements OnModuleInit, OnApplicationShutdown {
  readonly #logger = new Logger(TelegramCommandsService.name);
  #timer: NodeJS.Timeout | null = null;
  #offset: number | null = null;
  #running = false;

  constructor(
    @Inject(WORKER_ENV) private readonly env: WorkerEnv,
    @Inject(WORKER_PRISMA) private readonly prisma: PrismaClient,
  ) {}

  onModuleInit(): void {
    const { TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID } = this.env;
    const enabled =
      this.env.TELEGRAM_NOTIFICATIONS_ENABLED &&
      !this.env.TELEGRAM_DRY_RUN &&
      TELEGRAM_BOT_TOKEN !== undefined &&
      TELEGRAM_BOT_TOKEN !== "" &&
      TELEGRAM_CHAT_ID !== undefined &&
      TELEGRAM_CHAT_ID !== "";

    if (!enabled) {
      this.#logger.log("Commandes Telegram inactives (non configurées ou en simulation).");
      return;
    }

    const sender = new TelegramSender({
      botToken: TELEGRAM_BOT_TOKEN,
      chatId: TELEGRAM_CHAT_ID,
      dryRun: false,
      fetch: globalThis.fetch,
    });

    this.#timer = setInterval(() => {
      // Un tour à la fois : un sondage lent ne s'empile pas sur le suivant.
      if (this.#running) {
        return;
      }
      this.#running = true;
      void pollTelegramCommands(
        {
          botToken: TELEGRAM_BOT_TOKEN,
          chatId: TELEGRAM_CHAT_ID,
          fetch: globalThis.fetch,
          send: (message) => sender.send(message),
          loadStatus: async () => {
            const now = new Date();
            const [publishedCount, publishedLast24h, lastRun] = await Promise.all([
              this.prisma.job.count({ where: { status: JobStatus.PUBLISHED } }),
              this.prisma.job.count({
                where: {
                  status: JobStatus.PUBLISHED,
                  publishedAt: { gte: new Date(now.getTime() - MS_PER_DAY) },
                },
              }),
              this.prisma.connectorRun.findFirst({ orderBy: { startedAt: "desc" } }),
            ]);
            return { publishedCount, publishedLast24h, lastCycleAt: lastRun?.startedAt ?? null };
          },
          loadLatest: async () => {
            const jobs = await this.prisma.job.findMany({
              where: { status: JobStatus.PUBLISHED },
              orderBy: { publishedAt: "desc" },
              take: LATEST_LIMIT,
              include: { company: { select: { name: true } } },
            });
            return jobs.map((job) => ({
              title: job.title,
              companyName: job.company.name,
              city: job.city,
              url: job.canonicalUrl,
            }));
          },
        },
        this.#offset,
      )
        .then((outcome) => {
          this.#offset = outcome.nextOffset;
          if (outcome.failure !== null) {
            this.#logger.warn(`Sondage Telegram en échec : ${outcome.failure}`);
          }
        })
        .finally(() => {
          this.#running = false;
        });
    }, POLL_INTERVAL_MS);

    this.#logger.log("Commandes Telegram actives (sondage toutes les 30 s).");
  }

  onApplicationShutdown(): void {
    if (this.#timer !== null) {
      clearInterval(this.#timer);
    }
  }
}
