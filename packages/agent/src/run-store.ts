import type { Prisma, PrismaClient } from "@findit/database";

import { ACTION_KIND, type ActionKind, type TerminalRunStatus } from "./types.js";

/** Une action à consigner, avec son détail et son coût éventuels. */
export interface RecordActionInput {
  readonly kind: ActionKind;
  readonly detail?: string;
  readonly costMicroUsd?: number;
  /**
   * Nombre d'unités que l'action représente. Défaut : 1. Le stockage s'en sert
   * pour que `inserted` compte les offres écrites, pas les appels de stockage.
   */
  readonly count?: number;
}

/** Une erreur rencontrée pendant le run. */
export interface RecordErrorInput {
  readonly kind: string;
  readonly message: string;
  readonly retried?: boolean;
}

/**
 * Ce que l'exécution doit lire et écrire dans `AgentRun`, `AgentAction` et
 * `AgentError`. L'interface existe pour que l'enchaînement soit vérifiable
 * sans base, la base n'étant qu'une implémentation parmi d'autres.
 */
export interface AgentRunStore {
  startRun(objective: string): Promise<string>;
  recordAction(runId: string, input: RecordActionInput): Promise<void>;
  recordError(runId: string, input: RecordErrorInput): Promise<void>;
  finishRun(runId: string, status: TerminalRunStatus, endedAt?: Date): Promise<void>;
}

/**
 * Traduit une action en mise à jour du compteur correspondant de `AgentRun`.
 *
 * Seules certaines étapes avancent un compteur : CRAWL avance `pages`, STORE
 * avance `inserted`, et ainsi de suite. Le coût, lui, s'ajoute toujours.
 */
const runUpdateForAction = (
  kind: ActionKind,
  costMicroUsd: number,
  count: number,
): Prisma.AgentRunUncheckedUpdateInput => {
  const base: Prisma.AgentRunUncheckedUpdateInput = {
    costMicroUsd: { increment: costMicroUsd },
  };

  switch (kind) {
    case ACTION_KIND.SEARCH:
      return { ...base, searches: { increment: count } };
    case ACTION_KIND.CRAWL:
      return { ...base, pages: { increment: count } };
    case ACTION_KIND.EXTRACT:
      return { ...base, extracted: { increment: count } };
    case ACTION_KIND.VALIDATE:
      return { ...base, validated: { increment: count } };
    case ACTION_KIND.DEDUP:
      return { ...base, duplicates: { increment: count } };
    case ACTION_KIND.STORE:
      return { ...base, inserted: { increment: count } };
    case ACTION_KIND.DISCOVER:
    case ACTION_KIND.ANALYZE:
    case ACTION_KIND.PUBLISH:
    case ACTION_KIND.REJECT:
      return base;
  }
};

export const createAgentRunStore = (prisma: PrismaClient): AgentRunStore => ({
  startRun: async (objective) => {
    const run = await prisma.agentRun.create({
      data: { objective },
      select: { id: true },
    });

    return run.id;
  },

  recordAction: async (runId, input) => {
    const costMicroUsd = input.costMicroUsd ?? 0;
    const count = input.count ?? 1;

    await prisma.agentAction.create({
      data: {
        agentRunId: runId,
        kind: input.kind,
        detail: input.detail ?? null,
        costMicroUsd,
      },
    });

    await prisma.agentRun.update({
      where: { id: runId },
      data: runUpdateForAction(input.kind, costMicroUsd, count),
    });
  },

  recordError: async (runId, input) => {
    await prisma.agentError.create({
      data: {
        agentRunId: runId,
        kind: input.kind,
        message: input.message,
        retried: input.retried ?? false,
      },
    });

    await prisma.agentRun.update({
      where: { id: runId },
      data: { errors: { increment: 1 } },
    });
  },

  finishRun: async (runId, status, endedAt = new Date()) => {
    await prisma.agentRun.update({
      where: { id: runId },
      data: { status, endedAt },
    });
  },
});
