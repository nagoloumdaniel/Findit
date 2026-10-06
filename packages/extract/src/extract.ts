import type { z } from "zod";

import type { CrawledPage } from "@findit/crawler";

import { extractionResponseSchema } from "./schema.js";
import type { ExtractedOffer, ExtractionResponse, JobOffer } from "./schema.js";
import { looksLikeSchool } from "./school.js";
import { MIN_VALIDATION_SCORE, scoreValidation } from "./validation.js";

/** Une offre écartée, avec le motif et le score de validation au moment du rejet. */
export interface RejectedOffer {
  readonly offer: JobOffer;
  readonly reason: string;
  readonly score: number;
}

/** Le résultat d'une extraction : offres conservées et offres écartées. */
export interface ExtractionResult {
  readonly offers: readonly JobOffer[];
  readonly rejected: readonly RejectedOffer[];
}

/** Usage cumulé d'un client de modèle, tel qu'il sait le rapporter. */
export interface ModelUsage {
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly calls: number;
}

/**
 * Contrat minimal du modèle d'extraction. Il reflète `DeepSeekModel` de
 * `@findit/ai` : seul `generateStructured` est utilisé ici. Le modèle est donc
 * construit par l'appelant (via `createDeepSeekModel`) puis passé tel quel.
 */
export interface ExtractModel {
  generateStructured: <T>(request: ExtractStructuredRequest<T>) => Promise<T>;
  /**
   * Tokens consommés depuis la création du client, quand le client sait les
   * rapporter. Absent, l'appelant ne peut attribuer aucun coût — et le dit.
   */
  readonly usage?: () => ModelUsage;
}

/** Demande de sortie structurée, identique à celle de `@findit/ai`. */
export interface ExtractStructuredRequest<T> {
  schema: z.ZodType<T>;
  prompt: string;
  system?: string;
  temperature?: number;
}

/**
 * Erreur d'extraction : le modèle a répondu, mais sa sortie ne respecte pas le
 * schéma attendu. Elle ne passe jamais pour un succès.
 */
export class ExtractError extends Error {
  override readonly name = "ExtractError";
}

/**
 * Borne sur le contenu envoyé au modèle : elle plafonne le coût de l'appel et
 * évite de dépasser la fenêtre de contexte du modèle sur une page énorme.
 */
const MAX_CONTENT_CHARS = 30_000;

/**
 * Consigne système stricte. Elle interdit l'invention, impose qu'un champ
 * absent reste absent, et écarte d'emblée tout ce qui relève d'une école ou
 * d'une formation. C'est une consigne, pas une garantie : la revalidation Zod
 * et le garde-fou déterministe restent la vraie défense.
 */
const SYSTEM_PROMPT = [
  "Tu extrais des offres d'emploi à partir du contenu d'une page web.",
  "Règles strictes :",
  "- N'invente jamais une information absente de la page.",
  "- Un champ absent de la page doit rester absent : ne le remplis pas.",
  "- Ignore les offres qui concernent une école, un organisme de formation, un bootcamp, un campus ou l'obtention d'un diplôme.",
  "- technologies liste les technologies ou compétences techniques nommées dans l'offre ; liste vide si aucune n'est nommée.",
  "- publishedAt est la date de publication au format ISO (AAAA-MM-JJ). Si la page donne une date relative (« il y a 3 jours », « publié cette semaine »), convertis-la en te servant de la date du jour fournie ; sinon absent.",
  "- applicationUrl est l'URL de candidature si elle est distincte de la page, sinon absent.",
  "- S'il n'y a aucune offre d'emploi sur la page, réponds avec un tableau offers vide.",
].join("\n");

/** Domaine de l'URL d'origine, vide quand l'URL n'est pas analysable. */
const sourceDomainOf = (url: string): string => {
  try {
    return new URL(url).hostname;
  } catch {
    return "";
  }
};

/** Rend la valeur tronquée non vide, sinon `undefined` (champ absent). */
const trimmedOrUndefined = (value: string | undefined): string | undefined => {
  const trimmed = value?.trim();
  return trimmed !== undefined && trimmed !== "" ? trimmed : undefined;
};

/** Construit le prompt à partir du texte visible, ou du HTML en repli. */
const buildPrompt = (page: CrawledPage, now: Date): string => {
  const content = page.text.trim() !== "" ? page.text : page.html;
  const bounded = content.slice(0, MAX_CONTENT_CHARS);
  const today = now.toISOString().slice(0, 10);
  return `Date du jour : ${today}\n\nContenu de la page (${page.url}) :\n\n${bounded}`;
};

/**
 * Enrichit une offre extraite avec les métadonnées de la page d'origine. Un
 * champ facultatif vide ou absent reste absent, et l'URL de candidature
 * retombe sur l'URL de la page quand le modèle n'en a pas trouvé de distincte.
 */
const toJobOffer = (extracted: ExtractedOffer, page: CrawledPage): JobOffer => {
  const job: JobOffer = {
    title: extracted.title.trim(),
    company: extracted.company.trim(),
    technologies: extracted.technologies.map((t) => t.trim()).filter((t) => t !== ""),
    applicationUrl: trimmedOrUndefined(extracted.applicationUrl) ?? page.url,
    sourceUrl: page.url,
    sourceDomain: sourceDomainOf(page.url),
  };

  const location = trimmedOrUndefined(extracted.location);
  if (location !== undefined) {
    job.location = location;
  }
  const contractType = trimmedOrUndefined(extracted.contractType);
  if (contractType !== undefined) {
    job.contractType = contractType;
  }
  const description = trimmedOrUndefined(extracted.description);
  if (description !== undefined) {
    job.description = description;
  }
  const salary = trimmedOrUndefined(extracted.salary);
  if (salary !== undefined) {
    job.salary = salary;
  }
  const publishedAt = trimmedOrUndefined(extracted.publishedAt);
  if (publishedAt !== undefined) {
    job.publishedAt = publishedAt;
  }

  return job;
};

/**
 * Enrichit et filtre une liste d'offres extraites, quelle qu'en soit la source :
 * modèle ou données structurées. Le tri est le même dans les deux cas — école
 * d'abord, puis complétude — pour qu'une offre ne dépende jamais de son origine.
 *
 * Une école ou une offre incomplète est écartée avec un motif explicite, jamais
 * silencieusement. La fonction est synchrone et sans I/O : elle ne fait que
 * transformer des données déjà lues.
 */
export const finalizeExtraction = (
  extracted: readonly ExtractedOffer[],
  page: CrawledPage,
): ExtractionResult => {
  const offers: JobOffer[] = [];
  const rejected: RejectedOffer[] = [];

  for (const item of extracted) {
    const offer = toJobOffer(item, page);
    const validation = scoreValidation(offer);

    // Une école passe avant tout : même complète, elle n'est pas une offre.
    if (looksLikeSchool(offer)) {
      rejected.push({
        offer,
        reason: "école ou organisme de formation détecté",
        score: validation.score,
      });
      continue;
    }

    if (validation.score < MIN_VALIDATION_SCORE) {
      rejected.push({
        offer,
        reason: `offre incomplète : ${validation.reasons.join(", ")}`,
        score: validation.score,
      });
      continue;
    }

    offers.push(offer);
  }

  return { offers, rejected };
};

/**
 * Transforme une page crawlée en offres structurées via le modèle DeepSeek.
 *
 * La sortie du modèle est revalidée contre le schéma Zod, puis déléguée à
 * `finalizeExtraction` pour l'enrichissement et le filtrage.
 */
export const extractJobsFromPage = async (
  page: CrawledPage,
  model: ExtractModel,
  now: Date = new Date(),
): Promise<ExtractionResult> => {
  const raw = await model.generateStructured<ExtractionResponse>({
    schema: extractionResponseSchema,
    system: SYSTEM_PROMPT,
    prompt: buildPrompt(page, now),
  });

  // Revalidation défensive : un modèle, ou une doublure de test, peut ne pas
  // appliquer le schéma. On ne fait confiance qu'à une sortie validée par Zod.
  const parsed = extractionResponseSchema.safeParse(raw);
  if (!parsed.success) {
    throw new ExtractError(
      `La sortie du modèle ne respecte pas le schéma attendu : ${parsed.error.message}`,
    );
  }

  return finalizeExtraction(parsed.data.offers, page);
};
