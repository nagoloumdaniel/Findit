import { z } from "zod";

import { ApifyItemError, createApifyConnector } from "./apify.js";
import type { JobSourceConnector, RawJob, SearchTarget } from "./connector.js";

/** Doit correspondre à `Connector.name` en base. */
export const INDEED_CONNECTOR_NAME = "indeed";

/** Acteur épinglé au registre (docs/legal-compliance.md, « Choix retenus »). */
export const INDEED_ACTOR_ID = "curious_coder/indeed-scraper";

/**
 * Maximum absolu de résultats par run, quel que soit le plan. Le plafond réel
 * vient de la configuration (`SCRAPING_INDEED_MAX_ITEMS`, 100 par défaut pour
 * le plan Apify gratuit : 0,0101 $ au pire, voir le registre).
 */
export const INDEED_MAX_ITEMS_CEILING = 100;

/** L'acteur rend `viewJobLink` en chemin relatif ; la page vit sur ce domaine. */
const INDEED_BASE_URL = "https://fr.indeed.com";

/*
 * L'acteur n'a pas de filtre de contrat : la recherche passe par les mots-clés
 * et la classification contrat de Findit tranche ensuite (le registre).
 */
const POSTED_WITHIN_DAYS = "3";

/*
 * L'employeur vient de `companyDetails.name`, absent de certaines offres. Le
 * libellé dit exactement ce que la source dit : l'employeur est inconnu, ce
 * n'est pas un nom inventé (même règle que France Travail, décidée le 2026-07-27).
 */
const ANONYMOUS_EMPLOYER = "Inconnu";

/*
 * Tarifs constatés sur un run réel le 2026-10-06 : démarrage 0,0001 $,
 * résultat 0,0001 $. Aucun supplément de détail.
 */
const PRICING = { startMicroUsd: 100, perResultMicroUsd: 100 };

/*
 * Prix par événement facturé, sous le nom que l'API rend dans
 * `chargedEventCounts`, constatés sur le même run réel le 2026-10-06.
 */
const EVENT_PRICES: Readonly<Record<string, number>> = {
  "apify-actor-start": 100,
  "apify-default-dataset-item": 100,
};

const itemSchema = z.object({
  id: z.string().min(1),
  /** Chemin relatif sur Indeed, préfixé par ce connecteur. */
  viewJobLink: z.string().min(1),
  title: z.string().min(1),
  companyDetails: z.object({ name: z.string().nullish() }).nullish(),
  jobLocationCity: z.string().nullish(),
  formattedLocation: z.string().nullish(),
  /** Millisecondes depuis l'époque, constaté sur un run réel le 2026-10-06. */
  pubDate: z.number().int().nullish(),
  jobDescriptionHTML: z.string().nullish(),
  jobDescription: z.string().nullish(),
  originalApplyUrl: z.string().nullish(),
});

const parseDate = (value: number | null | undefined): Date | null => {
  if (value === null || value === undefined) {
    return null;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

/**
 * Traduit un élément de l'acteur en offre brute. Rien n'est inventé : un
 * identifiant, un lien ou un intitulé absent rend l'élément inexploitable ; un
 * employeur absent devient « Inconnu », une date illisible reste nulle. Le lien
 * relatif est rendu absolu sur `fr.indeed.com`.
 */
export const mapIndeedItem = (item: unknown): RawJob => {
  const parsed = itemSchema.safeParse(item);
  if (!parsed.success) {
    throw new ApifyItemError(
      parsed.error.issues.map((issue) => `${issue.path.join(".")} : ${issue.message}`).join(" ; "),
    );
  }

  const job = parsed.data;

  return {
    sourceJobId: job.id,
    url: job.viewJobLink.startsWith("http")
      ? job.viewJobLink
      : `${INDEED_BASE_URL}${job.viewJobLink}`,
    title: job.title,
    // `jobLocationCity` est le nom de commune que le résolveur Île-de-France lit ;
    // `formattedLocation` le répète suffixé du département (« Paris (75) »).
    locationLabel: job.jobLocationCity ?? job.formattedLocation ?? null,
    descriptionHtml: job.jobDescriptionHTML ?? job.jobDescription ?? null,
    publishedAt: parseDate(job.pubDate),
    companyName: job.companyDetails?.name ?? ANONYMOUS_EMPLOYER,
    applyUrl: job.originalApplyUrl ?? null,
    rawContent: JSON.stringify(item),
    contentType: "application/json",
  };
};

export interface IndeedConnectorOptions {
  /** Jeton du compte Apify, lu côté serveur. */
  readonly token: string;
  /** Résultats par run, au plus `INDEED_MAX_ITEMS_CEILING`. */
  readonly maxItems: number;
}

export const createIndeedConnector = (
  options: IndeedConnectorOptions,
): JobSourceConnector<SearchTarget> =>
  createApifyConnector({
    name: INDEED_CONNECTOR_NAME,
    actorId: INDEED_ACTOR_ID,
    token: options.token,
    pricing: PRICING,
    eventPricesMicroUsd: EVENT_PRICES,
    maxItems: options.maxItems,
    maxItemsCeiling: INDEED_MAX_ITEMS_CEILING,
    buildInput: (target, maxItems) => ({
      country: "fr",
      query: target.query,
      location: target.location,
      postedWithinDays: POSTED_WITHIN_DAYS,
      count: maxItems,
    }),
    mapItem: mapIndeedItem,
  });
