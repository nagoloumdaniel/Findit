import { z } from "zod";

import { ApifyItemError, createApifyConnector } from "./apify.js";
import type { JobSourceConnector, RawJob, SearchTarget } from "./connector.js";
import { assertBoundedMaxItems } from "./spend-budget.js";

/** Doit correspondre à `Connector.name` en base. */
export const LINKEDIN_CONNECTOR_NAME = "linkedin";

/** Acteur épinglé au registre (docs/legal-compliance.md, « Choix retenus »). */
export const LINKEDIN_ACTOR_ID = "curious_coder/linkedin-jobs-scraper";

/**
 * Maximum absolu de résultats par run, quel que soit le plan : c'est le
 * `limitPerSource=100` de l'entrée du registre. Le plafond réel vient de
 * l'appelant (20 par défaut, la ligne « plan gratuit » du registre : 0,040 $).
 */
export const LINKEDIN_MAX_ITEMS_CEILING = 100;

/**
 * Fenêtre de fraîcheur du projet, en heures. LinkedIn ne sait filtrer que 24 h,
 * 7 jours ou 30 jours : l'acteur est donc lancé sur `pastWeek`, et c'est **ici**
 * que la fenêtre de 3 jours est rétablie à partir de `postedAt` (registre,
 * « Écarts … à traiter par notre propre filtre »). Même valeur que
 * `EXTENDED_MAX_AGE_HOURS` (`packages/shared/src/job-scope.ts:45`), que
 * l'ingestion applique de son côté : deux gardes au même seuil, pas deux seuils.
 */
export const LINKEDIN_FRESHNESS_HOURS = 72;

/** Zone unique du périmètre, telle que le registre la fixe pour LinkedIn. */
const LOCATIONS = new Set(["Île-de-France, France"]);

export class LinkedinInputError extends Error {
  override readonly name = "LinkedinInputError";

  constructor(detail: string) {
    super(`Recherche LinkedIn impossible : ${detail}`);
  }
}

/*
 * Tarifs dérivés du registre, qui donne les deux seuls points dont on dispose :
 * 100 résultats → 0,20 $ (ligne « Coût ») et 20 résultats → 0,040 $ (ligne
 * « plan gratuit »). La droite passe par l'origine, soit 0,002 $ le résultat.
 * Aucun frais de démarrage n'en est déduit : ce serait l'inventer. S'il existe,
 * le premier run réel le révélera — l'événement `apify-actor-start` n'a pas de
 * prix connu ici, donc le coût retenu sera le relevé réel d'Apify, jamais une
 * estimation plus basse (voir `costOf` dans `apify.ts`).
 */
const PRICING = { startMicroUsd: 0, perResultMicroUsd: 2000 };

/*
 * Un seul événement est tarifé d'après la déduction ci-dessus. `apify-actor-start`
 * reste volontairement hors table : prix non mesuré, donc repli sur le coût réel
 * plutôt qu'un zéro inventé.
 */
const EVENT_PRICES: Readonly<Record<string, number>> = {
  "apify-default-dataset-item": 2000,
};

/*
 * Le registre ne liste que les champs à renommer (`id`, `link`, `companyName`,
 * `location`, `postedAt`, `applyUrl`) : `title` et la description gardent les
 * noms que tous les acteurs de job board utilisent, comme pour Indeed et
 * HelloWork. Un acteur qui les nommerait autrement ferait échouer le run
 * bruyamment (« aucun élément exploitable »), jamais passer une offre vide.
 *
 * `companyName` est obligatoire : le registre impose de refuser une offre sans
 * employeur, et il n'y a pas de repli « Inconnu » ici — un job board ne doit pas
 * fabriquer un employeur.
 */
const itemSchema = z.object({
  id: z.string().min(1),
  link: z.string().min(1),
  title: z.string().min(1),
  companyName: z.string().min(1),
  location: z.string().nullish(),
  /** Chaîne ISO le plus souvent ; l'époque en millisecondes reste acceptée. */
  postedAt: z.union([z.string(), z.number()]).nullish(),
  applyUrl: z.string().nullish(),
  descriptionHtml: z.string().nullish(),
  description: z.string().nullish(),
});

const parseDate = (value: string | number | null | undefined): Date | null => {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value === "string" && value.trim() === "") {
    return null;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

/**
 * Vrai quand la date prouve que l'offre est dans la fenêtre de 3 jours.
 *
 * Une date absente ou illisible rend `false` : sans date, la fraîcheur n'est pas
 * prouvable, et l'acteur a pu ramener une offre de 7 jours. Le seuil est
 * inclusif, comme l'ingestion (`ageHours > 72` rejette).
 */
export const isWithinLinkedinWindow = (publishedAt: Date | null, now: Date): boolean =>
  publishedAt !== null &&
  now.getTime() - publishedAt.getTime() <= LINKEDIN_FRESHNESS_HOURS * 60 * 60 * 1000;

/**
 * Traduit un élément de l'acteur en offre brute. Rien n'est inventé : un
 * identifiant, un lien, un intitulé ou un employeur absent rend l'élément
 * inexploitable ; une date illisible reste nulle et sera écartée par le filtre
 * de fraîcheur.
 */
export const mapLinkedinItem = (item: unknown): RawJob => {
  const parsed = itemSchema.safeParse(item);
  if (!parsed.success) {
    throw new ApifyItemError(
      parsed.error.issues.map((issue) => `${issue.path.join(".")} : ${issue.message}`).join(" ; "),
    );
  }

  const job = parsed.data;

  return {
    sourceJobId: job.id,
    url: job.link,
    title: job.title,
    locationLabel: job.location ?? null,
    descriptionHtml: job.descriptionHtml ?? job.description ?? null,
    publishedAt: parseDate(job.postedAt),
    companyName: job.companyName,
    applyUrl: job.applyUrl ?? null,
    /*
     * `rawContent` est une projection en liste blanche, contrairement aux autres
     * connecteurs qui recopient l'élément entier : le registre interdit de
     * stocker la moindre donnée de recruteur (`jobPoster*`), et recopier l'objet
     * brut la ferait entrer dans la trace. Seuls les champs que nous avons
     * effectivement lus y figurent.
     */
    rawContent: JSON.stringify({
      id: job.id,
      link: job.link,
      title: job.title,
      companyName: job.companyName,
      location: job.location ?? null,
      postedAt: job.postedAt ?? null,
      applyUrl: job.applyUrl ?? null,
      description: job.description ?? null,
      descriptionHtml: job.descriptionHtml ?? null,
    }),
    contentType: "application/json",
  };
};

export interface LinkedinConnectorOptions {
  /** Jeton du compte Apify, lu côté serveur. */
  readonly token: string;
  /** Résultats par run, au plus `LINKEDIN_MAX_ITEMS_CEILING`. */
  readonly maxItems: number;
}

/**
 * Le connecteur LinkedIn : acteur public sans compte, mots-clés seulement.
 *
 * Le filtre de fraîcheur et le plafond de résultats sont appliqués après la
 * collecte de l'acteur, pas par lui : LinkedIn ne sait pas exprimer 3 jours, et
 * un acteur Apify n'est jamais cru sur son propre plafond (HelloWork rend la
 * dernière page entière). Le run ne rend donc jamais plus de `maxItems` offres,
 * ni aucune offre dont la date ne prouve pas les 3 jours.
 */
export const createLinkedinConnector = (
  options: LinkedinConnectorOptions,
): JobSourceConnector<SearchTarget> => {
  const maxItems = assertBoundedMaxItems(options.maxItems, LINKEDIN_MAX_ITEMS_CEILING);

  const inner = createApifyConnector({
    name: LINKEDIN_CONNECTOR_NAME,
    actorId: LINKEDIN_ACTOR_ID,
    token: options.token,
    pricing: PRICING,
    eventPricesMicroUsd: EVENT_PRICES,
    maxItems,
    maxItemsCeiling: LINKEDIN_MAX_ITEMS_CEILING,
    buildInput: (target, boundedMaxItems) => {
      if (!LOCATIONS.has(target.location)) {
        throw new LinkedinInputError(
          `la zone « ${target.location} » n'est pas celle du registre (Île-de-France, France).`,
        );
      }

      return {
        keywords: target.query,
        location: target.location,
        // LinkedIn ne sait filtrer que 24 h, 7 jours ou 30 jours.
        datePosted: "pastWeek",
        scrapeCompany: false,
        // Interdit par le registre : l'activer découperait la recherche par
        // lieu et ferait payer plusieurs runs pour la même zone.
        splitByLocation: false,
        limitPerSource: boundedMaxItems,
      };
    },
    mapItem: mapLinkedinItem,
  });

  return {
    ...inner,
    collect: async (permit, target, context) => {
      const jobs = await inner.collect(permit, target, context);
      const now = context.now();
      const fresh = jobs.filter((job) => isWithinLinkedinWindow(job.publishedAt, now));

      if (fresh.length < jobs.length) {
        context.reportNotice(
          "FreshnessDropped",
          `${String(jobs.length - fresh.length)} offre(s) sur ${String(jobs.length)} écartées : hors fenêtre de ${String(LINKEDIN_FRESHNESS_HOURS)} h, ou date absente/illisible.`,
        );
      }

      const capped = fresh.slice(0, maxItems);
      if (capped.length < fresh.length) {
        context.reportNotice(
          "ResultsCapped",
          `${String(fresh.length - capped.length)} offre(s) au-delà du plafond de ${String(maxItems)} écartées : l'acteur n'a pas honoré limitPerSource.`,
        );
      }

      return capped;
    },
  };
};
