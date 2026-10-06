import { ConnectorRunStatus, type PrismaClient } from "@findit/database";

import type { ConnectorRegistration } from "./access-policy.js";
import { decideCollectionAccess } from "./access-policy.js";
import type { JobSourceConnector } from "./connector.js";
import { HttpRequestError } from "./http.js";
import { loadRegistration } from "./registry.js";
import type { ConnectorRunOutcome, RunConnectorDeps } from "./run.js";
import {
  BudgetGuardMissingError,
  BudgetRefusedError,
  CollectionRefusedError,
  RunTracker,
  runConnector,
} from "./run.js";
import type { BudgetTicket } from "./spend-budget.js";

export class ConnectorNotRegisteredError extends Error {
  override readonly name = "ConnectorNotRegisteredError";

  constructor(readonly connectorName: string) {
    super(
      `Le connecteur « ${connectorName} » n'a aucune ligne dans le registre : rien ne l'autorise à s'exécuter.`,
    );
  }
}

export interface RecordedError {
  readonly kind: string;
  readonly message: string;
  readonly url: string | null;
}

export interface ClosedRun {
  readonly status: ConnectorRunStatus;
  readonly finishedAt: Date;
  readonly pagesFetched: number;
  readonly jobsDiscovered: number;
  readonly errorCount: number;
}

/**
 * Ce que le tri des offres a donné, une fois la collecte finie. Séparé de
 * `ClosedRun` parce que ces comptes ne sont connus qu'après la décision
 * d'ingestion, qui a lieu hors de ce paquet : l'exécuteur ferme la collecte,
 * l'orchestrateur y ajoute le sort des offres.
 */
export interface DecisionCounts {
  readonly jobsAccepted: number;
  readonly jobsRejected: number;
  readonly jobsQuarantined: number;
}

/**
 * Ce que l'exécution a besoin de lire et d'écrire. L'interface existe pour que
 * l'enchaînement - lire le registre, ouvrir, fermer, consigner - soit
 * vérifiable sans base, et que la base ne soit qu'une implémentation parmi
 * d'autres.
 */
export interface ConnectorRunStore {
  loadRegistration(connectorName: string): Promise<ConnectorRegistration | null>;
  openRun(connectorName: string, correlationId: string, startedAt: Date): Promise<string>;
  closeRun(runId: string, result: ClosedRun): Promise<void>;
  recordError(connectorName: string, runId: string | null, error: RecordedError): Promise<void>;
  recordDecisionCounts(runId: string, counts: DecisionCounts): Promise<void>;
  /** Consigne ce que l'exécution a coûté, en micro-dollars entiers. */
  recordCost(runId: string, costMicroUsd: number): Promise<void>;
}

export const createPrismaConnectorRunStore = (prisma: PrismaClient): ConnectorRunStore => {
  const connectorIdFor = async (connectorName: string): Promise<string> => {
    const row = await prisma.connector.findUnique({
      where: { name: connectorName },
      select: { id: true },
    });

    if (row === null) {
      throw new ConnectorNotRegisteredError(connectorName);
    }

    return row.id;
  };

  return {
    loadRegistration: (connectorName) => loadRegistration(prisma, connectorName),

    openRun: async (connectorName, correlationId, startedAt) => {
      const run = await prisma.connectorRun.create({
        data: {
          connectorId: await connectorIdFor(connectorName),
          correlationId,
          startedAt,
          status: ConnectorRunStatus.RUNNING,
        },
        select: { id: true },
      });

      return run.id;
    },

    closeRun: async (runId, result) => {
      await prisma.connectorRun.update({ where: { id: runId }, data: result });
    },

    recordDecisionCounts: async (runId, counts) => {
      await prisma.connectorRun.update({ where: { id: runId }, data: counts });
    },

    recordCost: async (runId, costMicroUsd) => {
      await prisma.connectorRun.update({ where: { id: runId }, data: { costMicroUsd } });
    },

    recordError: async (connectorName, runId, error) => {
      await prisma.connectorError.create({
        data: {
          connectorId: await connectorIdFor(connectorName),
          runId,
          kind: error.kind,
          message: error.message,
          url: error.url,
        },
      });
    },
  };
};

const describeError = (error: unknown): RecordedError => {
  if (error instanceof HttpRequestError) {
    return { kind: error.name, message: error.message, url: error.url };
  }

  if (error instanceof CollectionRefusedError || error instanceof BudgetRefusedError) {
    return { kind: error.reason, message: error.detail, url: null };
  }

  if (error instanceof Error) {
    return { kind: error.name, message: error.message, url: null };
  }

  return { kind: "UnknownError", message: "Erreur sans message.", url: null };
};

/**
 * Exécute un connecteur et laisse une trace de ce qui s'est passé : une ligne
 * `ConnectorRun` du début à la fin, et une `ConnectorError` dès que ça casse.
 *
 * Le droit de collecter est lu en base, à chaque exécution. Un registre modifié
 * s'applique donc à la collecte suivante sans qu'aucun code ne change.
 */
/**
 * Une issue de collecte, augmentée de l'identifiant de son exécution. Le
 * `runId` permet à l'orchestrateur d'ajouter le sort des offres à la même ligne
 * `ConnectorRun`, une fois la décision d'ingestion prise.
 */
export type RecordedRunOutcome<TTarget> = ConnectorRunOutcome<TTarget> & { readonly runId: string };

export const runRecordedConnector = async <TTarget>(
  store: ConnectorRunStore,
  connector: JobSourceConnector<TTarget>,
  target: TTarget,
  deps: RunConnectorDeps,
): Promise<RecordedRunOutcome<TTarget>> => {
  const registration = await store.loadRegistration(connector.name);
  if (registration === null) {
    // Sans ligne, il n'existe même pas de connecteur auquel rattacher l'erreur.
    throw new ConnectorNotRegisteredError(connector.name);
  }

  const startedAt = deps.now();

  /*
   * `runConnector` refait ce contrôle : il reste la porte, et rien ne passe
   * derrière lui. Ici, il sert seulement à ne pas ouvrir d'exécution pour une
   * source qui n'a pas le droit de tourner - un refus n'est pas une exécution.
   * Il est consigné comme erreur, sans ligne d'exécution, ce que `runId`
   * facultatif permet exactement.
   */
  const decision = decideCollectionAccess(connector.name, registration, startedAt);
  if (!decision.allowed) {
    await store.recordError(connector.name, null, {
      kind: decision.reason,
      message: decision.detail,
      url: null,
    });

    throw new CollectionRefusedError(connector.name, decision.reason, decision.detail);
  }

  const tracker = new RunTracker();
  let ticket: BudgetTicket | null = null;
  let estimatedMicroUsd = 0;

  /*
   * Source payante : la dépense est décidée AVANT d'ouvrir l'exécution, sur le
   * coût maximal. Un refus n'est pas une exécution - comme un refus d'accès, il
   * est consigné comme erreur, sans ligne `ConnectorRun`, et le cycle continue
   * avec les autres sources.
   */
  if (connector.estimateCostMicroUsd !== undefined) {
    if (deps.budget === undefined) {
      const missing = new BudgetGuardMissingError(connector.name);
      await store.recordError(connector.name, null, describeError(missing));
      throw missing;
    }

    try {
      estimatedMicroUsd = connector.estimateCostMicroUsd(target);
    } catch (error) {
      await store.recordError(connector.name, null, describeError(error));
      throw error;
    }

    const budgetDecision = await deps.budget.authorize(
      connector.name,
      estimatedMicroUsd,
      startedAt,
    );
    if (!budgetDecision.allowed) {
      const refusal = new BudgetRefusedError(
        connector.name,
        budgetDecision.reason,
        budgetDecision.detail,
      );
      await store.recordError(connector.name, null, describeError(refusal));
      throw refusal;
    }

    ticket = budgetDecision.ticket;
    tracker.budgetAuthorized = true;
  }

  let runId: string;
  try {
    runId = await store.openRun(connector.name, deps.correlationId, startedAt);
  } catch (error) {
    // Aucune exécution n'a eu lieu : la réservation est rendue entière.
    ticket?.settle(0);
    throw error;
  }

  /*
   * Les requêtes sont comptées ici aussi : une collecte qui échoue ne rend
   * aucune issue à interroger, mais elle a bel et bien touché la source. Sans
   * ce compte, une exécution ratée déclarerait zéro page alors qu'elle en a
   * demandé plusieurs.
   */
  let requestCount = 0;
  const countedDeps: RunConnectorDeps = {
    ...deps,
    fetch: (input, init) => {
      requestCount += 1;
      return deps.fetch(input, init);
    },
  };

  /*
   * Le coût est consigné au registre AVANT de clore le billet de budget : la
   * garde relit le cumul du mois dans ce registre, et ne doit jamais voir un
   * run clos dont le coût n'y serait pas encore.
   */
  const settleSpend = async (costMicroUsd: number): Promise<void> => {
    try {
      if (connector.estimateCostMicroUsd !== undefined) {
        await store.recordCost(runId, costMicroUsd);
      }
    } finally {
      ticket?.settle(costMicroUsd);
    }
  };

  const recordNotices = async (): Promise<void> => {
    for (const notice of tracker.notices) {
      await store.recordError(connector.name, runId, {
        kind: notice.kind,
        message: notice.message,
        url: null,
      });
    }
  };

  try {
    const outcome = await runConnector(connector, registration, target, countedDeps, tracker);

    // Une source payante qui n'a rien déclaré est supposée avoir coûté le pire :
    // consigner zéro serait mentir sur une dépense probable.
    const isPaid = connector.estimateCostMicroUsd !== undefined;
    if (isPaid && !tracker.costReported) {
      tracker.notices.push({
        kind: "CostNotReported",
        message: `Le connecteur n'a déclaré aucun coût : le coût maximal estimé (${String(estimatedMicroUsd)} micro-dollars) est consigné.`,
      });
    }
    await recordNotices();
    await settleSpend(isPaid && !tracker.costReported ? estimatedMicroUsd : tracker.costMicroUsd);

    await store.closeRun(runId, {
      status: ConnectorRunStatus.SUCCEEDED,
      finishedAt: outcome.finishedAt,
      pagesFetched: outcome.requestCount,
      jobsDiscovered: outcome.jobs.length,
      errorCount: 0,
    });

    return { ...outcome, runId };
  } catch (error) {
    await store.recordError(connector.name, runId, describeError(error));
    await recordNotices();
    // Un échec n'efface pas la facture : le coût déclaré avant la panne reste.
    await settleSpend(tracker.costMicroUsd);
    await store.closeRun(runId, {
      status: ConnectorRunStatus.FAILED,
      finishedAt: deps.now(),
      pagesFetched: requestCount,
      jobsDiscovered: 0,
      errorCount: 1,
    });

    throw error;
  }
};
