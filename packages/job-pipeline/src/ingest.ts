import { classifyJob, detectSchoolRisk } from "@findit/job-classification";
import {
  extractSections,
  htmlToBlocks,
  htmlToText,
  normalizeTitle,
  resolveLocation,
} from "@findit/job-normalization";
import type {
  IleDeFranceDepartment,
  JobContract,
  JobRoleCategory,
  JobWorkMode,
} from "@findit/shared";
import { EXTENDED_MAX_AGE_HOURS } from "@findit/shared";

/**
 * Une offre telle qu'un connecteur l'a rendue, plus ce que la source sait
 * d'elle par ailleurs : le nom de l'entreprise (connu de la cible de collecte)
 * et le libellé de contrat que certaines sources portent à côté du titre.
 */
export interface CollectedOffer {
  readonly sourceJobId: string;
  readonly url: string;
  readonly title: string;
  readonly locationLabel: string | null;
  readonly descriptionHtml: string | null;
  readonly publishedAt: Date | null;
  readonly companyName: string;
  /** `categories.commitment` chez Lever. `null` ailleurs. */
  readonly commitmentLabel: string | null;
  /** Nom du connecteur d'origine : « greenhouse », « lever »… */
  readonly sourceName: string;
}

/**
 * Ce qu'il faut pour écrire une ligne `Job`. Assemblé ici, écrit ailleurs :
 * l'assemblage est pur et vérifiable sans base, la persistance est une étape à
 * part. `companyId` n'y est pas — il est résolu au moment de l'écriture.
 */
export interface JobDraft {
  readonly title: string;
  readonly normalizedTitle: string;
  readonly roleCategory: JobRoleCategory;
  readonly contractType: JobContract;
  readonly workMode: JobWorkMode;
  readonly description: string;
  readonly responsibilities: readonly string[];
  readonly requirements: readonly string[];
  readonly benefits: readonly string[];
  readonly city: string;
  readonly departmentCode: IleDeFranceDepartment;
  readonly publishedAt: Date;
  readonly expiresAt: Date;
  readonly canonicalUrl: string;
  readonly externalId: string;
  readonly companyName: string;
  readonly sourceName: string;
  /** Confiance sur 100, celle de la classification. */
  readonly confidenceScore: number;
  /** Complétude sur 100 : combien des champs facultatifs sont réellement remplis. */
  readonly dataQualityScore: number;
  /** Risque d'école sur 100, mesuré par la détection. */
  readonly schoolRiskScore: number;
  readonly schoolRiskReasons: readonly string[];
  /** `PUBLISHED` pour une offre acceptée, `QUARANTINED` pour une offre en doute. */
  readonly status: "PUBLISHED" | "QUARANTINED";
}

export type IngestionDecision =
  | {
      readonly outcome: "ACCEPTED" | "QUARANTINED";
      readonly draft: JobDraft;
      readonly reasons: readonly string[];
    }
  | {
      readonly outcome: "REJECTED";
      /** Étape qui a écarté l'offre : sert de `stage` dans `ProcessingLog`. */
      readonly stage: string;
      readonly reasons: readonly string[];
    };

const MS_PER_HOUR = 60 * 60 * 1000;

/**
 * Le travail par défaut, quand la source ne le dit pas. Une alternance qui ne
 * précise rien est présumée sur site — c'est le cas le plus courant, et c'est
 * une convention documentée, pas un fait inventé sur cette offre-là.
 */
const DEFAULT_WORK_MODE: JobWorkMode = "ONSITE";

/** Complétude : un point par champ facultatif réellement présent, sur 100. */
const qualityScore = (parts: {
  description: string;
  responsibilities: readonly string[];
  requirements: readonly string[];
  benefits: readonly string[];
  workModeKnown: boolean;
  dateKnown: boolean;
}): number => {
  const filled = [
    parts.description.length > 0,
    parts.responsibilities.length > 0,
    parts.requirements.length > 0,
    parts.benefits.length > 0,
    parts.workModeKnown,
    parts.dateKnown,
  ].filter(Boolean).length;

  return Math.round((filled / 6) * 100);
};

/**
 * Décide du sort d'une offre collectée, et prépare son écriture si elle est
 * retenue.
 *
 * Les portes s'appliquent dans un ordre pensé pour la trace : la plus fréquente
 * et la plus explicative d'abord. Une offre écartée l'est pour **une** raison
 * nommée, pas pour un cumul.
 *
 * Un principe tenu du modèle de données : une ligne `Job` ne peut pas exister
 * sans métier, sans contrat, sans département d'Île-de-France et sans date. Une
 * offre à qui l'un de ces éléments manque est donc **rejetée**, pas mise en
 * quarantaine — la quarantaine suppose une offre complète mais douteuse.
 */
export const decideIngestion = (offer: CollectedOffer, now: Date): IngestionDecision => {
  // 1. Contrat et métier. C'est la porte qui écarte le plus.
  const classification = classifyJob({
    title: offer.title,
    commitmentLabel: offer.commitmentLabel,
  });

  if (
    classification.outcome === "REJECTED" ||
    classification.contractType === null ||
    classification.roleCategory === null
  ) {
    // Une offre acceptée ou en quarantaine porte toujours un contrat et un
    // métier ; ce garde-fou rétrécit le type et pare l'imprévu.
    return { outcome: "REJECTED", stage: "classification", reasons: classification.reasons };
  }

  // 2. Localisation. Sans département d'Île-de-France déterminable, l'offre
  //    n'est pas stockable : une contrainte de contrôle l'exige.
  const location = resolveLocation(offer.locationLabel);
  if (!location.inScope) {
    return { outcome: "REJECTED", stage: "localisation", reasons: [location.detail] };
  }

  // 3. Fraîcheur. Une date absente rend l'offre non stockable — `publishedAt`
  //    est NOT NULL — donc rejetée, et non mise en quarantaine.
  if (offer.publishedAt === null) {
    return {
      outcome: "REJECTED",
      stage: "fraîcheur",
      reasons: ["La source ne donne aucune date de publication fiable."],
    };
  }

  const ageHours = (now.getTime() - offer.publishedAt.getTime()) / MS_PER_HOUR;
  if (ageHours > EXTENDED_MAX_AGE_HOURS) {
    return {
      outcome: "REJECTED",
      stage: "fraîcheur",
      reasons: [
        `Publiée il y a ${String(Math.round(ageHours))} h, au-delà des ${String(EXTENDED_MAX_AGE_HOURS)} h autorisées.`,
      ],
    };
  }

  // L'offre est stockable. On assemble le texte et les sections.
  const blocks = offer.descriptionHtml === null ? [] : htmlToBlocks(offer.descriptionHtml);
  const description = htmlToText(offer.descriptionHtml ?? "");
  const sections = extractSections(blocks);

  // 4. École. Une école ne doit jamais paraître comme employeur : un risque
  //    élevé écarte l'offre, un risque incertain la met en quarantaine.
  const school = detectSchoolRisk({
    companyName: offer.companyName,
    title: offer.title,
    description,
  });

  if (school.excluded) {
    return { outcome: "REJECTED", stage: "école", reasons: school.reasons };
  }

  const workModeKnown = location.workMode !== null;
  const quarantined = classification.outcome === "QUARANTINED" || school.riskScore >= 40;

  const draft: JobDraft = {
    title: offer.title,
    normalizedTitle: normalizeTitle(offer.title),
    roleCategory: classification.roleCategory,
    contractType: classification.contractType,
    workMode: location.workMode ?? DEFAULT_WORK_MODE,
    description,
    responsibilities: sections.responsibilities,
    requirements: sections.requirements,
    benefits: sections.benefits,
    city: location.city,
    departmentCode: location.departmentCode,
    publishedAt: offer.publishedAt,
    expiresAt: new Date(offer.publishedAt.getTime() + EXTENDED_MAX_AGE_HOURS * MS_PER_HOUR),
    canonicalUrl: offer.url,
    externalId: offer.sourceJobId,
    companyName: offer.companyName,
    sourceName: offer.sourceName,
    confidenceScore: classification.confidence,
    dataQualityScore: qualityScore({
      description,
      responsibilities: sections.responsibilities,
      requirements: sections.requirements,
      benefits: sections.benefits,
      workModeKnown,
      dateKnown: true,
    }),
    schoolRiskScore: school.riskScore,
    schoolRiskReasons: [...school.reasons],
    status: quarantined ? "QUARANTINED" : "PUBLISHED",
  };

  return {
    outcome: quarantined ? "QUARANTINED" : "ACCEPTED",
    draft,
    reasons: [...classification.reasons, ...(school.riskScore >= 40 ? school.reasons : [])],
  };
};
