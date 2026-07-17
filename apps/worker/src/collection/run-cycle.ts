import { AtsKind } from "@findit/database";
import type {
  CollectableSource,
  CollectionTarget,
  DiscoveredSource,
  DiscoveryOutcome,
  JobSourceConnector,
  WebSearchQuery,
  WebSearchResult,
} from "@findit/job-connectors";
import {
  buildDiscoveryQueries,
  collectDiscoveries,
  GREENHOUSE_CONNECTOR_NAME,
  LEVER_CONNECTOR_NAME,
} from "@findit/job-connectors";

import type { CollectionJob, CollectionSummary } from "./run-collection.js";

/** Connecteurs qui se collectent par jeton d'entreprise, et leur type d'ATS. */
const TOKEN_CONNECTOR_ATS: ReadonlyMap<string, AtsKind> = new Map([
  [GREENHOUSE_CONNECTOR_NAME, AtsKind.GREENHOUSE],
  [LEVER_CONNECTOR_NAME, AtsKind.LEVER],
]);

const hostOf = (url: string): string | null => {
  try {
    return new URL(url).host;
  } catch {
    return null;
  }
};

/**
 * Traduit une entreprise découverte en source à enregistrer. Le type d'ATS
 * vient du connecteur, l'hôte de la première URL qui l'a fait découvrir. Rend
 * `null` si le connecteur ne se collecte pas par jeton — la recherche réseau,
 * comme Workable, ne passe pas par le registre d'entreprises.
 */
export const toDiscoveredSource = (
  known: DiscoveryOutcome["known"][number],
): DiscoveredSource | null => {
  const atsKind = TOKEN_CONNECTOR_ATS.get(known.connectorName);
  const atsHost = known.sourceUrls[0] === undefined ? null : hostOf(known.sourceUrls[0]);

  if (atsKind === undefined || atsHost === null) {
    return null;
  }

  return {
    connectorName: known.connectorName,
    atsKind,
    atsIdentifier: known.target.atsIdentifier,
    atsHost,
  };
};

export interface CycleSummary {
  readonly queriesRun: number;
  readonly companiesDiscovered: number;
  readonly sourcesRegistered: number;
  readonly collection: CollectionSummary;
}

/**
 * Les étapes du cycle, injectées. Le cycle ne connaît ni Brave ni Prisma : il
 * enchaîne des fonctions, ce qui le rend vérifiable sans réseau ni base.
 */
export interface CycleDeps {
  search(query: WebSearchQuery): Promise<readonly WebSearchResult[]>;
  registerSource(source: DiscoveredSource): Promise<{ registered: boolean }>;
  listSources(): Promise<readonly CollectableSource[]>;
  collect(jobs: readonly CollectionJob<unknown>[]): Promise<CollectionSummary>;
  connectorFor(name: string): JobSourceConnector<CollectionTarget> | null;
  /** Attente entre deux recherches. La cadence est tenue ici. */
  pace(ms: number): Promise<void>;
  /** Plafond de requêtes de recherche par cycle. */
  maxQueries: number;
  /** Délai à tenir entre deux recherches, en millisecondes. */
  searchIntervalMs: number;
  /** Rang de source pour une entreprise découverte. */
  sourcePriority: number;
}

/**
 * Un cycle complet : chercher, retenir les entreprises trouvées, puis collecter
 * tout ce que le registre autorise.
 *
 * La recherche ne sert qu'à **découvrir** — ses résultats ne sont jamais
 * stockés, seulement transformés en entreprises à surveiller. La collecte, elle,
 * part du registre : une entreprise trouvée à un cycle est recollectée aux
 * suivants sans repasser par la recherche.
 */
export const runCycle = async (deps: CycleDeps): Promise<CycleSummary> => {
  const queries = buildDiscoveryQueries().slice(0, deps.maxQueries);

  // 1. Découverte. Résultats transitoires, jamais écrits.
  const results: WebSearchResult[] = [];
  for (let index = 0; index < queries.length; index += 1) {
    const query = queries[index];
    if (query === undefined) {
      continue;
    }

    if (index > 0) {
      await deps.pace(deps.searchIntervalMs);
    }

    results.push(...(await deps.search(query)));
  }

  const discoveries = collectDiscoveries(results);

  // 2. Enregistrement des entreprises qui se collectent par jeton.
  let sourcesRegistered = 0;
  for (const known of discoveries.known) {
    const source = toDiscoveredSource(known);
    if (source === null) {
      continue;
    }

    const outcome = await deps.registerSource(source);
    if (outcome.registered) {
      sourcesRegistered += 1;
    }
  }

  // 3. Collecte, depuis le registre relu à chaque cycle.
  const collectable = await deps.listSources();
  const jobs: CollectionJob<unknown>[] = [];
  for (const source of collectable) {
    const connector = deps.connectorFor(source.connectorName);
    if (connector === null) {
      continue;
    }

    jobs.push({
      connector,
      target: { atsIdentifier: source.atsIdentifier, companyName: source.companyName },
      companyName: source.companyName,
      sourcePriority: deps.sourcePriority,
    });
  }

  const collection = await deps.collect(jobs);

  return {
    queriesRun: queries.length,
    companiesDiscovered: discoveries.known.length,
    sourcesRegistered,
    collection,
  };
};
