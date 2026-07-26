import { ConnectorRunStatus, type PrismaClient } from "@findit/database";

import type { ConnectorRegistration } from "./access-policy.js";
import { decideCollectionAccess } from "./access-policy.js";
import type { JobSourceConnector } from "./connector.js";
import { HttpRequestError } from "./http.js";
import { loadRegistration } from "./registry.js";
import type { ConnectorRunOutcome, RunConnectorDeps } from "./run.js";
import { CollectionRefusedError, runConnector } from "./run.js";

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

  if (error instanceof CollectionRefusedError) {
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

  const runId = await store.openRun(connector.name, deps.correlationId, startedAt);

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

  try {
    const outcome = await runConnector(connector, registration, target, countedDeps);

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
