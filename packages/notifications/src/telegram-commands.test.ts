import { describe, expect, it, vi } from "vitest";

import {
  buildLatestReply,
  buildStatusReply,
  parseTelegramCommand,
  pollTelegramCommands,
  type TelegramCommandDeps,
} from "./telegram-commands.js";

describe("parseTelegramCommand", () => {
  it("reads the four commands, with or without the bot suffix", () => {
    expect(parseTelegramCommand("/start")).toBe("start");
    expect(parseTelegramCommand("/status@FinditBot")).toBe("status");
    expect(parseTelegramCommand(" /latest ")).toBe("latest");
    expect(parseTelegramCommand("/help")).toBe("help");
    expect(parseTelegramCommand("bonjour")).toBeNull();
    expect(parseTelegramCommand("/statuses")).toBeNull();
  });
});

describe("buildStatusReply / buildLatestReply", () => {
  it("says when no cycle ran and when the list is empty, instead of inventing", () => {
    expect(
      buildStatusReply({ publishedCount: 0, publishedLast24h: 0, lastCycleAt: null }).text,
    ).toContain("Aucun cycle");
    expect(buildLatestReply([]).text).toContain("Hors saison");
  });

  it("escapes offer fields before putting them in HTML", () => {
    const reply = buildLatestReply([
      { title: "Dev <script>", companyName: "A&B", city: "Paris", url: "https://x.invalid/a" },
    ]);
    expect(reply.text).toContain("Dev &lt;script&gt;");
    expect(reply.text).toContain("A&amp;B");
  });
});

/** Doublure de fetch : rend les mises à jour Telegram fixées. */
const fetchWith = (updates: unknown[]): typeof globalThis.fetch =>
  vi.fn(() =>
    Promise.resolve(
      new Response(JSON.stringify({ ok: true, result: updates }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    ),
  );

const baseDeps = (fetchImpl: typeof globalThis.fetch): TelegramCommandDeps & { sent: string[] } => {
  const sent: string[] = [];
  return {
    botToken: "secret-token",
    chatId: "42",
    fetch: fetchImpl,
    send: (message) => {
      sent.push(message.text);
      return Promise.resolve({ outcome: "sent" });
    },
    loadStatus: () =>
      Promise.resolve({ publishedCount: 3, publishedLast24h: 1, lastCycleAt: null }),
    loadLatest: () => Promise.resolve([]),
    sent,
  };
};

describe("pollTelegramCommands", () => {
  it("answers a command from the configured chat and advances the offset", async () => {
    const deps = baseDeps(
      fetchWith([{ update_id: 7, message: { chat: { id: 42 }, text: "/status" } }]),
    );

    const outcome = await pollTelegramCommands(deps, null);

    expect(outcome).toMatchObject({ nextOffset: 8, handled: 1, failure: null });
    expect(deps.sent[0]).toContain("Offres publiées : 3");
  });

  it("ignores any other chat without ever replying", async () => {
    const deps = baseDeps(
      fetchWith([{ update_id: 9, message: { chat: { id: 999 }, text: "/latest" } }]),
    );

    const outcome = await pollTelegramCommands(deps, null);

    expect(outcome).toMatchObject({ nextOffset: 10, handled: 0 });
    expect(deps.sent).toHaveLength(0);
  });

  it("reports a network failure without the token, keeping the offset", async () => {
    const failing = vi.fn(() =>
      Promise.reject(new Error("boom secret-token boom")),
    ) as unknown as typeof globalThis.fetch;
    const deps = baseDeps(failing);

    const outcome = await pollTelegramCommands(deps, 5);

    expect(outcome.nextOffset).toBe(5);
    expect(outcome.failure).toContain("[token]");
    expect(outcome.failure).not.toContain("secret-token");
  });
});
