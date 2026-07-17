import { AtsKind } from "@findit/database";
import { z } from "zod";

import type {
  CollectionContext,
  CollectionTarget,
  JobSourceConnector,
  RawJob,
} from "./connector.js";
import type { CollectionPermit } from "./permit.js";

/** Doit correspondre à `Connector.name` en base. */
export const GREENHOUSE_CONNECTOR_NAME = "greenhouse";

/**
 * Le flux public documenté. `robots.txt` n'interdit que `/embed/` : ce chemin
 * est permis. Voir docs/legal-compliance.md.
 */
const boardUrl = (atsIdentifier: string): string =>
  `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(atsIdentifier)}/jobs?content=true`;

/**
 * L'API rend tout le tableau d'offres en une seule réponse : `meta.total` vaut
 * le nombre d'entrées de `jobs`, et aucun paramètre de page n'est proposé.
 * Un seul appel suffit donc par entreprise.
 */
const boardSchema = z.object({
  jobs: z.array(z.unknown()),
  meta: z.object({ total: z.number() }),
});

const jobSchema = z.object({
  id: z.number(),
  absolute_url: z.string(),
  title: z.string(),
  location: z.object({ name: z.string() }).nullish(),
  content: z.string().nullish(),
  /** Date de première publication. C'est elle qui fait foi, pas `updated_at`. */
  first_published: z.string().nullish(),
  updated_at: z.string().nullish(),
});

/**
 * Greenhouse rend `content` entièrement échappé : la charge utile ne contient
 * aucun `<`, seulement `&lt;`, `&gt;`, `&quot;`, `&#39;` et `&amp;`. Sans ce
 * décodage, le HTML de l'offre n'est qu'un texte inerte.
 *
 * `&amp;` se décode en dernier. Un `&lt;` littéral du texte d'origine arrive
 * ici en `&amp;lt;` : le décoder d'abord le transformerait en balise.
 */
const decodeEscapedHtml = (escaped: string): string =>
  escaped
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replaceAll("&amp;", "&");

export class GreenhouseShapeError extends Error {
  override readonly name = "GreenhouseShapeError";

  constructor(detail: string) {
    super(`La réponse de Greenhouse n'a pas la forme attendue : ${detail}`);
  }
}

/**
 * Une date invalide n'est pas une date. Elle est rendue absente plutôt que
 * remplacée par « maintenant » : une offre sans date fiable ne doit pas
 * pouvoir se faire passer pour une offre fraîche.
 */
const parseDate = (value: string | null | undefined): Date | null => {
  if (value === null || value === undefined) {
    return null;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const toRawJob = (raw: unknown, index: number): RawJob => {
  const parsed = jobSchema.safeParse(raw);
  if (!parsed.success) {
    throw new GreenhouseShapeError(
      `l'offre à l'indice ${String(index)} est inexploitable (${parsed.error.issues
        .map((issue) => `${issue.path.join(".")} : ${issue.message}`)
        .join(" ; ")}).`,
    );
  }

  const job = parsed.data;
  const content = job.content ?? null;

  return {
    sourceJobId: String(job.id),
    url: job.absolute_url,
    title: job.title,
    locationLabel: job.location?.name ?? null,
    descriptionHtml: content === null ? null : decodeEscapedHtml(content),
    publishedAt: parseDate(job.first_published),
    // La charge utile d'origine, telle que reçue, pour que la décision reste
    // reconstituable et qu'un changement de structure soit visible.
    rawContent: JSON.stringify(raw),
    contentType: "application/json",
  };
};

const collect = async (
  _permit: CollectionPermit,
  target: CollectionTarget,
  context: CollectionContext,
): Promise<readonly RawJob[]> => {
  const payload = await context.fetchJson(boardUrl(target.atsIdentifier));

  const board = boardSchema.safeParse(payload);
  if (!board.success) {
    throw new GreenhouseShapeError(
      board.error.issues.map((issue) => `${issue.path.join(".")} : ${issue.message}`).join(" ; "),
    );
  }

  return board.data.jobs.map(toRawJob);
};

export const greenhouseConnector: JobSourceConnector = {
  name: GREENHOUSE_CONNECTOR_NAME,
  atsKind: AtsKind.GREENHOUSE,
  /** Aucune limite n'est annoncée. Une requête par seconde, par prudence. */
  minRequestIntervalMs: 1000,
  collect,
};
