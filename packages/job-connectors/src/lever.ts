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
export const LEVER_CONNECTOR_NAME = "lever";

/**
 * `robots.txt` de Lever annonce `Crawl-delay: 1`. C'est une contrainte de la
 * source, pas un réglage de confort : une seconde entre deux requêtes, même si
 * le débit en souffre. La cadence est appliquée par l'exécuteur.
 */
export const LEVER_CRAWL_DELAY_MS = 1000;

/**
 * Sans `limit`, l'API rend tout ; mais rien ne l'annonce et aucun total n'est
 * fourni, donc rien ne permettrait de voir une réponse tronquée. Les pages sont
 * demandées explicitement : une page courte est une fin de liste, et non une
 * troncature devinée.
 */
const POSTINGS_PER_PAGE = 100;

/**
 * Borne de sécurité. L'atteindre lève une erreur au lieu de rendre une liste
 * amputée en silence : aucune entreprise du périmètre ne publie autant.
 */
const MAX_PAGES = 50;

const postingsUrl = (atsIdentifier: string, skip: number): string =>
  `https://api.lever.co/v0/postings/${encodeURIComponent(atsIdentifier)}?mode=json&limit=${String(POSTINGS_PER_PAGE)}&skip=${String(skip)}`;

const listSchema = z.object({
  text: z.string().nullish(),
  content: z.string().nullish(),
});

const postingSchema = z.object({
  id: z.string(),
  /** Le titre de l'offre. Lever ne l'appelle pas « title ». */
  text: z.string(),
  hostedUrl: z.string(),
  /** Date de création, en millisecondes depuis l'époque. */
  createdAt: z.number().nullish(),
  categories: z.object({ location: z.string().nullish() }).nullish(),
  description: z.string().nullish(),
  lists: z.array(listSchema).nullish(),
  additional: z.string().nullish(),
});

export class LeverShapeError extends Error {
  override readonly name = "LeverShapeError";

  constructor(detail: string) {
    super(`La réponse de Lever n'a pas la forme attendue : ${detail}`);
  }
}

const issuesOf = (error: z.ZodError): string =>
  error.issues.map((issue) => `${issue.path.join(".")} : ${issue.message}`).join(" ; ");

/**
 * Un intitulé de section est du texte, pas du balisage. Il vient de
 * l'employeur : l'insérer tel quel dans du HTML laisserait la source décider du
 * balisage produit.
 */
const escapeHtmlText = (text: string): string =>
  text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");

/**
 * Lever éclate une offre en trois : `description` porte l'introduction, `lists`
 * les sections à puces - les prérequis en font partie - et `additional` la
 * clôture. Prendre `description` seule reviendrait à perdre ce qui est demandé
 * au candidat. Les morceaux sont recollés dans l'ordre où la source les rend ;
 * la charge utile d'origine, elle, part intacte dans `rawContent`.
 */
const assembleDescriptionHtml = (posting: z.infer<typeof postingSchema>): string | null => {
  const sections: string[] = [];

  if (posting.description !== null && posting.description !== undefined) {
    sections.push(posting.description);
  }

  for (const list of posting.lists ?? []) {
    const heading =
      list.text === null || list.text === undefined ? "" : `<h3>${escapeHtmlText(list.text)}</h3>`;
    const content =
      list.content === null || list.content === undefined ? "" : `<ul>${list.content}</ul>`;

    if (heading !== "" || content !== "") {
      sections.push(`${heading}${content}`);
    }
  }

  if (posting.additional !== null && posting.additional !== undefined) {
    sections.push(posting.additional);
  }

  return sections.length === 0 ? null : sections.join("\n");
};

/**
 * Une date illisible est rendue absente plutôt que remplacée par « maintenant » :
 * une offre sans date fiable ne doit pas pouvoir se faire passer pour fraîche.
 */
const parsePublishedAt = (createdAt: number | null | undefined): Date | null => {
  if (createdAt === null || createdAt === undefined || !Number.isFinite(createdAt)) {
    return null;
  }

  const parsed = new Date(createdAt);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const toRawJob = (raw: unknown, position: number): RawJob => {
  const parsed = postingSchema.safeParse(raw);
  if (!parsed.success) {
    throw new LeverShapeError(
      `l'offre à l'indice ${String(position)} est inexploitable (${issuesOf(parsed.error)}).`,
    );
  }

  const posting = parsed.data;

  return {
    sourceJobId: posting.id,
    url: posting.hostedUrl,
    title: posting.text,
    locationLabel: posting.categories?.location ?? null,
    descriptionHtml: assembleDescriptionHtml(posting),
    publishedAt: parsePublishedAt(posting.createdAt),
    rawContent: JSON.stringify(raw),
    contentType: "application/json",
  };
};

const collect = async (
  _permit: CollectionPermit,
  target: CollectionTarget,
  context: CollectionContext,
): Promise<readonly RawJob[]> => {
  const jobs: RawJob[] = [];

  for (let page = 0; page < MAX_PAGES; page += 1) {
    const skip = page * POSTINGS_PER_PAGE;
    const payload = await context.fetchJson(postingsUrl(target.atsIdentifier, skip));

    // Lever rend un tableau nu, sans enveloppe ni total.
    const parsed = z.array(z.unknown()).safeParse(payload);
    if (!parsed.success) {
      throw new LeverShapeError(
        `la page ${String(page)} n'est pas un tableau (${issuesOf(parsed.error)}).`,
      );
    }

    jobs.push(...parsed.data.map((raw, index) => toRawJob(raw, skip + index)));

    // Une page incomplète est la dernière. Une page pleine ne prouve rien :
    // il faut redemander, quitte à ce que la suivante soit vide.
    if (parsed.data.length < POSTINGS_PER_PAGE) {
      return jobs;
    }
  }

  throw new LeverShapeError(
    `plus de ${String(MAX_PAGES * POSTINGS_PER_PAGE)} offres pour « ${target.atsIdentifier} » : la collecte s'arrête plutôt que de rendre une liste amputée.`,
  );
};

export const leverConnector: JobSourceConnector = {
  name: LEVER_CONNECTOR_NAME,
  atsKind: AtsKind.LEVER,
  minRequestIntervalMs: LEVER_CRAWL_DELAY_MS,
  collect,
};
