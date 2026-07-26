import { AtsKind } from "@findit/database";
import { z } from "zod";

import type {
  CollectionContext,
  CollectionTarget,
  JobSourceConnector,
  RawJob,
} from "./connector.js";
import { FINDIT_USER_AGENT } from "./http.js";
import type { CollectionPermit } from "./permit.js";
import { decideRobots, parseRobots } from "./robots.js";

/** Doit correspondre à `Connector.name` en base. */
export const WORKDAY_CONNECTOR_NAME = "workday";

/**
 * Workday n'annonce pas de Crawl-delay sur les locataires relevés
 * (workday.wd5.myworkdayjobs.com, 2026-07-26) : une requête par seconde, par
 * prudence. Si un locataire en annonce un plus long, la collecte s'arrête
 * plutôt que de le dépasser - voir la garde robots ci-dessous.
 */
export const WORKDAY_REQUEST_INTERVAL_MS = 1000;

/**
 * Chaque entreprise vit sur son propre sous-domaine `*.myworkdayjobs.com`,
 * avec son propre robots.txt. L'identifiant de cible est donc
 * « hôte/site » - « workday.wd5.myworkdayjobs.com/Workday » - et la
 * permission se relit chez CE locataire à CHAQUE collecte : c'est la règle du
 * registre dynamique (docs/legal-compliance.md), appliquée à un ATS dont le
 * domaine varie par entreprise.
 */
interface WorkdaySite {
  readonly host: string;
  readonly tenant: string;
  readonly site: string;
}

/**
 * Recherches lancées sur chaque board. Le périmètre produit décide :
 * l'alternance d'abord, le stage ensuite. Le tri fin (métier, commune,
 * fraîcheur) appartient à l'ingestion, comme pour Workable.
 */
const SEARCH_TEXTS = ["alternance", "stage"] as const;

/** Taille de page du flux CXS, celle que le site carrière utilise lui-même. */
const PAGE_SIZE = 20;

/** Borne de sécurité : atteindre ce nombre lève plutôt que d'amputer la liste. */
const MAX_PAGES_PER_SEARCH = 10;

/**
 * Plafond de fiches détaillées par collecte. Le détail est indispensable - lui
 * seul porte la date absolue et la description - mais une requête par offre se
 * paie : au-delà, la collecte lève plutôt que de rendre une liste amputée.
 */
const MAX_DETAILS = 60;

/*
 * Forme relevée sur workday.wd5.myworkdayjobs.com/wday/cxs/workday/Workday/jobs
 * le 2026-07-26. `postedOn` est un libellé relatif (« Posted 3 Days Ago ») :
 * il sert à écarter le vieux avant d'aller lire le détail, jamais à fabriquer
 * une date.
 */
const listingSchema = z.object({
  title: z.string(),
  externalPath: z.string(),
  locationsText: z.string().nullish(),
  postedOn: z.string().nullish(),
});

const pageSchema = z.object({
  total: z.number(),
  jobPostings: z.array(z.unknown()),
});

/*
 * Forme relevée sur .../wday/cxs/workday/Workday/job/<chemin> le 2026-07-26.
 * `startDate` est la date d'ouverture de l'annonce, absolue (« 2026-06-11 ») :
 * c'est elle qui devient `publishedAt`, jamais le libellé relatif.
 */
const detailSchema = z.object({
  jobPostingInfo: z.object({
    title: z.string(),
    jobDescription: z.string().nullish(),
    location: z.string().nullish(),
    startDate: z.string().nullish(),
    jobReqId: z.string().nullish(),
    externalUrl: z.string().nullish(),
  }),
  hiringOrganization: z.object({ name: z.string().nullish() }).nullish(),
});

export class WorkdayShapeError extends Error {
  override readonly name = "WorkdayShapeError";

  constructor(detail: string) {
    super(`La réponse de Workday n'a pas la forme attendue : ${detail}`);
  }
}

/** La permission manque : ce locataire ne se collecte pas, les autres si. */
export class WorkdayRobotsError extends Error {
  override readonly name = "WorkdayRobotsError";

  constructor(host: string, detail: string) {
    super(`Collecte refusée sur ${host} : ${detail}`);
  }
}

const issuesOf = (error: z.ZodError): string =>
  error.issues.map((issue) => `${issue.path.join(".")} : ${issue.message}`).join(" ; ");

const parseSite = (atsIdentifier: string): WorkdaySite => {
  const [host, site, ...rest] = atsIdentifier.split("/").filter((segment) => segment !== "");
  const tenant = host?.split(".")[0];

  if (
    host === undefined ||
    site === undefined ||
    rest.length > 0 ||
    tenant === undefined ||
    tenant === "" ||
    !host.toLowerCase().endsWith(".myworkdayjobs.com")
  ) {
    throw new WorkdayShapeError(
      `l'identifiant « ${atsIdentifier} » n'est pas de la forme « hôte.myworkdayjobs.com/Site ».`,
    );
  }

  return { host, tenant, site };
};

/**
 * Le libellé relatif dit-il que l'offre est encore fraîche ? « Posted
 * Today », « Posted Yesterday » et « Posted N Days Ago » (N ≤ 4) méritent le
 * détail - la fenêtre de publication du projet est de 72 h, un jour de marge
 * absorbe les fuseaux. Un libellé illisible mérite aussi le détail : dans le
 * doute, on lit la vraie date plutôt que de deviner. Seul le vieux certain
 * (« 30+ Days Ago », N > 4) est écarté sans requête.
 */
const deservesDetail = (postedOn: string | null | undefined): boolean => {
  if (postedOn === null || postedOn === undefined) {
    return true;
  }

  const label = postedOn.toLowerCase();
  if (label.includes("today") || label.includes("yesterday")) {
    return true;
  }

  const days = /posted\s+(?<count>\d+)\+?\s+days?\s+ago/u.exec(label);
  if (days?.groups?.["count"] === undefined) {
    return true;
  }

  return Number(days.groups["count"]) <= 4;
};

const parseStartDate = (startDate: string | null | undefined): Date | null => {
  if (startDate === null || startDate === undefined) {
    return null;
  }

  const parsed = new Date(startDate);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const collect = async (
  _permit: CollectionPermit,
  target: CollectionTarget,
  context: CollectionContext,
): Promise<readonly RawJob[]> => {
  const { host, tenant, site } = parseSite(target.atsIdentifier);

  // 1. La permission du locataire, relue maintenant. Un robots.txt illisible
  // ou muet n'est pas un oui : la position du projet est de ne pas collecter
  // ce qui n'est pas explicitement permis.
  const robots = parseRobots(await context.fetchText(`https://${host}/robots.txt`));
  const feedPath = `/wday/cxs/${tenant}/${site}/jobs`;

  for (const path of [`/${site}/`, feedPath]) {
    const decision = decideRobots(robots, FINDIT_USER_AGENT, path);
    if (decision.verdict !== "ALLOWED") {
      throw new WorkdayRobotsError(
        host,
        `robots.txt ne permet pas « ${path} » (${decision.detail})`,
      );
    }

    if (decision.crawlDelayMs !== null && decision.crawlDelayMs > WORKDAY_REQUEST_INTERVAL_MS) {
      throw new WorkdayRobotsError(
        host,
        `le Crawl-delay annoncé (${String(decision.crawlDelayMs)} ms) dépasse la cadence de ce connecteur.`,
      );
    }
  }

  // 2. Les listes, une recherche à la fois. Le flux CXS est celui que la page
  // carrière charge elle-même ; il se lit en POST.
  const listings = new Map<string, z.infer<typeof listingSchema>>();

  for (const searchText of SEARCH_TEXTS) {
    for (let page = 0; page < MAX_PAGES_PER_SEARCH; page += 1) {
      const payload = await context.fetchJson(`https://${host}${feedPath}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          appliedFacets: {},
          limit: PAGE_SIZE,
          offset: page * PAGE_SIZE,
          searchText,
        }),
      });

      const parsed = pageSchema.safeParse(payload);
      if (!parsed.success) {
        throw new WorkdayShapeError(
          `la page ${String(page)} de « ${searchText} » n'a pas la forme attendue (${issuesOf(parsed.error)}).`,
        );
      }

      for (const [index, raw] of parsed.data.jobPostings.entries()) {
        const listing = listingSchema.safeParse(raw);
        if (!listing.success) {
          throw new WorkdayShapeError(
            `l'offre à l'indice ${String(page * PAGE_SIZE + index)} est inexploitable (${issuesOf(listing.error)}).`,
          );
        }

        // La même offre ressort des deux recherches : une seule fiche suffit.
        listings.set(listing.data.externalPath, listing.data);
      }

      if ((page + 1) * PAGE_SIZE >= parsed.data.total || parsed.data.jobPostings.length === 0) {
        break;
      }

      if (page + 1 === MAX_PAGES_PER_SEARCH) {
        throw new WorkdayShapeError(
          `plus de ${String(MAX_PAGES_PER_SEARCH)} pages pour « ${searchText} » sur ${host} : la collecte s'arrête plutôt que de rendre une liste amputée.`,
        );
      }
    }
  }

  // 3. Le détail des offres encore fraîches - lui seul porte la date absolue
  // (`startDate`), la description et l'URL officielle.
  const fresh = [...listings.values()].filter((listing) => deservesDetail(listing.postedOn));
  if (fresh.length > MAX_DETAILS) {
    throw new WorkdayShapeError(
      `${String(fresh.length)} offres fraîches sur ${host}, plafond ${String(MAX_DETAILS)} : la collecte s'arrête plutôt que de rendre une liste amputée.`,
    );
  }

  const jobs: RawJob[] = [];
  for (const listing of fresh) {
    const payload = await context.fetchJson(
      `https://${host}/wday/cxs/${tenant}/${site}${listing.externalPath}`,
    );

    const parsed = detailSchema.safeParse(payload);
    if (!parsed.success) {
      throw new WorkdayShapeError(
        `le détail de « ${listing.externalPath} » est inexploitable (${issuesOf(parsed.error)}).`,
      );
    }

    const info = parsed.data.jobPostingInfo;

    jobs.push({
      sourceJobId: info.jobReqId ?? listing.externalPath,
      url: info.externalUrl ?? `https://${host}/${site}${listing.externalPath}`,
      title: info.title,
      locationLabel: info.location ?? listing.locationsText ?? null,
      descriptionHtml: info.jobDescription ?? null,
      publishedAt: parseStartDate(info.startDate),
      // Le locataire est l'entreprise, mais le détail la nomme proprement
      // (« Workday Limited ») là où la cible ne porte qu'un jeton d'hôte.
      companyName: parsed.data.hiringOrganization?.name ?? null,
      rawContent: JSON.stringify(payload),
      contentType: "application/json",
    });
  }

  return jobs;
};

export const workdayConnector: JobSourceConnector<CollectionTarget> = {
  name: WORKDAY_CONNECTOR_NAME,
  atsKind: AtsKind.WORKDAY,
  minRequestIntervalMs: WORKDAY_REQUEST_INTERVAL_MS,
  collect,
};
