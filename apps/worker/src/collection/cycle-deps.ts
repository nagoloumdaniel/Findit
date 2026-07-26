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
import type { SearchTarget } from "@findit/job-connectors";
import {
  BraveSearchProvider,
  createFranceTravailConnector,
  createPrismaConnectorRunStore,
  greenhouseConnector,
  GREENHOUSE_CONNECTOR_NAME,
  leverConnector,
  LEVER_CONNECTOR_NAME,
  listCollectableSources,
  registerDiscoveredSource,
  workableConnector,
  workdayConnector,
  WORKDAY_CONNECTOR_NAME,
} from "@findit/job-connectors";
import type { CollectionJob } from "./run-collection.js";
import { createIngestionPersistence, runCollection } from "./run-collection.js";
import type { CycleDeps } from "./run-cycle.js";

/** Connecteurs qui se collectent par jeton d'entreprise, par nom. */
const TOKEN_CONNECTORS: ReadonlyMap<string, JobSourceConnector<CollectionTarget>> = new Map([
  [GREENHOUSE_CONNECTOR_NAME, greenhouseConnector],
  [LEVER_CONNECTOR_NAME, leverConnector],
  [WORKDAY_CONNECTOR_NAME, workdayConnector],
]);

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

/** Une recherche qui ne trouve jamais rien : la découverte sans clé Brave. */
const noDiscovery = (): Promise<readonly WebSearchResult[]> => Promise.resolve([]);

/*
 * Requêtes Workable exécutées à chaque cycle. Le périmètre produit décide :
 * alternance d'abord, stage ensuite, développement en Île-de-France. Workable
 * cherche à travers tout son réseau, donc deux requêtes suffisent - le tri
 * fin (métier, commune) appartient à la normalisation et à la classification.
 */
const WORKABLE_SEARCHES: readonly SearchTarget[] = [
  { query: "alternance développeur", location: "Île-de-France, France" },
  { query: "stage développeur", location: "Île-de-France, France" },
];

/*
 * Le nom d'entreprise vient de chaque offre Workable ; le libellé vide sert de
 * repli pour que jamais un libellé de requête ne devienne un employeur - une
 * offre sans entreprise est rejetée par l'orchestrateur.
 */
const workableSearchJobs = (sourcePriority: number): CollectionJob<unknown>[] =>
  WORKABLE_SEARCHES.map((target) => ({
    connector: workableConnector,
    target,
    companyName: "",
    sourcePriority,
  }));

/*
 * Requêtes France Travail exécutées à chaque cycle, quand les identifiants
 * partenaires existent. Une seule suffit : l'API filtre déjà l'alternance
 * (natureContrat) et l'Île-de-France (region) côté serveur - « développeur »
 * ratisse le métier, le tri fin appartient à l'ingestion.
 */
const FRANCE_TRAVAIL_SEARCHES: readonly SearchTarget[] = [
  { query: "développeur", location: "Île-de-France, France" },
];

const franceTravailSearchJobs = (
  env: WorkerEnv,
  sourcePriority: number,
): CollectionJob<unknown>[] => {
  // Sans identifiants, pas de connecteur : la collecte continue sans France
  // Travail, comme la découverte continue sans clé Brave.
  if (env.FRANCETRAVAIL_CLIENT_ID === undefined || env.FRANCETRAVAIL_CLIENT_SECRET === undefined) {
    return [];
  }

  const connector = createFranceTravailConnector({
    clientId: env.FRANCETRAVAIL_CLIENT_ID,
    clientSecret: env.FRANCETRAVAIL_CLIENT_SECRET,
  });

  return FRANCE_TRAVAIL_SEARCHES.map((target) => ({
    connector,
    target,
    companyName: "",
    sourcePriority,
  }));
};

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
    searchJobs: [...workableSearchJobs(100), ...franceTravailSearchJobs(env, 100)],
  };
};
