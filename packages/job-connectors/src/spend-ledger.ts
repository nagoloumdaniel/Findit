import type { PrismaClient } from "@findit/database";

import type { SpendLedger } from "./spend-budget.js";

/**
 * Début du mois en UTC. Apify facture à partir de la date d'ouverture du
 * compte, qu'on ne connaît pas : le mois civil UTC est une approximation, d'où
 * la marge laissée sous le crédit mensuel (4,5 $ pour un crédit de 5 $).
 */
export const startOfMonthUtc = (now: Date): Date =>
  new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

/** Dépenses du mois, relues dans `ConnectorRun` : un redémarrage ne les perd pas. */
export const createPrismaSpendLedger = (prisma: PrismaClient): SpendLedger => ({
  monthToDateMicroUsd: async (now) => {
    const total = await prisma.connectorRun.aggregate({
      where: { startedAt: { gte: startOfMonthUtc(now) } },
      _sum: { costMicroUsd: true },
    });

    return total._sum.costMicroUsd ?? 0;
  },
});
