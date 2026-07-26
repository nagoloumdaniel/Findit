import { AtsKind } from "@findit/database";
import { z } from "zod";

import type { CollectionContext, JobSourceConnector, RawJob, SearchTarget } from "./connector.js";
import type { CollectionPermit } from "./permit.js";

/** Doit correspondre à `Connector.name` en base. */
export const WORKABLE_CONNECTOR_NAME = "workable";

/**
 * `apply.workable.com/robots.txt` dit « `Disallow:` » - rien n'est interdit - et
 * `jobs.workable.com` ne vise que `/search…` et `/profile*`, jamais `/api/`.
 * Aucun `Crawl-delay` n'est annoncé : une requête par seconde, par prudence.
 * Voir docs/legal-compliance.md.
 */
export const WORKABLE_REQUEST_INTERVAL_MS = 1000;

/**
 * Workable cherche à travers tout son réseau, pas une entreprise à la fois.
 * C'est ce qui le distingue de Greenhouse et de Lever, et pourquoi son
 * connecteur vise une recherche plutôt qu'un board.
 */
const searchUrl = (target: SearchTarget, pageToken: string | null): string => {
  const url = new URL("https://jobs.workable.com/api/v1/jobs");
  url.searchParams.set("query", target.query);
  url.searchParams.set("location", target.location);

  if (pageToken !== null) {
    url.searchParams.set("pageToken", pageToken);
  }

  return url.toString();
};

/** Borne de sécurité : atteindre ce nombre lève plutôt que d'amputer la liste. */
const MAX_PAGES = 25;

const jobSchema = z.object({
  id: z.string(),
  title: z.string(),
  url: z.string(),
  description: z.string().nullish(),
  requirementsSection: z.string().nullish(),
  benefitsSection: z.string().nullish(),
  /** Date de publication. Workable la rend en ISO. */
  created: z.string().nullish(),
  /** Localisation structurée : aucune autre source vérifiée n'en donne autant. */
  location: z
    .object({
      city: z.string().nullish(),
      subregion: z.string().nullish(),
      countryName: z.string().nullish(),
    })
    .nullish(),
  company: z.object({ title: z.string().nullish() }).nullish(),
});

const pageSchema = z.object({
  totalSize: z.number(),
  nextPageToken: z.string().nullish(),
  jobs: z.array(z.unknown()),
});

export class WorkableShapeError extends Error {
  override readonly name = "WorkableShapeError";

  constructor(detail: string) {
    super(`La réponse de Workable n'a pas la forme attendue : ${detail}`);
  }
}

const issuesOf = (error: z.ZodError): string =>
  error.issues.map((issue) => `${issue.path.join(".")} : ${issue.message}`).join(" ; ");

/**
 * Recolle la localisation dans le libellé que le reste de la chaîne sait lire.
 * Workable la rend déjà découpée - « Paris », « Île-de-France », « France » -
 * et l'écrire dans cet ordre donne exactement la forme que Greenhouse produit
 * naturellement, sans rien inventer.
 */
const locationLabel = (job: z.infer<typeof jobSchema>): string | null => {
  const parts = [job.location?.city, job.location?.subregion, job.location?.countryName].filter(
    (part): part is string => part !== null && part !== undefined && part.trim() !== "",
  );

  return parts.length === 0 ? null : parts.join(", ");
};

/**
 * Workable éclate l'offre en trois champs. Les recoller garde les prérequis et
 * les avantages, que `description` seule ne porte pas.
 */
const descriptionHtml = (job: z.infer<typeof jobSchema>): string | null => {
  const sections = [job.description, job.requirementsSection, job.benefitsSection].filter(
    (section): section is string => section !== null && section !== undefined && section !== "",
  );

  return sections.length === 0 ? null : sections.join("\n");
};

const parsePublishedAt = (created: string | null | undefined): Date | null => {
  if (created === null || created === undefined) {
    return null;
  }

  const parsed = new Date(created);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const toRawJob = (raw: unknown, position: number): RawJob => {
  const parsed = jobSchema.safeParse(raw);
  if (!parsed.success) {
    throw new WorkableShapeError(
      `l'offre à l'indice ${String(position)} est inexploitable (${issuesOf(parsed.error)}).`,
    );
  }

  const job = parsed.data;

  return {
    sourceJobId: job.id,
    url: job.url,
    title: job.title,
    locationLabel: locationLabel(job),
    descriptionHtml: descriptionHtml(job),
    publishedAt: parsePublishedAt(job.created),
    // La recherche traverse tout le réseau : l'employeur est celui que
    // l'offre porte, jamais un libellé de requête.
    companyName: job.company?.title ?? null,
    rawContent: JSON.stringify(raw),
    contentType: "application/json",
  };
};

const collect = async (
  _permit: CollectionPermit,
  target: SearchTarget,
  context: CollectionContext,
): Promise<readonly RawJob[]> => {
  const jobs: RawJob[] = [];
  let pageToken: string | null = null;

  for (let page = 0; page < MAX_PAGES; page += 1) {
    const payload = await context.fetchJson(searchUrl(target, pageToken));

    const parsed = pageSchema.safeParse(payload);
    if (!parsed.success) {
      throw new WorkableShapeError(
        `la page ${String(page)} n'a pas la forme attendue (${issuesOf(parsed.error)}).`,
      );
    }

    jobs.push(...parsed.data.jobs.map((raw, index) => toRawJob(raw, jobs.length + index)));

    // Workable dit lui-même s'il reste quelque chose. Pas de jeton, pas de suite.
    pageToken = parsed.data.nextPageToken ?? null;
    if (pageToken === null || parsed.data.jobs.length === 0) {
      return jobs;
    }
  }

  throw new WorkableShapeError(
    `plus de ${String(MAX_PAGES)} pages pour « ${target.query} » : la collecte s'arrête plutôt que de rendre une liste amputée.`,
  );
};

export const workableConnector: JobSourceConnector<SearchTarget> = {
  name: WORKABLE_CONNECTOR_NAME,
  atsKind: AtsKind.WORKABLE,
  minRequestIntervalMs: WORKABLE_REQUEST_INTERVAL_MS,
  collect,
};
