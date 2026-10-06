import type { PrismaClient } from "@findit/database";

import type { TelegramMessage } from "./telegram-format.js";
import type { TelegramSender } from "./telegram-sender.js";

/**
 * Ce dont le résumé d'un run de l'agent a besoin pour annoncer une offre.
 * Volontairement étroit : la notification annonce, elle ne détaille pas.
 */
export interface AgentRunOffer {
  readonly title: string;
  readonly companyName: string;
  /** Lien de la fiche : le site Findit quand `appUrl` est fourni, sinon la source. */
  readonly url: string;
}

/** Les compteurs du run qui entrent dans le résumé. */
export interface AgentRunCounts {
  readonly inserted: number;
  readonly pages: number;
  readonly errors: number;
}

export interface NotifyAgentRunDeps {
  readonly prisma: PrismaClient;
  readonly sender: TelegramSender;
  readonly runId: string;
  readonly appUrl: string | null;
  /**
   * Horloge injectée. Défaut : l'heure réelle ; remplacée dans les tests pour
   * borner la fenêtre d'attribution des offres de façon reproductible.
   */
  readonly now?: Date;
}

export interface NotifyAgentRunSummary {
  /** Offres réellement insérées pendant le run, relues en base. */
  readonly offers: number;
  readonly sent: number;
  readonly simulated: number;
  readonly failed: number;
}

const escapeHtml = (text: string): string =>
  text.replace(/&/gu, "&amp;").replace(/</gu, "&lt;").replace(/>/gu, "&gt;");

/**
 * Compose le message de résumé d'un run de l'agent.
 *
 * Toujours envoyé, même sans offre : le résumé dit ce que le run a fait. Les
 * offres ne s'ajoutent que si le run en a réellement inséré ; le message ne
 * ment jamais sur son contenu.
 */
export const formatAgentRunMessage = (
  counts: AgentRunCounts,
  offers: readonly AgentRunOffer[],
): TelegramMessage => {
  const lines = [
    "🤖 <b>Résumé du run de l'agent</b>",
    "",
    `Offres insérées : ${String(counts.inserted)}`,
    `Pages visitées : ${String(counts.pages)}`,
    `Erreurs : ${String(counts.errors)}`,
  ];

  if (offers.length > 0) {
    lines.push("", "<b>Nouvelles offres :</b>");
    for (const offer of offers) {
      lines.push(
        `💼 <a href="${escapeHtml(offer.url)}">${escapeHtml(offer.title)}</a> - ${escapeHtml(offer.companyName)}`,
      );
    }
  }

  return { text: lines.join("\n"), replyMarkup: { inline_keyboard: [] } };
};

/**
 * Notifie le résumé d'un run de l'agent.
 *
 * Le schéma ne relie pas `Job` à `AgentRun` : la fenêtre `[startedAt, endedAt]`
 * du run est le seul moyen fiable de rattacher les offres qu'il a insérées. Le
 * worker traite les jobs en concurrence 1, donc aucune autre collecte ne peut
 * écrire dans cette fenêtre. Le nombre d'offres est relu en base, pas repris du
 * compteur `AgentRun.inserted` qui ne compte que l'action STORE.
 */
export const notifyAgentRun = async (deps: NotifyAgentRunDeps): Promise<NotifyAgentRunSummary> => {
  const now = deps.now ?? new Date();

  const run = await deps.prisma.agentRun.findUnique({
    where: { id: deps.runId },
    select: { startedAt: true, endedAt: true, pages: true, errors: true },
  });

  // Run introuvable : rien à résumer, aucune offre ne peut lui être attribuée.
  // On n'invente pas de compteurs et on n'envoie rien.
  if (run === null) {
    return { offers: 0, sent: 0, simulated: 0, failed: 0 };
  }

  const rows = await deps.prisma.job.findMany({
    where: {
      firstSeenAt: { gte: run.startedAt, lte: run.endedAt ?? now },
    },
    orderBy: { publishedAt: "desc" },
    include: { company: { select: { name: true } } },
  });

  const base = deps.appUrl === null ? null : deps.appUrl.replace(/\/$/u, "");
  const offers: AgentRunOffer[] = rows.map((row) => ({
    title: row.title,
    companyName: row.company.name,
    url: base === null ? row.canonicalUrl : `${base}/offres/${row.slug}`,
  }));

  const message = formatAgentRunMessage(
    { inserted: offers.length, pages: run.pages, errors: run.errors },
    offers,
  );

  const result = await deps.sender.send(message);

  if (result.outcome === "skipped") {
    // Mode simulation : le message serait parti, rien n'est envoyé ni persisté.
    return { offers: offers.length, sent: 0, simulated: 1, failed: 0 };
  }
  if (result.outcome === "failed") {
    // Échec d'envoi : rien n'est écrit, le prochain run fera son propre résumé.
    return { offers: offers.length, sent: 0, simulated: 0, failed: 1 };
  }
  return { offers: offers.length, sent: 1, simulated: 0, failed: 0 };
};
