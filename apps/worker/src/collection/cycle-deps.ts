import { randomUUID } from "node:crypto";

import type { WorkerEnv } from "@findit/config";
import type { PrismaClient } from "@findit/database";
import type {
  CollectableSource,
  CollectionTarget,
  DiscoveredSource,
  JobSourceConnector,
  RunConnectorDeps,
  WebSearchProvider,
  WebSearchQuery,
  WebSearchResult,
} from "@findit/job-connectors";
import {
  BraveSearchProvider,
  createPrismaConnectorRunStore,
  greenhouseConnector,
  GREENHOUSE_CONNECTOR_NAME,
  leverConnector,
  LEVER_CONNECTOR_NAME,
  listCollectableSources,
  registerDiscoveredSource,
} from "@findit/job-connectors";
import { createIngestionPersistence, runCollection } from "./run-collection.js";
import type { CycleDeps } from "./run-cycle.js";

/** Connecteurs qui se collectent par jeton d'entreprise, par nom. */
const TOKEN_CONNECTORS: ReadonlyMap<string, JobSourceConnector<CollectionTarget>> = new Map([
  [GREENHOUSE_CONNECTOR_NAME, greenhouseConnector],
  [LEVER_CONNECTOR_NAME, leverConnector],
]);

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

/** Une recherche qui ne trouve jamais rien : la découverte sans clé Brave. */
const noDiscovery = (): Promise<readonly WebSearchResult[]> => Promise.resolve([]);

/**
 * Assemble les dépendances réelles d'un cycle depuis l'environnement.
 *
 * Sans clé Brave, la recherche est neutralisée : le cycle collecte les
 * entreprises déjà connues du registre, sans en découvrir de nouvelles. La clé
 * ne quitte pas ce module.
 */
export const createCycleDeps = (prisma: PrismaClient, env: WorkerEnv): CycleDeps => {
  const store = createPrismaConnectorRunStore(prisma);
  const persistence = createIngestionPersistence(prisma, () => new Date());

  const provider: WebSearchProvider | null =
    env.BRAVE_SEARCH_API_KEY === undefined
      ? null
      : new BraveSearchProvider({ apiKey: env.BRAVE_SEARCH_API_KEY, fetch: globalThis.fetch });

  const search = (query: WebSearchQuery): Promise<readonly WebSearchResult[]> =>
    provider === null ? noDiscovery() : provider.search(query);

  const connectorDeps: RunConnectorDeps = {
    fetch: globalThis.fetch,
    sleep,
    monotonicNow: () => performance.now(),
    now: () => new Date(),
    // Un identifiant par cycle relie tous les journaux d'une même exécution.
    correlationId: `cycle-${randomUUID()}`,
  };

  return {
    search,
    registerSource: (source: DiscoveredSource) => registerDiscoveredSource(prisma, source),
    listSources: (): Promise<readonly CollectableSource[]> => listCollectableSources(prisma),
    collect: (jobs) =>
      runCollection(jobs, { store, persistence, connectorDeps, now: () => new Date() }),
    connectorFor: (name) => TOKEN_CONNECTORS.get(name) ?? null,
    pace: sleep,
    // Sans clé, aucune requête : la découverte est simplement sautée.
    maxQueries: provider === null ? 0 : env.WEB_SEARCH_MAX_QUERIES_PER_RUN,
    searchIntervalMs: 1000,
    sourcePriority: 100,
  };
};
