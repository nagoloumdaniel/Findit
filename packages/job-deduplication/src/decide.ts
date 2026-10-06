import type { ComparableOffer, Similarity } from "./similarity.js";
import { scoreSimilarity } from "./similarity.js";

/**
 * Ce qu'on fait de deux offres comparées.
 *
 * `MERGE` : c'est la même publication, à fusionner. `DISTINCT` : deux offres
 * différentes. `REVIEW` : le doute n'est pas tranché - mieux vaut ne pas
 * fusionner à tort ni séparer à tort, et laisser un contrôle décider.
 */
export type DuplicateAction = "MERGE" | "REVIEW" | "DISTINCT";

export interface DuplicateDecision {
  readonly action: DuplicateAction;
  readonly similarity: Similarity;
}

/*
 * Deux seuils, et une zone de doute entre les deux. Fusionner à tort mêle deux
 * offres réelles ; séparer à tort en montre une deux fois. Le doute penche donc
 * vers `REVIEW`, jamais vers une décision silencieuse.
 */
const MERGE_THRESHOLD = 0.85;
const DISTINCT_THRESHOLD = 0.6;

/*
 * En deçà, les noms d'entreprise n'ont pas assez en commun : ce sont deux
 * entreprises, pas deux libellés d'une même. Les variantes d'un même nom -
 * « Acme », « Acme France » - restent au-dessus. À 0,3 le seuil laissait passer
 * deux noms qui ne partagent qu'un mot sur trois (bug B010) ; à 0,5 ils sont
 * séparés, et les variantes (un nom contenu dans l'autre, 0,85) passent.
 */
const COMPANY_MIN = 0.5;

/**
 * Décide si deux offres sont la même publication. La décision porte son score
 * et son détail, pour rester réversible et justifiable.
 *
 * Un garde-fou tenu avant tout calcul : deux offres de départements différents
 * ne sont jamais la même - le périmètre étant l'Île-de-France, une même
 * publication n'y a qu'un lieu.
 */
export const decideDuplicate = (a: ComparableOffer, b: ComparableOffer): DuplicateDecision => {
  const similarity = scoreSimilarity(a, b);

  // Deux garde-fous durs : ni deux départements, ni deux entreprises n'ont beau
  // se ressembler par ailleurs, ne sont jamais la même publication.
  if (similarity.breakdown.location === 0 || similarity.breakdown.company < COMPANY_MIN) {
    return { action: "DISTINCT", similarity };
  }

  if (similarity.score >= MERGE_THRESHOLD) {
    return { action: "MERGE", similarity };
  }

  if (similarity.score < DISTINCT_THRESHOLD) {
    return { action: "DISTINCT", similarity };
  }

  return { action: "REVIEW", similarity };
};

/**
 * Cherche, parmi des offres déjà connues, celle qui correspond le mieux à une
 * candidate. Rend la meilleure correspondance si elle atteint au moins le seuil
 * de doute, accompagnée de sa décision - sinon `null`, l'offre est nouvelle.
 *
 * Comparer une candidate à un lot borné (même titre normalisé, par exemple) est
 * le travail de l'appelant : cette fonction tranche, elle ne présélectionne pas.
 */
export const findBestMatch = <T extends ComparableOffer>(
  candidate: ComparableOffer,
  existing: readonly T[],
): { match: T; decision: DuplicateDecision } | null => {
  let best: { match: T; decision: DuplicateDecision } | null = null;

  for (const offer of existing) {
    const decision = decideDuplicate(candidate, offer);
    if (decision.action === "DISTINCT") {
      continue;
    }

    if (best === null || decision.similarity.score > best.decision.similarity.score) {
      best = { match: offer, decision };
    }
  }

  return best;
};
