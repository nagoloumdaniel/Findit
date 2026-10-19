import type { WorkerEnv } from "@findit/config";
import type { PrismaClient } from "@findit/database";
import type {
  CollectionTarget,
  JobSourceConnector,
  RawJob,
  WebSearchResult,
} from "@findit/job-connectors";
import {
  greenhouseConnector,
  GREENHOUSE_CONNECTOR_NAME,
  leverConnector,
  LEVER_CONNECTOR_NAME,
  recognizeTarget,
  runRecordedConnector,
  workdayConnector,
  WORKDAY_CONNECTOR_NAME,
} from "@findit/job-connectors";
import type { persistOffers } from "@findit/persist";

import { createCollectionRuntime } from "./cycle-deps.js";

/** L'offre structurée qu'attend `runAgent`, telle que `persistOffers` la lit. */
export type ConnectorOffer = Parameters<typeof persistOffers>[0][number];

/*
 * Connecteurs qui se collectent par jeton d'entreprise, par nom. C'est la même
 * liste que le cycle natif : le repli de l'agent reconnaît une URL d'ATS et la
 * confie au connecteur qui sait déjà la lire.
 */
const TOKEN_CONNECTORS: ReadonlyMap<string, JobSourceConnector<CollectionTarget>> = new Map([
  [GREENHOUSE_CONNECTOR_NAME, greenhouseConnector],
  [LEVER_CONNECTOR_NAME, leverConnector],
  [WORKDAY_CONNECTOR_NAME, workdayConnector],
]);

/**
 * Cartographie une offre brute de connecteur vers la forme qu'attend `runAgent`.
 *
 * Rien n'est inventé : l'employeur vient de l'offre quand elle le porte, du
 * jeton de l'ATS sinon ; les technologies ne sont pas devinées ici, la
 * normalisation s'en charge plus tard ; la date reste absente quand la source ne
 * la donne pas.
 */
export const mapRawJobToOffer = (raw: RawJob, fallbackCompany: string): ConnectorOffer => {
  let sourceDomain = "";
  try {
    sourceDomain = new URL(raw.url).hostname;
  } catch {
    // URL illisible : aucun domaine exploitable, la normalisation la traitera.
  }
  return {
    title: raw.title,
    company: (raw.companyName ?? fallbackCompany).trim(),
    ...(raw.locationLabel !== null ? { location: raw.locationLabel } : {}),
    ...(raw.descriptionHtml !== null ? { description: raw.descriptionHtml } : {}),
    technologies: [],
    ...(raw.publishedAt !== null ? { publishedAt: raw.publishedAt.toISOString() } : {}),
    applicationUrl: raw.applyUrl ?? raw.url,
    sourceUrl: raw.url,
    sourceDomain,
  };
};

/**
 * Fabrique le repli connecteur de `runAgent` : reconnaît une URL d'ATS et la
 * collecte via son connecteur, ou rend `null` quand l'URL n'est pas une source
 * connue, que la collecte est refusée, ou qu'elle ne rend rien.
 */
export const createAgentConnectorFallback = (
  prisma: PrismaClient,
  env: WorkerEnv,
): ((url: string) => Promise<readonly ConnectorOffer[] | null>) => {
  const { store, connectorDeps } = createCollectionRuntime(prisma, env);

  return async (url: string): Promise<readonly ConnectorOffer[] | null> => {
    const result: WebSearchResult = { url, title: "", description: "", host: "" };
    const recognized = recognizeTarget(result);
    if (recognized === null || recognized.kind !== "known") {
      return null;
    }
    const connector = TOKEN_CONNECTORS.get(recognized.connectorName);
    if (connector === undefined) {
      return null;
    }

    try {
      const outcome = await runRecordedConnector(
        store,
        connector,
        recognized.target,
        connectorDeps,
      );
      const named = outcome.jobs.filter(
        (raw) => (raw.companyName ?? recognized.target.companyName).trim() !== "",
      );
      if (named.length === 0) {
        return null;
      }
      return named.map((raw) => mapRawJobToOffer(raw, recognized.target.companyName));
    } catch {
      // Refus du registre, échec réseau ou forme inattendue : le crawl prend le
      // relais. `runRecordedConnector` a déjà tracé l'erreur.
      return null;
    }
  };
};
