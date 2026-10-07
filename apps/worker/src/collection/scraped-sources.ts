import type { WorkerEnv } from "@findit/config";
import type { SearchTarget } from "@findit/job-connectors";
import {
  createHelloworkConnector,
  createIndeedConnector,
  createLinkedinConnector,
  createWttjConnector,
  SOURCE_PRIORITY_JOB_BOARD,
} from "@findit/job-connectors";

import type { CollectionJob } from "./run-collection.js";

/*
 * Ce que le cycle quotidien lit sur chaque job board. Le périmètre produit est
 * l'Île-de-France ; la nature du contrat et le métier sont des filtres de
 * l'acteur quand il les sait faire, sinon des mots-clés relus par la
 * classification Findit (Indeed et LinkedIn n'ont pas de filtre de contrat).
 */
const WTTJ_SEARCH: SearchTarget = { query: "développeur", location: "Île-de-France, France" };
const HELLOWORK_SEARCH: SearchTarget = { query: "développeur", location: "Île-de-France" };
const INDEED_SEARCH: SearchTarget = { query: "alternance développeur", location: "Île-de-France" };
const LINKEDIN_SEARCH: SearchTarget = {
  query: "alternance développeur",
  location: "Île-de-France, France",
};

/*
 * Plafond LinkedIn en attendant un réglage d'environnement : c'est la ligne
 * « plan gratuit » du registre (20 résultats par run, 0,040 $ au pire) tant que
 * le crédit Apify est de 5 $. Un `SCRAPING_LINKEDIN_MAX_ITEMS` exigerait de
 * toucher `packages/config`, hors de ce chantier.
 */
const LINKEDIN_MAX_ITEMS = 20;

type ScrapedSourcesEnv = Pick<
  WorkerEnv,
  | "SCRAPED_SOURCES_ENABLED"
  | "APIFY_API_TOKEN"
  | "SCRAPING_WTTJ_MAX_ITEMS"
  | "SCRAPING_HELLOWORK_MAX_ITEMS"
  | "SCRAPING_INDEED_MAX_ITEMS"
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
    {
      connector: createIndeedConnector({
        token: env.APIFY_API_TOKEN,
        maxItems: env.SCRAPING_INDEED_MAX_ITEMS,
      }),
      target: INDEED_SEARCH,
      companyName: "",
      sourcePriority: SOURCE_PRIORITY_JOB_BOARD,
    },
    {
      connector: createLinkedinConnector({
        token: env.APIFY_API_TOKEN,
        maxItems: LINKEDIN_MAX_ITEMS,
      }),
      target: LINKEDIN_SEARCH,
      companyName: "",
      sourcePriority: SOURCE_PRIORITY_JOB_BOARD,
    },
  ];

  const cost = (job: CollectionJob<unknown>): number =>
    job.connector.estimateCostMicroUsd?.(job.target) ?? 0;

  return jobs.sort((a, b) => cost(a) - cost(b));
};
