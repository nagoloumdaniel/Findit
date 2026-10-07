import { NotificationStatus, NotificationType } from "@findit/database";
import type { PrismaClient } from "@findit/database";
import { describe, expect, it, vi } from "vitest";

import { notificationKey, notifyNewJobs } from "./notify.js";
import type { NotifiableJobWithId } from "./notify.js";
import type { SendResult, TelegramSender } from "./telegram-sender.js";

/*
 * `notify.ts` portait la règle centrale de la notification (idempotence, rien
 * d'envoyé s'il n'y a rien de neuf, simulation qui ne consomme pas) sans aucun
 * test : c'était le plus gros trou de couverture du dépôt (10 %).
 */

const NOW = new Date("2026-10-07T06:00:00.000Z");

const job = (id: string): NotifiableJobWithId => ({
  jobId: id,
  title: `Développeur ${id}`,
  companyName: "Acme",
  city: "Paris",
  roleLabel: "Développeur",
  contractLabel: "Alternance",
  technologies: ["TypeScript"],
  ageLabel: "il y a 2 h",
  url: `https://jobs.example.test/${id}`,
  detailUrl: `https://findit.example.test/offres/${id}`,
});

const createPrisma = (alreadyNotified: readonly string[] = []) => ({
  telegramJobNotification: {
    findMany: vi.fn().mockResolvedValue(alreadyNotified.map((key) => ({ idempotencyKey: key }))),
    upsert: vi.fn().mockResolvedValue({ id: "notification-1" }),
  },
});

const createSender = (
  result: SendResult = { outcome: "sent" },
): TelegramSender & {
  readonly send: ReturnType<typeof vi.fn>;
} => ({ send: vi.fn().mockResolvedValue(result) }) as never;

const options = { chatId: "chat-1", maxJobsPerMessage: 2, maxJobsPerRun: 10 };

describe("notificationKey", () => {
  it("est stable pour un même chat, une même offre et un même type", () => {
    const first = notificationKey("chat-1", "job-1", NotificationType.NEW_JOB);
    const second = notificationKey("chat-1", "job-1", NotificationType.NEW_JOB);
    expect(first).toBe(second);
  });

  it("change dès qu'un des trois termes change", () => {
    const base = notificationKey("chat-1", "job-1", NotificationType.NEW_JOB);
    expect(notificationKey("chat-2", "job-1", NotificationType.NEW_JOB)).not.toBe(base);
    expect(notificationKey("chat-1", "job-2", NotificationType.NEW_JOB)).not.toBe(base);
  });
});

describe("notifyNewJobs", () => {
  it("n'envoie rien quand tout est déjà notifié", async () => {
    const jobs = [job("a"), job("b")];
    const keys = jobs.map((item) =>
      notificationKey("chat-1", item.jobId, NotificationType.NEW_JOB),
    );
    const prisma = createPrisma(keys);
    const sender = createSender();

    const summary = await notifyNewJobs(
      prisma as unknown as PrismaClient,
      sender,
      jobs,
      options,
      NOW,
    );

    expect(summary).toEqual({
      candidates: 2,
      alreadyNotified: 2,
      sent: 0,
      simulated: 0,
      failed: 0,
      messagesSent: 0,
    });
    expect(sender.send).not.toHaveBeenCalled();
    expect(prisma.telegramJobNotification.upsert).not.toHaveBeenCalled();
  });

  it("découpe en messages et persiste chaque envoi réussi", async () => {
    const jobs = [job("a"), job("b"), job("c"), job("d"), job("e")];
    const prisma = createPrisma();
    const sender = createSender({ outcome: "sent" });

    const summary = await notifyNewJobs(
      prisma as unknown as PrismaClient,
      sender,
      jobs,
      options,
      NOW,
    );

    // Cinq offres, deux par message.
    expect(sender.send).toHaveBeenCalledTimes(3);
    expect(summary).toMatchObject({
      candidates: 5,
      alreadyNotified: 0,
      sent: 5,
      messagesSent: 3,
      failed: 0,
      simulated: 0,
    });
    expect(prisma.telegramJobNotification.upsert).toHaveBeenCalledTimes(5);
    const first = prisma.telegramJobNotification.upsert.mock.calls[0]?.[0] as {
      create: { chatId: string; type: string; status: string; sentAt: Date };
    };
    expect(first.create).toMatchObject({
      chatId: "chat-1",
      type: NotificationType.NEW_JOB,
      status: NotificationStatus.SENT,
      sentAt: NOW,
    });
  });

  it("borne les offres traitées par exécution", async () => {
    const jobs = [job("a"), job("b"), job("c")];
    const prisma = createPrisma();
    const sender = createSender({ outcome: "sent" });

    const summary = await notifyNewJobs(
      prisma as unknown as PrismaClient,
      sender,
      jobs,
      { ...options, maxJobsPerRun: 2, maxJobsPerMessage: 2 },
      NOW,
    );

    expect(summary.sent).toBe(2);
    expect(prisma.telegramJobNotification.upsert).toHaveBeenCalledTimes(2);
  });

  it("compte la simulation sans rien persister", async () => {
    const prisma = createPrisma();
    const sender = createSender({ outcome: "skipped", detail: "simulation" });

    const summary = await notifyNewJobs(
      prisma as unknown as PrismaClient,
      sender,
      [job("a"), job("b")],
      options,
      NOW,
    );

    expect(summary).toMatchObject({ simulated: 2, sent: 0, messagesSent: 0 });
    expect(prisma.telegramJobNotification.upsert).not.toHaveBeenCalled();
  });

  it("compte l'échec sans rien persister, pour qu'il soit réessayé", async () => {
    const prisma = createPrisma();
    const sender = createSender({ outcome: "failed", detail: "Telegram a refusé" });

    const summary = await notifyNewJobs(
      prisma as unknown as PrismaClient,
      sender,
      [job("a")],
      options,
      NOW,
    );

    expect(summary).toMatchObject({ failed: 1, sent: 0, messagesSent: 0 });
    // Rien n'est écrit : une clé posée sur un échec enterrerait l'offre.
    expect(prisma.telegramJobNotification.upsert).not.toHaveBeenCalled();
  });
});
