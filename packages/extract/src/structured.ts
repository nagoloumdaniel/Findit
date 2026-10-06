import { load } from "cheerio";

import type { CrawledPage } from "@findit/crawler";

import { finalizeExtraction } from "./extract.js";
import type { ExtractionResult } from "./extract.js";
import type { ExtractedOffer } from "./schema.js";

/**
 * Extraction déterministe des offres d'emploi déclarées en JSON-LD
 * (`schema.org/JobPosting`).
 *
 * Cet étage ne fait aucun appel de modèle : il lit ce que le site déclare
 * lui-même. C'est le chemin le moins coûteux et le plus fiable, et il sert de
 * première source avant l'étage LLM. Un champ absent du JSON-LD reste absent :
 * on ne complète jamais une déclaration partielle par déduction.
 */

/** Vrai si la valeur est un objet JSON non tableau, donc un nœud exploitable. */
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** Une chaîne non vide, ou `undefined` pour laisser le champ absent. */
const asString = (value: unknown): string | undefined => {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
};

/** Une chaîne OU un nombre rendus sous forme de texte (salaires notamment). */
const asScalarText = (value: unknown): string | undefined => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  return asString(value);
};

/** Normalise les espaces d'un texte déjà débarrassé de ses balises. */
const collapseWhitespace = (text: string): string => text.replace(/\s+/gu, " ").trim();

/**
 * Retire le balisage d'une description JSON-LD. Les descriptions JobPosting
 * contiennent souvent du HTML : on le fait analyser par Cheerio plutôt que par
 * une expression régulière, qui laisserait des restes sur les cas tordus.
 */
const stripHtml = (html: string): string => {
  if (!html.includes("<")) {
    return collapseWhitespace(html);
  }
  return collapseWhitespace(load(html).root().text());
};

/**
 * Extrait les nœuds candidats d'un document JSON-LD. Un document peut être un
 * nœud seul, un tableau de nœuds, ou une enveloppe `@graph` : les formats se
 * croisent couramment, et un tableau peut lui-même contenir un `@graph`.
 */
const collectNodes = (value: unknown): readonly Record<string, unknown>[] => {
  if (Array.isArray(value)) {
    return value.flatMap((item) => collectNodes(item));
  }
  if (!isRecord(value)) {
    return [];
  }

  const graph = value["@graph"];
  const nested = Array.isArray(graph) ? graph.flatMap((item) => collectNodes(item)) : [];

  // Le nœud porteur de `@graph` peut lui-même être une offre ; on ne l'écarte
  // pas, le filtre de type qui suit fera le tri.
  return isJobPosting(value) ? [value, ...nested] : nested;
};

/** Le `@type` peut être une chaîne ou un tableau de chaînes. */
const isJobPosting = (node: Record<string, unknown>): boolean => {
  const type = node["@type"];
  if (typeof type === "string") {
    return type === "JobPosting";
  }
  return Array.isArray(type) && type.includes("JobPosting");
};

/** Premier élément quand la valeur est un tableau, la valeur elle-même sinon. */
const firstOf = (value: unknown): unknown => (Array.isArray(value) ? value[0] : value);

/** `employmentType` : chaîne ou tableau, on retient la première valeur. */
const employmentTypeOf = (node: Record<string, unknown>): string | undefined => {
  const value = node["employmentType"];
  return Array.isArray(value) ? asString(value[0]) : asString(value);
};

/** `hiringOrganization` : son `name`, ou directement la chaîne si c'en est une. */
const companyOf = (node: Record<string, unknown>): string | undefined => {
  const organization = node["hiringOrganization"];
  if (isRecord(organization)) {
    return asString(organization["name"]);
  }
  return asString(organization);
};

/**
 * `jobLocation.address` assemblé. `jobLocation` peut être un tableau : le
 * premier élément est le lieu principal. On n'assemble que des composantes
 * réellement présentes, sans jamais combler un trou.
 */
const locationOf = (node: Record<string, unknown>): string | undefined => {
  const jobLocation = firstOf(node["jobLocation"]);
  if (!isRecord(jobLocation)) {
    return undefined;
  }

  const address = jobLocation["address"];
  if (!isRecord(address)) {
    // Une adresse donnée en clair reste une adresse : on ne la réinvente pas.
    return asString(address);
  }

  const parts = [address["addressLocality"], address["addressRegion"], address["addressCountry"]]
    .map((part) => asString(part))
    .filter((part): part is string => part !== undefined);

  return parts.length > 0 ? parts.join(", ") : undefined;
};

/**
 * `baseSalary` : une chaîne, ou un `MonetaryAmount` dont la valeur peut être un
 * scalaire ou un `QuantitativeValue` (`value`, `minValue`, `maxValue`). On
 * prend la première information disponible ; sans elle, le champ reste absent
 * plutôt que d'afficher un montant fabriqué.
 */
const salaryOf = (node: Record<string, unknown>): string | undefined => {
  const baseSalary = node["baseSalary"];
  const direct = asScalarText(baseSalary);
  if (direct !== undefined) {
    return direct;
  }
  if (!isRecord(baseSalary)) {
    return undefined;
  }

  const value = baseSalary["value"];
  const scalar = asScalarText(value);
  if (scalar !== undefined) {
    return scalar;
  }
  if (!isRecord(value)) {
    return undefined;
  }

  return (
    asScalarText(value["value"]) ??
    asScalarText(value["minValue"]) ??
    asScalarText(value["maxValue"])
  );
};

/** `datePosted` ramené à `AAAA-MM-JJ`, uniquement si la date est analysable. */
const publishedAtOf = (node: Record<string, unknown>): string | undefined => {
  const raw = asString(node["datePosted"]);
  if (raw === undefined) {
    return undefined;
  }
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString().slice(0, 10);
};

/** `url` retenue seulement si c'est une URL http(s) valide. */
const applicationUrlOf = (node: Record<string, unknown>): string | undefined => {
  const raw = asString(node["url"]);
  if (raw === undefined) {
    return undefined;
  }
  try {
    const parsed = new URL(raw);
    return parsed.protocol === "http:" || parsed.protocol === "https:" ? raw : undefined;
  } catch {
    return undefined;
  }
};

/** `skills` : chaîne isolée ou tableau, filtré aux valeurs textuelles. */
const technologiesOf = (node: Record<string, unknown>): string[] => {
  const value = node["skills"];
  if (typeof value === "string") {
    const single = asString(value);
    return single === undefined ? [] : [single];
  }
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((skill) => asString(skill))
    .filter((skill): skill is string => skill !== undefined);
};

/**
 * Mappe un nœud `JobPosting` vers `ExtractedOffer`. Les champs facultatifs ne
 * sont posés que s'ils existent : `finalizeExtraction` appliquera ensuite le
 * même enrichissement et les mêmes filtres que pour une offre issue du modèle.
 */
const toExtractedOffer = (node: Record<string, unknown>): ExtractedOffer => {
  const offer: ExtractedOffer = {
    title: asString(node["title"]) ?? "",
    company: companyOf(node) ?? "",
    technologies: technologiesOf(node),
  };

  const location = locationOf(node);
  if (location !== undefined) {
    offer.location = location;
  }
  const contractType = employmentTypeOf(node);
  if (contractType !== undefined) {
    offer.contractType = contractType;
  }
  const description = asString(node["description"]);
  if (description !== undefined) {
    offer.description = stripHtml(description);
  }
  const salary = salaryOf(node);
  if (salary !== undefined) {
    offer.salary = salary;
  }
  const publishedAt = publishedAtOf(node);
  if (publishedAt !== undefined) {
    offer.publishedAt = publishedAt;
  }
  const applicationUrl = applicationUrlOf(node);
  if (applicationUrl !== undefined) {
    offer.applicationUrl = applicationUrl;
  }

  return offer;
};

/**
 * Extrait les offres déclarées en JSON-LD sur une page, sans modèle ni I/O.
 *
 * Un bloc `application/ld+json` illisible est ignoré : le JSON-LD est un bonus
 * de la page, jamais une condition de succès, et un bloc cassé ne doit pas faire
 * échouer l'extraction ni faire passer un déchet pour une offre.
 */
export const extractStructuredOffers = (page: CrawledPage): ExtractionResult => {
  const $ = load(page.html);
  const extracted: ExtractedOffer[] = [];

  $('script[type="application/ld+json"]').each((_index, element) => {
    const raw = $(element).text();
    if (raw.trim() === "") {
      return;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return;
    }

    for (const node of collectNodes(parsed)) {
      if (isJobPosting(node)) {
        extracted.push(toExtractedOffer(node));
      }
    }
  });

  return finalizeExtraction(extracted, page);
};
