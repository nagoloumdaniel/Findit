import { z } from "zod";

import { ApifyItemError, createApifyConnector } from "./apify.js";
import type { JobSourceConnector, RawJob, SearchTarget } from "./connector.js";

/** Doit correspondre à `Connector.name` en base. */
export const WTTJ_CONNECTOR_NAME = "welcome-to-the-jungle";

/** Acteur épinglé au registre (docs/legal-compliance.md, « Choix retenus »). */
export const WTTJ_ACTOR_ID = "bebity/welcome-to-the-jungle-jobs-scraper";

/**
 * Maximum absolu de résultats par run, quel que soit le plan. Le plafond réel
 * vient de la configuration (`SCRAPING_WTTJ_MAX_ITEMS`, 30 par défaut pour le
 * plan Apify gratuit : 0,024 $ au pire, voir le registre).
 */
export const WTTJ_MAX_ITEMS_CEILING = 100;

export class WttjInputError extends Error {
  override readonly name = "WttjInputError";

  constructor(detail: string) {
    super(`Recherche Welcome to the Jungle impossible : ${detail}`);
  }
}

/**
 * Tarifs de la fiche de l'acteur, niveau « FREE », relevés le 2026-10-06 :
 * démarrage 0,00005 $, offre 0,0003 $, détail complet 0,0005 $.
 */
const PRICING = { startMicroUsd: 50, perResultMicroUsd: 300, perDetailMicroUsd: 500 };

/**
 * Prix par événement facturé, sous le nom que l'API rend dans
 * `chargedEventCounts`. Noms et prix constatés sur un run réel le 2026-10-06
 * (fiche `pricingPerEvent` du run) : `job` 0,0003 $, `job-details` 0,0005 $,
 * `apify-actor-start` 0,00005 $, `article` et `organization` 0,0004 $ - ces
 * deux derniers ne sont jamais demandés par `get-jobs`.
 */
const EVENT_PRICES: Readonly<Record<string, number>> = {
  job: 300,
  "job-details": 500,
  "apify-actor-start": 50,
  article: 400,
  organization: 400,
};

/** Zones de recherche connues : le centre d'un rayon, tel que l'acteur le lit. */
const ZONES: ReadonlyMap<string, { latitude: string; longitude: string; radiusKm: number }> =
  new Map([
    // Paris, rayon de 50 km : couvre la petite couronne et l'essentiel de l'Île-de-France.
    ["Île-de-France, France", { latitude: "48.8566", longitude: "2.3522", radiusKm: 50 }],
  ]);

/** Alternance et stage : les deux contrats du périmètre du projet. */
const CONTRACT_TYPES = ["APPRENTICESHIP", "INTERNSHIP"] as const;

/**
 * Famille de métiers « Tech » de Welcome to the Jungle (`global_tech` couvre
 * toute la catégorie). Sans ce filtre, la recherche « développeur » ramène des
 * métiers commerciaux (« business developer ») que l'on paie avant de les
 * rejeter : constaté le 2026-10-06, 7 offres acceptées sur 20 puis 0 sur 5.
 */
const PROFESSION_TECH = "global_tech";

/*
 * Le filtre de métier fait la recherche : lui ajouter un mot-clé (« développeur »)
 * ne ramenait plus aucune offre lors d'un essai réel du 2026-10-06 - le tri fin
 * du métier appartient ensuite à la classification de Findit. La requête de la
 * cible ne sert donc pas à l'acteur.
 */

/** Fenêtre de fraîcheur du projet : 3 jours. */
const POSTED_WITHIN_DAYS = 3;

const itemSchema = z.object({
  objectID: z.string().min(1),
  /** Intitulé du poste. */
  name: z.string().min(1),
  publicUrl: z.string().min(1),
  published_at: z.string().nullish(),
  organization: z.object({ name: z.string().min(1) }),
  office: z.object({ city: z.string().nullish() }).nullish(),
  apply_url: z.string().nullish(),
  /** Présentes seulement quand le détail complet est demandé. */
  description: z.string().nullish(),
  description_text: z.string().nullish(),
});

const parseDate = (value: string | null | undefined): Date | null => {
  if (value === null || value === undefined) {
    return null;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

/**
 * Traduit un élément de l'acteur en offre brute. Rien n'est inventé : un
 * employeur ou un lien d'origine absent rend l'élément inexploitable, une date
 * illisible reste nulle.
 */
export const mapWttjItem = (item: unknown): RawJob => {
  const parsed = itemSchema.safeParse(item);
  if (!parsed.success) {
    throw new ApifyItemError(
      parsed.error.issues.map((issue) => `${issue.path.join(".")} : ${issue.message}`).join(" ; "),
    );
  }

  const job = parsed.data;

  return {
    sourceJobId: job.objectID,
    url: job.publicUrl,
    title: job.name,
    locationLabel: job.office?.city ?? null,
    descriptionHtml: job.description ?? job.description_text ?? null,
    publishedAt: parseDate(job.published_at),
    companyName: job.organization.name,
    applyUrl: job.apply_url ?? null,
    rawContent: JSON.stringify(item),
    contentType: "application/json",
  };
};

export interface WttjConnectorOptions {
  /** Jeton du compte Apify, lu côté serveur. */
  readonly token: string;
  /** Résultats par run, au plus `WTTJ_MAX_ITEMS_CEILING`. */
  readonly maxItems: number;
}

export const createWttjConnector = (
  options: WttjConnectorOptions,
): JobSourceConnector<SearchTarget> =>
  createApifyConnector({
    name: WTTJ_CONNECTOR_NAME,
    actorId: WTTJ_ACTOR_ID,
    token: options.token,
    pricing: PRICING,
    eventPricesMicroUsd: EVENT_PRICES,
    maxItems: options.maxItems,
    maxItemsCeiling: WTTJ_MAX_ITEMS_CEILING,
    buildInput: (target, maxItems) => {
      const zone = ZONES.get(target.location);
      if (zone === undefined) {
        throw new WttjInputError(
          `la zone « ${target.location} » n'a pas de centre connu : le périmètre du projet est l'Île-de-France.`,
        );
      }

      return {
        action: "get-jobs",
        contractType: [...CONTRACT_TYPES],
        postedWithinDays: POSTED_WITHIN_DAYS,
        orderBy: "published_at",
        profession: PROFESSION_TECH,
        latitude: zone.latitude,
        longitude: zone.longitude,
        radiusKm: zone.radiusKm,
        includeDetails: true,
        maxItems,
      };
    },
    mapItem: mapWttjItem,
  });
