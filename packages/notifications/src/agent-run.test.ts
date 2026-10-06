import type { PrismaClient } from "@findit/database";
import { describe, expect, it, vi } from "vitest";

import { formatAgentRunMessage, notifyAgentRun } from "./agent-run.js";
import type { TelegramMessage } from "./telegram-format.js";
import type { SendResult, TelegramSender } from "./telegram-sender.js";

const STARTED_AT = new Date("2026-10-06T08:00:00.000Z");
const ENDED_AT = new Date("2026-10-06T08:30:00.000Z");

interface FakeRun {
  readonly startedAt: Date;
  readonly endedAt: Date | null;
  readonly pages: number;
  readonly errors: number;
}

interface FakeJobRow {
  readonly title: string;
  readonly slug: string;
  readonly canonicalUrl: string;
  readonly company: { readonly name: string };
}

const run = (over: Partial<FakeRun> = {}): FakeRun => ({
  startedAt: STARTED_AT,
  endedAt: ENDED_AT,
  pages: 12,
  errors: 2,
  ...over,
});

const jobRow = (over: Partial<FakeJobRow> = {}): FakeJobRow => ({
  title: "Développeur Front-end React",
  slug: "dev-front-42",
  canonicalUrl: "https://boards.greenhouse.io/acme/jobs/42",
  company: { name: "Acme" },
  ...over,
});

/** Doublure de Prisma : rend le run et les offres fixés, sans base. */
const prismaWith = (
  runRow: FakeRun | null,
  jobs: readonly FakeJobRow[],
): { prisma: PrismaClient; findMany: ReturnType<typeof vi.fn> } => {
  const findMany = vi.fn().mockResolvedValue(jobs);
  const prisma = {
    agentRun: { findUnique: vi.fn().mockResolvedValue(runRow) },
    job: { findMany },
  } as unknown as PrismaClient;
  return { prisma, findMany };
};

/** Doublure de TelegramSender : retient le message, sans réseau. */
const senderWith = (
  outcome: SendResult,
): { sender: TelegramSender; messages: TelegramMessage[] } => {
  const messages: TelegramMessage[] = [];
  const sender = {
    send: (message: TelegramMessage): Promise<SendResult> => {
      messages.push(message);
      return Promise.resolve(outcome);
    },
  } as unknown as TelegramSender;
  return { sender, messages };
};

describe("notifyAgentRun", () => {
  it("sends a run summary with no offer list when nothing was inserted", async () => {
    const { prisma } = prismaWith(run(), []);
    const { sender, messages } = senderWith({ outcome: "sent" });

    const summary = await notifyAgentRun({ prisma, sender, runId: "run-1", appUrl: null });

    expect(summary).toEqual({ offers: 0, sent: 1, simulated: 0, failed: 0 });
    expect(messages).toHaveLength(1);
    expect(messages[0]?.text).toContain("Offres insérées : 0");
    expect(messages[0]?.text).toContain("Pages visitées : 12");
    expect(messages[0]?.text).toContain("Erreurs : 2");
    expect(messages[0]?.text).not.toContain("Nouvelles offres");
  });

  it("lists each inserted offer with its title, company and link", async () => {
    const { prisma } = prismaWith(run(), [
      jobRow(),
      jobRow({
        title: "Alternance - Développeur Back-end",
        slug: "dev-back-7",
        canonicalUrl: "https://jobs.lever.co/acme/7",
        company: { name: "Beta" },
      }),
    ]);
    const { sender, messages } = senderWith({ outcome: "sent" });

    const summary = await notifyAgentRun({ prisma, sender, runId: "run-1", appUrl: null });

    expect(summary).toEqual({ offers: 2, sent: 1, simulated: 0, failed: 0 });
    expect(messages[0]?.text).toContain("Offres insérées : 2");
    expect(messages[0]?.text).toContain("Développeur Front-end React");
    expect(messages[0]?.text).toContain("Acme");
    expect(messages[0]?.text).toContain('href="https://boards.greenhouse.io/acme/jobs/42"');
    expect(messages[0]?.text).toContain("Développeur Back-end");
    expect(messages[0]?.text).toContain("Beta");
    expect(messages[0]?.text).toContain('href="https://jobs.lever.co/acme/7"');
  });

  it("attributes offers by the run's own time window", async () => {
    const { prisma, findMany } = prismaWith(run(), []);
    const { sender } = senderWith({ outcome: "sent" });

    await notifyAgentRun({ prisma, sender, runId: "run-1", appUrl: null });

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { firstSeenAt: { gte: STARTED_AT, lte: ENDED_AT } },
      }),
    );
  });

  it("links to Findit when appUrl is provided, otherwise to the source", async () => {
    const { prisma } = prismaWith(run(), [jobRow()]);
    const withAppUrl = senderWith({ outcome: "sent" });
    const withoutAppUrl = senderWith({ outcome: "sent" });

    await notifyAgentRun({
      prisma,
      sender: withAppUrl.sender,
      runId: "run-1",
      appUrl: "https://findit.example/",
    });
    await notifyAgentRun({
      prisma,
      sender: withoutAppUrl.sender,
      runId: "run-1",
      appUrl: null,
    });

    expect(withAppUrl.messages[0]?.text).toContain("https://findit.example/offres/dev-front-42");
    expect(withoutAppUrl.messages[0]?.text).toContain("https://boards.greenhouse.io/acme/jobs/42");
  });

  it("counts a simulated send as simulated, not sent", async () => {
    const { prisma } = prismaWith(run(), [jobRow()]);
    const { sender, messages } = senderWith({
      outcome: "skipped",
      detail: "Mode simulation : rien n'a été envoyé.",
    });

    const summary = await notifyAgentRun({ prisma, sender, runId: "run-1", appUrl: null });

    expect(summary).toEqual({ offers: 1, sent: 0, simulated: 1, failed: 0 });
    expect(messages).toHaveLength(1);
  });

  it("counts a failed send without throwing", async () => {
    const { prisma } = prismaWith(run(), [jobRow()]);
    const { sender } = senderWith({ outcome: "failed", detail: "Telegram a répondu 500." });

    const summary = await notifyAgentRun({ prisma, sender, runId: "run-1", appUrl: null });

    expect(summary).toEqual({ offers: 1, sent: 0, simulated: 0, failed: 1 });
  });

  it("does not send when the run is not found", async () => {
    const { prisma } = prismaWith(null, []);
    const { sender, messages } = senderWith({ outcome: "sent" });

    const summary = await notifyAgentRun({ prisma, sender, runId: "inconnu", appUrl: null });

    expect(summary).toEqual({ offers: 0, sent: 0, simulated: 0, failed: 0 });
    expect(messages).toHaveLength(0);
  });
});

describe("formatAgentRunMessage", () => {
  it("escapes HTML from untrusted offer content", () => {
    const message = formatAgentRunMessage({ inserted: 1, pages: 0, errors: 0 }, [
      { title: "Dev <script> & React", companyName: "A&B", url: "https://x.invalid/a" },
    ]);

    expect(message.text).toContain("Dev &lt;script&gt; &amp; React");
    expect(message.text).toContain("A&amp;B");
    expect(message.text).not.toContain("<script>");
  });
});
