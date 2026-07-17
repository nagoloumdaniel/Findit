import type { ConnectorRegistration, RefusalReason } from "./access-policy.js";
import { decideCollectionAccess } from "./access-policy.js";
import type { JobSourceConnector, RawJob } from "./connector.js";
import { ThrottledJsonClient } from "./http.js";
import { CollectionPermit } from "./permit.js";

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

export interface RunConnectorDeps {
  readonly fetch: typeof globalThis.fetch;
  readonly sleep: (ms: number) => Promise<void>;
  /** Horloge monotone, en millisecondes, pour la cadence. */
  readonly monotonicNow: () => number;
  /** Horloge murale, pour les dates conservées. */
  readonly now: () => Date;
  readonly correlationId: string;
}

export interface ConnectorRunOutcome<TTarget = unknown> {
  readonly connectorName: string;
  readonly target: TTarget;
  readonly jobs: readonly RawJob[];
  readonly requestCount: number;
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
): Promise<ConnectorRunOutcome<TTarget>> => {
  const startedAt = deps.now();

  const decision = decideCollectionAccess(connector.name, registration, startedAt);
  if (!decision.allowed) {
    throw new CollectionRefusedError(connector.name, decision.reason, decision.detail);
  }

  const permit = new CollectionPermit(connector.name, registration.accessStatus, startedAt);
  const client = new ThrottledJsonClient({
    minRequestIntervalMs: connector.minRequestIntervalMs,
    fetch: deps.fetch,
    sleep: deps.sleep,
    monotonicNow: deps.monotonicNow,
  });

  const jobs = await connector.collect(permit, target, {
    fetchJson: (url) => client.fetchJson(url),
    now: deps.now,
    correlationId: deps.correlationId,
  });

  return {
    connectorName: connector.name,
    target,
    jobs,
    requestCount: client.requestCount,
    startedAt,
    finishedAt: deps.now(),
  };
};
