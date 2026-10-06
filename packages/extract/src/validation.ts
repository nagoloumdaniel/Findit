import type { JobOffer } from "./schema.js";

/**
 * Nombre de critères remplis exigé pour qu'une offre soit conservée. Les trois
 * critères (titre, entreprise, URL) sont obligatoires : une offre qui en rate
 * un seul est incomplète et doit être signalée, pas complétée.
 */
export const MIN_VALIDATION_SCORE = 3;

/** Le détail du score d'une offre. */
export interface ValidationScore {
  readonly score: number;
  readonly reasons: readonly string[];
}

/** Vrai quand la valeur est une URL http ou https. */
const isHttpUrl = (value: string): boolean => {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
};

/**
 * Score de validation simple, sans LLM : titre présent, entreprise présente,
 * URL de candidature valide.
 *
 * Un champ manquant abaisse le score au lieu d'être comblé : on signale
 * l'incomplétude dans `reasons`, on n'invente jamais la donnée qui manque.
 */
export const scoreValidation = (offer: JobOffer): ValidationScore => {
  const reasons: string[] = [];
  let score = 0;

  if (offer.title.trim() !== "") {
    score += 1;
  } else {
    reasons.push("titre absent");
  }

  if (offer.company.trim() !== "") {
    score += 1;
  } else {
    reasons.push("entreprise absente");
  }

  if (isHttpUrl(offer.applicationUrl)) {
    score += 1;
  } else {
    reasons.push("URL de candidature invalide");
  }

  return { score, reasons };
};
