import { describe, expect, it, vi } from "vitest";

import { formatNewJobsMessage } from "./telegram-format.js";
import type { NotifiableJob } from "./telegram-format.js";
import { notificationKey } from "./notify.js";
import { TelegramSender } from "./telegram-sender.js";

const NOW = new Date("2026-07-17T12:00:00.000Z");

const job = (over: Partial<NotifiableJob> = {}): NotifiableJob => ({
  title: "Alternance - Développeur Front-end React",
  companyName: "Acme",
  city: "Paris",
  roleLabel: "Front-end",
  contractLabel: "Alternance",
  technologies: ["React", "TypeScript"],
  ageLabel: "il y a 3 h",
  url: "https://boards.greenhouse.io/acme/jobs/42",
  detailUrl: "https://findit.example/offres/dev-react-42",
  ...over,
});

describe("formatNewJobsMessage", () => {
  it("announces the real count and each offer, linking the official source", () => {
    const message = formatNewJobsMessage(
      [job(), job({ title: "Back-end", url: "https://x/2" })],
      NOW,
    );

    expect(message.text).toContain("2 nouvelles offres");
    expect(message.text).toContain("Développeur Front-end React");
    expect(message.text).toContain('href="https://boards.greenhouse.io/acme/jobs/42"');
    expect(message.replyMarkup.inline_keyboard[0]?.[0]?.url).toContain("findit.example");
  });

  it("uses the singular for a single offer", () => {
    expect(formatNewJobsMessage([job()], NOW).text).toContain("1 nouvelle offre\n");
  });

  it("escapes HTML from untrusted source content", () => {
    const message = formatNewJobsMessage([job({ title: "Dev <script> & React" })], NOW);

    expect(message.text).toContain("Dev &lt;script&gt; &amp; React");
    expect(message.text).not.toContain("<script>");
  });
});

describe("TelegramSender", () => {
  it("sends nothing in dry-run mode", async () => {
    const fetchStub = vi.fn<typeof globalThis.fetch>();
    const sender = new TelegramSender({
      botToken: "SECRET",
      chatId: "1",
      dryRun: true,
      fetch: fetchStub,
    });

    const result = await sender.send(formatNewJobsMessage([job()], NOW));

    expect(result.outcome).toBe("skipped");
    expect(fetchStub).not.toHaveBeenCalled();
  });

  it("posts to the Telegram API when live", async () => {
    const fetchStub = vi.fn<typeof globalThis.fetch>(() =>
      Promise.resolve(new Response(JSON.stringify({ ok: true }), { status: 200 })),
    );
    const sender = new TelegramSender({
      botToken: "SECRET",
      chatId: "1",
      dryRun: false,
      fetch: fetchStub,
    });

    const result = await sender.send(formatNewJobsMessage([job()], NOW));

    expect(result.outcome).toBe("sent");
    expect(fetchStub).toHaveBeenCalledOnce();
  });

  it("never lets the token reach the error it returns", async () => {
    // L'erreur contient l'URL, donc le token : elle doit être expurgée.
    const fetchStub = vi.fn<typeof globalThis.fetch>((input) => {
      const target = typeof input === "string" ? input : "url";
      return Promise.reject(new Error(`ECONNREFUSED ${target}`));
    });
    const sender = new TelegramSender({
      botToken: "SECRET-TOKEN-123",
      chatId: "1",
      dryRun: false,
      fetch: fetchStub,
    });

    const result = await sender.send(formatNewJobsMessage([job()], NOW));

    expect(result.outcome).toBe("failed");
    if (result.outcome !== "failed") throw new Error("attendu échec");
    expect(result.detail).not.toContain("SECRET-TOKEN-123");
    expect(result.detail).toContain("[token]");
  });
});

describe("notificationKey", () => {
  it("is stable for the same chat, job and type", () => {
    expect(notificationKey("chat", "job", "NEW_JOB")).toBe(
      notificationKey("chat", "job", "NEW_JOB"),
    );
  });

  it("differs across jobs and chats", () => {
    expect(notificationKey("chat", "a", "NEW_JOB")).not.toBe(
      notificationKey("chat", "b", "NEW_JOB"),
    );
    expect(notificationKey("x", "job", "NEW_JOB")).not.toBe(notificationKey("y", "job", "NEW_JOB"));
  });
});
