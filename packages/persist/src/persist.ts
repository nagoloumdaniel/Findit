import type { PrismaClient } from "@findit/database";
import type { JobOffer } from "@findit/extract";
import { looksLikeSchool } from "@findit/extract";
import { classifyJob, detectSchoolRisk } from "@findit/job-classification";
import { normalizeTitle, resolveLocation } from "@findit/job-normalization";
import type {
  IleDeFranceDepartment,
  JobContract,
  JobRoleCategory,
  JobWorkMode,
} from "@findit/shared";
import { EXTENDED_MAX_AGE_HOURS } from "@findit/shared";

import { jobSlug, slugify } from "./slug.js";

/** Dépendances de la persistance, injectées pour rester vérifiable sans base. */
export interface PersistDeps {
  readonly prisma: PrismaClient;
  /**
   * Horloge injectée. Par défaut l'heure réelle, remplacée dans les tests pour
   * que la fraîcheur et les horodatages restent reproductibles.
   */
  readonly now?: () => Date;
}

/** Une offre écartée, avec le motif en français qui justifie son rejet. */
export interface RejectedOffer {
  readonly title: string;
  readonly reason: string;
}

/** Bilan d'une persistance : les compteurs, et les offres rejetées. */
export interface PersistResult {
  readonly inserted: number;
  readonly duplicates: number;
  readonly rejected: RejectedOffer[];
}

/**
 * Ce qu'il faut pour écrire une ligne `Job`. Assemblé par `prepareOffer` de
 * façon pure, sans accès à la base, puis écrit par `persistOffers`.
 */
interface JobDraft {
  readonly title: string;
  readonly normalizedTitle: string;
  readonly roleCategory: JobRoleCategory;
  readonly contractType: JobContract;
  readonly workMode: JobWorkMode;
  readonly description: string;
  readonly city: string;
  readonly departmentCode: IleDeFranceDepartment;
  readonly publishedAt: Date;
  readonly expiresAt: Date;
  readonly canonicalUrl: string;
  readonly applyUrl: string | null;
  readonly companyName: string;
  readonly companyNormalizedName: string;
  readonly confidenceScore: number;
  readonly dataQualityScore: number;
  readonly schoolRiskScore: number;
  readonly schoolRiskReasons: readonly string[];
}

const MS_PER_HOUR = 60 * 60 * 1000;

/**
 * Le travail par défaut, quand la source ne le précise pas. Une alternance qui
 * ne mentionne rien est présumée sur site, le cas le plus courant. C'est une
 * convention documentée, pas un fait inventé pour cette offre-là.
 */
const DEFAULT_WORK_MODE: JobWorkMode = "ONSITE";

/** Vrai quand la valeur est une URL http ou https. */
const isHttpUrl = (value: string): boolean => {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    // URL illisible : ce n'est pas une adresse http(s) valide.
    return false;
  }
};

/**
 * Nom d'entreprise réduit à une forme comparable. Identique à la normalisation
 * de `@findit/job-pipeline` : un même nom écrit différemment retombe sur la même
 * clé, et donc sur la même ligne `Company`.
 */
const normalizeName = (name: string): string =>
  name
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/\s+/gu, " ")
    .trim();

/**
 * Forme ISO acceptée pour une date de publication : `AAAA-MM-JJ`, avec une
 * heure facultative. L'extraction est consignée de produire cette forme ; tout
 * le reste est refusé plutôt qu'interprété.
 */
const ISO_DATE = /^\d{4}-\d{2}-\d{2}(?:[T ][\d:.]+(?:Z|[+-]\d{2}:?\d{2})?)?$/u;

/**
 * Lit la date de publication donnée par la source. Rend `null` quand elle est
 * absente ou illisible : `publishedAt` est NOT NULL et ne se devine jamais.
 *
 * Le POURQUOI de la forme stricte : `new Date` accepte à peu près tout, et le
 * fait à l'américaine. « 06/10/2026 », écrit par une source française, y devient
 * le 10 juin — une date plausible, donc invérifiable, qui ferait publier une
 * offre à la mauvaise date. Une forme non ISO est traitée comme illisible.
 */
const parsePublishedAt = (value: string | undefined): Date | null => {
  if (value === undefined || value.trim() === "") {
    return null;
  }
  const trimmed = value.trim();
  if (!ISO_DATE.test(trimmed)) {
    return null;
  }
  const date = new Date(trimmed);
  return Number.isNaN(date.getTime()) ? null : date;
};

/**
 * Complétude de l'offre sur 100 : un point par champ facultatif réellement
 * rempli. Description, salaire, libellé de contrat et technologies sont les
 * seuls champs facultatifs que l'extraction produit ; les autres sont déjà
 * exigés pour qu'une ligne `Job` existe.
 */
const dataQualityScore = (offer: JobOffer): number => {
  const filled = [
    (offer.description ?? "").trim() !== "",
    (offer.salary ?? "").trim() !== "",
    (offer.contractType ?? "").trim() !== "",
    offer.technologies.length > 0,
  ].filter(Boolean).length;

  return Math.round((filled / 4) * 100);
};

type PreparedOffer =
  { readonly ok: true; readonly draft: JobDraft } | { readonly ok: false; readonly reason: string };

/**
 * Transforme une offre extraite en brouillon publiable, ou dit pourquoi elle ne
 * l'est pas. Les portes s'enchaînent de la plus fréquente et la plus explicative
 * à la plus rare ; une offre écartée l'est pour une raison nommée, jamais pour
 * un cumul. Rien n'est inventé : un champ requis absent ou incohérent rejette
 * l'offre au lieu de la compléter avec une valeur fabriquée.
 */
const prepareOffer = (offer: JobOffer, now: Date): PreparedOffer => {
  if (offer.title.trim() === "") {
    return { ok: false, reason: "Le titre est vide." };
  }
  if (offer.company.trim() === "") {
    return { ok: false, reason: "L'entreprise est vide." };
  }
  if (!isHttpUrl(offer.sourceUrl)) {
    return { ok: false, reason: "L'URL source est absente ou invalide." };
  }
  if (!isHttpUrl(offer.applicationUrl)) {
    return { ok: false, reason: "L'URL de candidature est absente ou invalide." };
  }

  // École : le garde-fou déterministe de l'extraction est revérifié ici, et le
  // risque fin est mesuré par la classification. Une école ne doit jamais
  // paraître comme employeur, donc un signal d'exclusion rejette l'offre.
  const school = detectSchoolRisk({
    companyName: offer.company,
    title: offer.title,
    description: offer.description ?? "",
  });
  if (looksLikeSchool(offer) || school.excluded) {
    const detail =
      school.reasons.length > 0
        ? school.reasons.join(" ")
        : "Offre d'école ou d'organisme de formation.";
    /*
     * Le nom de l'employeur est dans le motif : les offres écartées ne sont pas
     * stockées, donc sans lui une école refusée ne laisse aucune trace qu'on
     * puisse relire (constat du 2026-10-07).
     */
    return {
      ok: false,
      reason: `École ou organisme de formation : « ${offer.company} » — ${detail}`,
    };
  }

  // Contrat et métier. Seule une offre acceptée est publiable : un contrat hors
  // périmètre, un métier illisible ou un conflit de signaux ne produit aucune
  // ligne `Job`.
  const classification = classifyJob({
    title: offer.title,
    commitmentLabel: offer.contractType ?? null,
  });
  if (
    classification.outcome !== "ACCEPTED" ||
    classification.contractType === null ||
    classification.roleCategory === null
  ) {
    return { ok: false, reason: classification.reasons.join(" ") };
  }

  // Localisation. Une offre hors Île-de-France viole la contrainte de contrôle
  // sur `Job.departmentCode` : elle est rejetée, jamais stockée ailleurs.
  const location = resolveLocation(offer.location ?? null);
  if (!location.inScope) {
    return { ok: false, reason: location.detail };
  }

  // Date. `publishedAt` ne se devine pas : absente, illisible, future ou déjà
  // expirée, l'offre n'est pas publiable.
  const publishedAt = parsePublishedAt(offer.publishedAt);
  if (publishedAt === null) {
    return { ok: false, reason: "La date de publication est absente ou illisible." };
  }
  if (publishedAt.getTime() > now.getTime()) {
    return { ok: false, reason: "La date de publication est dans le futur." };
  }
  const ageHours = (now.getTime() - publishedAt.getTime()) / MS_PER_HOUR;
  if (ageHours > EXTENDED_MAX_AGE_HOURS) {
    return {
      ok: false,
      reason: `Publiée il y a ${String(Math.round(ageHours))} h, au-delà des ${String(EXTENDED_MAX_AGE_HOURS)} h autorisées.`,
    };
  }

  const normalizedTitle = normalizeTitle(offer.title);
  if (normalizedTitle === "") {
    return {
      ok: false,
      reason: "Le titre ne porte aucune information exploitable après normalisation.",
    };
  }

  const applyUrl = offer.applicationUrl === offer.sourceUrl ? null : offer.applicationUrl;

  const draft: JobDraft = {
    title: offer.title,
    normalizedTitle,
    roleCategory: classification.roleCategory,
    contractType: classification.contractType,
    workMode: location.workMode ?? DEFAULT_WORK_MODE,
    description: offer.description ?? "",
    city: location.city,
    departmentCode: location.departmentCode,
    publishedAt,
    expiresAt: new Date(publishedAt.getTime() + EXTENDED_MAX_AGE_HOURS * MS_PER_HOUR),
    canonicalUrl: offer.sourceUrl,
    applyUrl,
    companyName: offer.company,
    companyNormalizedName: normalizeName(offer.company),
    confidenceScore: classification.confidence,
    dataQualityScore: dataQualityScore(offer),
    schoolRiskScore: school.riskScore,
    schoolRiskReasons: [...school.reasons],
  };

  return { ok: true, draft };
};

/** Rend un slug libre dans le lot courant, en suffixant au besoin. */
const uniqueSlug = (base: string, used: ReadonlySet<string>): string => {
  let candidate = base;
  let suffix = 2;
  while (used.has(candidate)) {
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }
  return candidate;
};

/**
 * Écrit les offres extraites en lignes `Job` publiées.
 *
 * Pour chaque offre : résolution ou création de l'entreprise par nom normalisé,
 * préparation du brouillon (classification, localisation, date), déduplication
 * par titre normalisé plus entreprise plus date, puis insertion. Une offre
 * rejetée l'est avec un motif français explicite ; un doublon est écarté sans
 * être réécrit.
 */
export const persistOffers = async (
  offers: readonly JobOffer[],
  deps: PersistDeps,
): Promise<PersistResult> => {
  const now = (deps.now ?? (() => new Date()))();

  const rejected: RejectedOffer[] = [];
  let inserted = 0;
  let duplicates = 0;

  // Mémorisation du lot : une même entreprise n'est résolue qu'une fois, et une
  // même clé de déduplication n'est traitée qu'une fois.
  const companies = new Map<string, string>();
  const seenDedupKeys = new Set<string>();
  const usedSlugs = new Set<string>();

  const resolveCompany = async (name: string, normalizedName: string): Promise<string> => {
    const cached = companies.get(normalizedName);
    if (cached !== undefined) {
      return cached;
    }

    // La clé d'entreprise est le nom normalisé, pas le slug : deux variantes
    // d'un même nom retombent sur la même ligne, sans fusion à l'aveugle.
    const found = await deps.prisma.company.findFirst({
      where: { normalizedName },
      select: { id: true },
    });
    if (found !== null) {
      companies.set(normalizedName, found.id);
      return found.id;
    }

    const slug = slugify(normalizedName) || "entreprise";
    const created = await deps.prisma.company.create({
      data: { slug, name, normalizedName },
      select: { id: true },
    });
    companies.set(normalizedName, created.id);
    return created.id;
  };

  for (const offer of offers) {
    const prepared = prepareOffer(offer, now);
    if (!prepared.ok) {
      rejected.push({ title: offer.title, reason: prepared.reason });
      continue;
    }

    const { draft } = prepared;
    const companyId = await resolveCompany(draft.companyName, draft.companyNormalizedName);

    const dedupKey = `${draft.normalizedTitle}\u0000${companyId}\u0000${draft.publishedAt.getTime()}`;
    if (seenDedupKeys.has(dedupKey)) {
      duplicates += 1;
      continue;
    }

    const existing = await deps.prisma.job.findFirst({
      where: {
        normalizedTitle: draft.normalizedTitle,
        companyId,
        publishedAt: draft.publishedAt,
      },
      select: { id: true },
    });
    if (existing !== null) {
      seenDedupKeys.add(dedupKey);
      duplicates += 1;
      continue;
    }
    seenDedupKeys.add(dedupKey);

    const slug = uniqueSlug(
      jobSlug(draft.normalizedTitle, draft.companyNormalizedName, draft.city, draft.publishedAt),
      usedSlugs,
    );
    usedSlugs.add(slug);

    await deps.prisma.job.create({
      data: {
        slug,
        title: draft.title,
        normalizedTitle: draft.normalizedTitle,
        roleCategory: draft.roleCategory,
        companyId,
        description: draft.description,
        responsibilities: [],
        requirements: [],
        benefits: [],
        contractType: draft.contractType,
        workMode: draft.workMode,
        city: draft.city,
        departmentCode: draft.departmentCode,
        publishedAt: draft.publishedAt,
        firstSeenAt: now,
        lastSeenAt: now,
        expiresAt: draft.expiresAt,
        canonicalUrl: draft.canonicalUrl,
        applyUrl: draft.applyUrl,
        schoolRiskScore: draft.schoolRiskScore,
        schoolRiskReasons: [...draft.schoolRiskReasons],
        fraudRiskScore: 0,
        fraudRiskReasons: [],
        dataQualityScore: draft.dataQualityScore,
        confidenceScore: draft.confidenceScore,
        status: "PUBLISHED",
      },
      select: { id: true },
    });
    inserted += 1;
  }

  return { inserted, duplicates, rejected };
};
