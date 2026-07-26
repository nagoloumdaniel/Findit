import type { TelegramMessage } from "./telegram-format.js";

/*
 * Commandes du bot : /start, /status, /latest, /help. Le bot ne répond qu'au
 * chat configuré - toute autre conversation est ignorée sans réponse : aucune
 * donnée privée ne part vers un inconnu. Les erreurs ne journalisent jamais
 * le token.
 */

export type TelegramCommand = "start" | "status" | "latest" | "help";

const COMMAND_PATTERN = /^\/(start|status|latest|help)(?:@[\w]+)?\s*$/u;

export const parseTelegramCommand = (text: string): TelegramCommand | null => {
  const match = COMMAND_PATTERN.exec(text.trim());
  return match === null ? null : (match[1] as TelegramCommand);
};

const escapeHtml = (text: string): string =>
  text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");

export interface CommandStatus {
  readonly publishedCount: number;
  readonly publishedLast24h: number;
  readonly lastCycleAt: Date | null;
}

export interface CommandLatestJob {
  readonly title: string;
  readonly companyName: string;
  readonly city: string;
  readonly url: string;
}

const HELP_TEXT = [
  "<b>Commandes Findit</b>",
  "/status - état de la collecte et compte des offres",
  "/latest - les 5 dernières offres publiées",
  "/help - cette aide",
].join("\n");

export const buildStartReply = (): TelegramMessage => ({
  replyMarkup: { inline_keyboard: [] },
  text: `Findit veille les offres d'alternance et de stage développeur en Île-de-France.\n${HELP_TEXT}`,
});

export const buildHelpReply = (): TelegramMessage => ({
  replyMarkup: { inline_keyboard: [] },
  text: HELP_TEXT,
});

export const buildStatusReply = (status: CommandStatus): TelegramMessage => ({
  replyMarkup: { inline_keyboard: [] },
  text: [
    "<b>État Findit</b>",
    `Offres publiées : ${String(status.publishedCount)}`,
    `Publiées ces 24 h : ${String(status.publishedLast24h)}`,
    status.lastCycleAt === null
      ? "Aucun cycle de collecte enregistré."
      : `Dernier cycle : ${status.lastCycleAt.toISOString()}`,
  ].join("\n"),
});

export const buildLatestReply = (jobs: readonly CommandLatestJob[]): TelegramMessage => ({
  replyMarkup: { inline_keyboard: [] },
  text:
    jobs.length === 0
      ? "Aucune offre publiée récemment. Hors saison, c'est un résultat normal."
      : [
          "<b>Dernières offres publiées</b>",
          ...jobs.map(
            (job) =>
              `- <a href="${escapeHtml(job.url)}">${escapeHtml(job.title)}</a> - ${escapeHtml(job.companyName)} (${escapeHtml(job.city)})`,
          ),
        ].join("\n"),
});

const redactToken = (text: string, token: string): string =>
  token === "" ? text : text.split(token).join("[token]");

interface UpdateShape {
  readonly update_id: number;
  readonly message?: {
    readonly chat?: { readonly id?: number | string };
    readonly text?: string;
  };
}

export interface TelegramCommandDeps {
  readonly botToken: string;
  readonly chatId: string;
  readonly fetch: typeof globalThis.fetch;
  readonly send: (message: TelegramMessage) => Promise<unknown>;
  readonly loadStatus: () => Promise<CommandStatus>;
  readonly loadLatest: () => Promise<readonly CommandLatestJob[]>;
}

export interface PollOutcome {
  readonly nextOffset: number | null;
  readonly handled: number;
  readonly failure: string | null;
}

/**
 * Un tour de sondage `getUpdates` : lit les messages en attente, répond aux
 * commandes du chat configuré, rend l'offset du prochain tour. Une panne
 * réseau rend un échec expurgé du token, jamais une exception.
 */
export const pollTelegramCommands = async (
  deps: TelegramCommandDeps,
  offset: number | null,
): Promise<PollOutcome> => {
  const url =
    `https://api.telegram.org/bot${deps.botToken}/getUpdates?timeout=0` +
    (offset === null ? "" : `&offset=${String(offset)}`);

  let updates: UpdateShape[];
  try {
    const response = await deps.fetch(url);
    if (!response.ok) {
      return {
        nextOffset: offset,
        handled: 0,
        failure: `Telegram a répondu ${String(response.status)}.`,
      };
    }
    const payload = (await response.json()) as { ok?: boolean; result?: UpdateShape[] };
    updates = payload.result ?? [];
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Erreur inconnue.";
    return { nextOffset: offset, handled: 0, failure: redactToken(detail, deps.botToken) };
  }

  let nextOffset = offset;
  let handled = 0;

  for (const update of updates) {
    nextOffset = update.update_id + 1;

    // Seul le chat du propriétaire est servi : les autres sont ignorés.
    const chatId = update.message?.chat?.id;
    if (chatId === undefined || String(chatId) !== deps.chatId) {
      continue;
    }

    const command = parseTelegramCommand(update.message?.text ?? "");
    if (command === null) {
      continue;
    }

    if (command === "start") {
      await deps.send(buildStartReply());
    } else if (command === "help") {
      await deps.send(buildHelpReply());
    } else if (command === "status") {
      await deps.send(buildStatusReply(await deps.loadStatus()));
    } else {
      await deps.send(buildLatestReply(await deps.loadLatest()));
    }
    handled += 1;
  }

  return { nextOffset, handled, failure: null };
};
