import type { ConnectorRegistration, RefusalReason } from "./access-policy.js";
import { decideCollectionAccess } from "./access-policy.js";
import type { JobSourceConnector, RawJob } from "./connector.js";
import { ThrottledJsonClient } from "./http.js";
import { CollectionPermit } from "./permit.js";
import type { CycleBudget } from "./spend-budget.js";

export class CollectionRefusedError extends Error {
  override readonly name = "CollectionRefusedError";

  constructor(
    readonly connectorName: string,
    readonly reason: RefusalReason,
    readonly detail: string,
  ) {
    super(`Collecte refusée pour « ${connectorName} » : ${detail}`);
  }
}

/**
 * Une source payante qui s'exécute sans garde de budget : le code est faux, pas
 * la configuration. L'erreur existe pour que ce cas échoue bruyamment au lieu de
 * dépenser sans plafond.
 */
export class BudgetGuardMissingError extends Error {
  override readonly name = "BudgetGuardMissingError";

  constructor(readonly connectorName: string) {
    super(
      `Le connecteur payant « ${connectorName} » ne peut pas s'exécuter sans garde de budget : le cycle n'en a fourni aucune.`,
    );
  }
}

/** Le budget du cycle ou du mois ne permet pas ce run : la source est ignorée. */
export class BudgetRefusedError extends Error {
  override readonly name = "BudgetRefusedError";

  constructor(
    readonly connectorName: string,
    readonly reason: string,
    readonly detail: string,
  ) {
    super(`Collecte refusée pour « ${connectorName} » : ${detail}`);
  }
}

/**
 * Ce que l'exécution a déclaré en cours de route. Il est créé par l'appelant, et
 * non par `runConnector`, pour rester lisible quand la collecte échoue : le coût
 * d'un run raté a pu être facturé, il doit être consigné quand même.
 */
export class RunTracker {
  costMicroUsd = 0;
  /** Vrai dès que la source a déclaré un coût, même nul : « zéro » est une réponse. */
  costReported = false;
  readonly notices: { readonly kind: string; readonly message: string }[] = [];
  /**
   * Posé par l'appelant une fois la garde de budget passée. Sans lui, un
   * connecteur payant est refusé : la permission de dépenser est une étape qui
   * se constate, pas une promesse.
   */
  budgetAuthorized = false;
}

export interface RunConnectorDeps {
  readonly fetch: typeof globalThis.fetch;
  readonly sleep: (ms: number) => Promise<void>;
  /** Horloge monotone, en millisecondes, pour la cadence. */
  readonly monotonicNow: () => number;
  /** Horloge murale, pour les dates conservées. */
  readonly now: () => Date;
  readonly correlationId: string;
  /**
   * Garde de budget du cycle, pour les sources payantes. Absente, une source
   * payante ne s'exécute pas.
   */
  readonly budget?: CycleBudget;
}

export interface ConnectorRunOutcome<TTarget = unknown> {
  readonly connectorName: string;
  readonly target: TTarget;
  readonly jobs: readonly RawJob[];
  readonly requestCount: number;
  /** Coût déclaré par la source, en micro-dollars ; zéro pour une source gratuite. */
  readonly costMicroUsd: number;
  readonly startedAt: Date;
  readonly finishedAt: Date;
}

/**
 * La seule façon d'exécuter un connecteur. Le droit de collecter est vérifié
 * ici, contre le registre, avant qu'un permis n'existe ; sans permis, `collect`
 * ne peut pas être appelé. Un connecteur interdit n'est donc pas exécutable,
 * quelle que soit la bonne volonté de l'appelant.
 */
export const runConnector = async <TTarget>(
  connector: JobSourceConnector<TTarget>,
  registration: ConnectorRegistration,
  target: TTarget,
  deps: RunConnectorDeps,
  tracker: RunTracker = new RunTracker(),
): Promise<ConnectorRunOutcome<TTarget>> => {
  const startedAt = deps.now();

  const decision = decideCollectionAccess(connector.name, registration, startedAt);
  if (!decision.allowed) {
    throw new CollectionRefusedError(connector.name, decision.reason, decision.detail);
  }

  if (connector.estimateCostMicroUsd !== undefined && !tracker.budgetAuthorized) {
    throw new BudgetGuardMissingError(connector.name);
  }

  const permit = new CollectionPermit(connector.name, registration.accessStatus, startedAt);
  const client = new ThrottledJsonClient({
    minRequestIntervalMs: connector.minRequestIntervalMs,
    fetch: deps.fetch,
    sleep: deps.sleep,
    monotonicNow: deps.monotonicNow,
  });

  const jobs = await connector.collect(permit, target, {
    fetchJson: (url, init) => client.fetchJson(url, init),
    fetchText: (url) => client.fetchText(url),
    now: deps.now,
    correlationId: deps.correlationId,
    reportCostMicroUsd: (totalMicroUsd) => {
      tracker.costMicroUsd = totalMicroUsd;
      tracker.costReported = true;
    },
    reportNotice: (kind, message) => {
      tracker.notices.push({ kind, message });
    },
  });

  return {
    connectorName: connector.name,
    target,
    jobs,
    requestCount: client.requestCount,
    costMicroUsd: tracker.costMicroUsd,
    startedAt,
    finishedAt: deps.now(),
  };
};
