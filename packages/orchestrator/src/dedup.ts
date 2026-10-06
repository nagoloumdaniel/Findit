import type { JobOffer } from "@findit/extract";

/**
 * Titre réduit à une forme comparable, pour détecter une même offre publiée
 * deux fois dans le run. On rabat casse, accents et espaces multiples : deux
 * variantes de la même offre retombent sur la même clé.
 */
export const normalizeTitle = (title: string): string =>
  title
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/\s+/gu, " ")
    .trim();

/** Vrai quand la valeur est une URL http ou https. */
export const isHttpUrl = (value: string): boolean => {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    // URL illisible : ce n'est pas une adresse http(s) valide.
    return false;
  }
};

/**
 * Une offre n'est retenue que si titre, entreprise et URL de candidature sont
 * tous présents. Un champ manquant abaisse la qualité : on l'écarte, on ne le
 * complète jamais avec une donnée inventée.
 */
export const isValidOffer = (offer: JobOffer): boolean =>
  offer.title.trim() !== "" && offer.company.trim() !== "" && isHttpUrl(offer.applicationUrl);
