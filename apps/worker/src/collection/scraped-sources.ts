import type { WorkerEnv } from "@findit/config";
import type { SearchTarget } from "@findit/job-connectors";
import {
  createHelloworkConnector,
  createWttjConnector,
  SOURCE_PRIORITY_JOB_BOARD,
} from "@findit/job-connectors";

import type { CollectionJob } from "./run-collection.js";

/*
 * Ce que le cycle quotidien lit sur chaque job board. Le périmètre produit est
 * l'Île-de-France ; la nature du contrat et le métier sont des filtres de
 * l'acteur, pas de cette recherche. HelloWork lit la région telle quelle ;
 * Welcome to the Jungle la lit comme le centre d'un rayon.
 */
const WTTJ_SEARCH: SearchTarget = { query: "développeur", location: "Île-de-France, France" };
const HELLOWORK_SEARCH: SearchTarget = { query: "développeur", location: "Île-de-France" };

type ScrapedSourcesEnv = Pick<
  WorkerEnv,
  | "SCRAPED_SOURCES_ENABLED"
  | "APIFY_API_TOKEN"
  | "SCRAPING_WTTJ_MAX_ITEMS"
  | "SCRAPING_HELLOWORK_MAX_ITEMS"
>;

/**
 * Les job boards à collecter par le cycle quotidien, du moins cher au plus cher.
 *
 * Rien ne tourne tant que l'interrupteur n'est pas allumé ET que le jeton Apify
 * existe : chaque run dépense du crédit réel, donc le démarrage automatique est
 * une décision du propriétaire, jamais un défaut. L'ordre met le moins coûteux
 * en premier : quand le plafond du cycle manque, c'est la source la plus chère
 * qui est sacrifiée.
 */
export const scrapedSourceJobs = (env: ScrapedSourcesEnv): CollectionJob<unknown>[] => {
  if (!env.SCRAPED_SOURCES_ENABLED || env.APIFY_API_TOKEN === undefined) {
    return [];
  }

  const jobs: CollectionJob<unknown>[] = [
    {
      connector: createWttjConnector({
        token: env.APIFY_API_TOKEN,
        maxItems: env.SCRAPING_WTTJ_MAX_ITEMS,
      }),
      target: WTTJ_SEARCH,
      // L'employeur vient de chaque offre ; jamais un libellé de requête.
      companyName: "",
      sourcePriority: SOURCE_PRIORITY_JOB_BOARD,
    },
    {
      connector: createHelloworkConnector({
        token: env.APIFY_API_TOKEN,
        maxItems: env.SCRAPING_HELLOWORK_MAX_ITEMS,
      }),
      target: HELLOWORK_SEARCH,
      companyName: "",
      sourcePriority: SOURCE_PRIORITY_JOB_BOARD,
    },
  ];

  const cost = (job: CollectionJob<unknown>): number =>
    job.connector.estimateCostMicroUsd?.(job.target) ?? 0;

  return jobs.sort((a, b) => cost(a) - cost(b));
};
