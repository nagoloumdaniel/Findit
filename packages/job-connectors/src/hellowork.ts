import { z } from "zod";

import { ApifyItemError, createApifyConnector } from "./apify.js";
import type { JobSourceConnector, RawJob, SearchTarget } from "./connector.js";

/** Doit correspondre à `Connector.name` en base. */
export const HELLOWORK_CONNECTOR_NAME = "hellowork";

/** Acteur épinglé au registre (docs/legal-compliance.md, « Choix retenus »). */
export const HELLOWORK_ACTOR_ID = "solidcode/hellowork-scraper";

/**
 * Maximum absolu de résultats par run, quel que soit le plan. Le plafond réel
 * vient de la configuration (`SCRAPING_HELLOWORK_MAX_ITEMS`, 40 par défaut pour
 * le plan Apify gratuit : 0,038 $ au pire, voir le registre).
 */
export const HELLOWORK_MAX_ITEMS_CEILING = 100;

/*
 * L'acteur garde la dernière page entière quand elle dépasse le plafond
 * demandé : pour un plafond de 40 résultats, il en a rendu 60 (constaté sur un
 * run réel le 2026-10-06). Ce dépassement est facturé, donc la charge maximale
 * et l'estimation le couvrent ; `limit` reste borné au plafond demandé.
 */
const RESULT_OVERSHOOT = 20;

export class HelloworkInputError extends Error {
  override readonly name = "HelloworkInputError";

  constructor(detail: string) {
    super(`Recherche HelloWork impossible : ${detail}`);
  }
}

/*
 * Tarifs constatés sur un run réel le 2026-10-06 : démarrage 0,00005 $,
 * résultat 0,00095 $. Aucun supplément de détail, contrairement à Welcome to
 * the Jungle.
 */
const PRICING = { startMicroUsd: 50, perResultMicroUsd: 950 };

/*
 * Prix par événement facturé, sous le nom que l'API rend dans
 * `chargedEventCounts`, constatés sur le même run réel le 2026-10-06.
 */
const EVENT_PRICES: Readonly<Record<string, number>> = {
  "apify-actor-start": 50,
  "apify-default-dataset-item": 950,
};

/** Zones de recherche connues : la région que l'acteur filtre lui-même. */
const LOCATIONS = new Set(["Île-de-France"]);

/** Alternance et stage : les deux contrats du périmètre du projet. */
const CONTRACT_TYPES = ["ALTERNANCE", "STAGE"] as const;

/** Fenêtre de fraîcheur du projet : 3 jours, telle que l'acteur la lit. */
const POSTED_WITHIN_DAYS = "3d";

/*
 * HelloWork peut rendre un employeur nul. Le libellé dit exactement ce que la
 * source dit : l'employeur est inconnu. Ce n'est pas un nom inventé, c'est une
 * absence nommée - même règle que France Travail (décidée le 2026-07-27).
 */
const ANONYMOUS_EMPLOYER = "Inconnu";

const itemSchema = z.object({
  jobId: z.string().min(1),
  jobUrl: z.string().min(1),
  title: z.string().min(1),
  /** Nul possible : l'acteur ne le remplit pas toujours. */
  company: z.string().nullish(),
  /** Nom de commune propre. */
  city: z.string().nullish(),
  /** Le même nom suffixé du département (« Issy-les-Moulineaux - 92 »). */
  location: z.string().nullish(),
  /** Date seule, en ISO (« 2026-10-05 »), jamais d'heure. */
  datePosted: z.string().nullish(),
  descriptionHtml: z.string().nullish(),
  descriptionText: z.string().nullish(),
});

const parseDate = (value: string | null | undefined): Date | null => {
  if (value === null || value === undefined || value.trim() === "") {
    return null;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

/**
 * Traduit un élément de l'acteur en offre brute. Rien n'est inventé : un
 * identifiant, une URL ou un intitulé absent rend l'élément inexploitable ; un
 * employeur absent devient « Inconnu », une date illisible reste nulle.
 */
export const mapHelloworkItem = (item: unknown): RawJob => {
  const parsed = itemSchema.safeParse(item);
  if (!parsed.success) {
    throw new ApifyItemError(
      parsed.error.issues.map((issue) => `${issue.path.join(".")} : ${issue.message}`).join(" ; "),
    );
  }

  const job = parsed.data;

  return {
    sourceJobId: job.jobId,
    url: job.jobUrl,
    title: job.title,
    // `city` est le nom de commune que le résolveur Île-de-France sait lire ;
    // `location` le répète suffixé du département, sans être séparable par le
    // résolveur. Le libellé complet reste dans `rawContent`.
    locationLabel: job.city ?? job.location ?? null,
    descriptionHtml: job.descriptionHtml ?? job.descriptionText ?? null,
    publishedAt: parseDate(job.datePosted),
    companyName: job.company ?? ANONYMOUS_EMPLOYER,
    rawContent: JSON.stringify(item),
    contentType: "application/json",
  };
};

export interface HelloworkConnectorOptions {
  /** Jeton du compte Apify, lu côté serveur. */
  readonly token: string;
  /** Résultats par run, au plus `HELLOWORK_MAX_ITEMS_CEILING`. */
  readonly maxItems: number;
}

export const createHelloworkConnector = (
  options: HelloworkConnectorOptions,
): JobSourceConnector<SearchTarget> =>
  createApifyConnector({
    name: HELLOWORK_CONNECTOR_NAME,
    actorId: HELLOWORK_ACTOR_ID,
    token: options.token,
    pricing: PRICING,
    eventPricesMicroUsd: EVENT_PRICES,
    maxItems: options.maxItems,
    maxItemsCeiling: HELLOWORK_MAX_ITEMS_CEILING,
    resultOvershoot: RESULT_OVERSHOOT,
    buildInput: (target, maxItems) => {
      if (!LOCATIONS.has(target.location)) {
        throw new HelloworkInputError(
          `la zone « ${target.location} » n'est pas connue : le périmètre du projet est l'Île-de-France.`,
        );
      }

      return {
        searchQueries: [target.query],
        location: target.location,
        contractType: [...CONTRACT_TYPES],
        datePosted: POSTED_WITHIN_DAYS,
        // L'acteur n'honore pas ce plafond (constaté le 2026-10-06 : il produit
        // au-delà, borné seulement par la charge maximale). La garde réelle du
        // volume et du coût passe par `maxTotalChargeUsd` et `limit`, posés par
        // le connecteur Apify commun ; ce champ garde l'entrée lisible.
        maxResults: maxItems,
      };
    },
    mapItem: mapHelloworkItem,
  });
