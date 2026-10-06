import { z } from "zod";

import type { DeepSeekModel } from "@findit/ai";

import type { JobOfferLite, MatchResult, StructuredCv } from "./types.js";

/**
 * Rappel du caractère indicatif du score, accolé à toute recommandation.
 *
 * Le POURQUOI : un score produit par un LLM n'a aucune valeur contractuelle.
 * S'il était affiché sans ce rappel, il pourrait passer pour une décision de
 * l'employeur, ce que la section 4.11 du cahier des charges interdit.
 */
export const SCORE_INDICATIF = "Score indicatif : il ne remplace pas la décision d'un employeur.";

/**
 * Schéma de sortie exigé du modèle.
 *
 * Le POURQUOI : c'est ce schéma que `generateStructured` valide après coup, ce
 * qui borne le score entre 0 et 100 et garantit la présence de chaque champ.
 */
const MatchOutputSchema = z.object({
  score: z.number().min(0).max(100),
  relevance: z.string(),
  matchedSkills: z.array(z.string()),
  missingSkills: z.array(z.string()),
  strengths: z.array(z.string()),
  weaknesses: z.array(z.string()),
  recommendation: z.string(),
});

/** Sortie brute du modèle, avant le garde-fou anti-invention. */
type MatchOutput = z.infer<typeof MatchOutputSchema>;

/**
 * Consigne système.
 *
 * Le POURQUOI : la consigne demande explicitement de ne jamais inventer une
 * compétence et de citer textuellement le CV ou l'offre. Elle ne suffit pas à
 * elle seule, mais elle oriente le modèle avant qu'un filtrage déterministe ne
 * vérifie le résultat.
 */
const SYSTEM_PROMPT =
  "Tu compares un CV à une offre d'emploi. Rends un score de correspondance " +
  "entre 0 et 100 et une explication en français. Règles impératives : " +
  "n'invente jamais une compétence du CV ; toute technologie ou compétence citée " +
  "dans matchedSkills ou missingSkills doit venir textuellement du CV ou de " +
  "l'offre. Le score est indicatif, pas une décision d'employeur.";

/** Normalise une chaîne pour la comparer sans être gêné par la casse ni les espaces. */
const normalize = (value: string): string => value.toLowerCase().replace(/\s+/g, " ").trim();

/** Joint tous les champs textuels du CV en un seul bloc normalisé. */
const cvCorpus = (cv: StructuredCv): string =>
  normalize(
    [
      cv.identity,
      ...cv.experiences,
      ...cv.projects,
      ...cv.skills,
      ...cv.languages,
      ...cv.certifications,
    ].join(" "),
  );

/** Joint tous les champs textuels de l'offre en un seul bloc normalisé. */
const offerCorpus = (offer: JobOfferLite): string =>
  normalize(
    [offer.title, offer.description, ...offer.requiredSkills, offer.contract, offer.location].join(
      " ",
    ),
  );

/**
 * Vrai quand la compétence apparaît dans le CV ou dans l'offre.
 *
 * Le POURQUOI : on ne fait pas confiance au modèle. Toute compétence qu'il cite
 * sans qu'elle figure ni dans le CV ni dans l'offre est une invention, donc un
 * mensonge à écarter. Le contrôle est volontairement un test de sous-chaîne sur
 * du texte normalisé : un filet simple, pas un moteur de correspondance. Il
 * peut laisser passer une chaîne très courte noyée dans un autre mot ; c'est un
 * compromis assumé, le vrai garde-fou est de ne rien accepter d'inconnu.
 */
const isGrounded = (skill: string, cvText: string, offerText: string): boolean => {
  const needle = normalize(skill);
  return needle !== "" && (cvText.includes(needle) || offerText.includes(needle));
};

/** Ne garde que les compétences ancrées dans le CV ou l'offre. */
const keepGrounded = (skills: readonly string[], cvText: string, offerText: string): string[] =>
  skills.filter((skill) => isGrounded(skill, cvText, offerText));

/**
 * Applique le garde-fou anti-invention sur les listes de compétences.
 *
 * Le POURQUOI du choix "retirer plutôt que rejeter" : un score par ailleurs
 * honnête ne doit pas être jeté pour une compétence isolée glissée à tort. Les
 * compétences inventées, elles, ne survivent jamais à ce filtre.
 */
const sanitize = (output: MatchOutput, cv: StructuredCv, offer: JobOfferLite): MatchOutput => {
  const cvText = cvCorpus(cv);
  const offerText = offerCorpus(offer);
  return {
    ...output,
    matchedSkills: keepGrounded(output.matchedSkills, cvText, offerText),
    missingSkills: keepGrounded(output.missingSkills, cvText, offerText),
  };
};

/**
 * Vrai quand le CV contient au moins un élément à confronter à l'offre.
 *
 * Le POURQUOI : sans compétence, expérience, projet ni certification, le modèle
 * n'a rien à comparer et fabriquerait un score au hasard. On court-circuite
 * l'appel pour rendre un avertissement déterministe, pas un faux chiffre.
 */
const cvHasMatter = (cv: StructuredCv): boolean =>
  cv.skills.length > 0 ||
  cv.experiences.length > 0 ||
  cv.projects.length > 0 ||
  cv.certifications.length > 0;

/**
 * Vrai quand l'offre dit quelque chose du poste.
 *
 * Même POURQUOI que pour le CV : une offre sans description ni compétence
 * requise n'a pas de matière à noter.
 */
const offerHasMatter = (offer: JobOfferLite): boolean =>
  offer.description.trim() !== "" || offer.requiredSkills.length > 0;

/** Formate une liste en un bloc lisible, ou signale son absence. */
const formatList = (label: string, items: readonly string[]): string =>
  items.length === 0 ? `${label} : (aucun)` : `${label} :\n- ${items.join("\n- ")}`;

/** Construit le prompt utilisateur : les faits du CV et de l'offre, sans interprétation. */
const buildPrompt = (cv: StructuredCv, offer: JobOfferLite): string =>
  [
    "CV (faits structurés) :",
    `Identité : ${cv.identity === "" ? "(non renseignée)" : cv.identity}`,
    formatList("Expériences", cv.experiences),
    formatList("Projets", cv.projects),
    formatList("Compétences", cv.skills),
    formatList("Langues", cv.languages),
    formatList("Certifications", cv.certifications),
    "",
    "Offre :",
    `Titre : ${offer.title === "" ? "(non renseigné)" : offer.title}`,
    `Description : ${offer.description === "" ? "(non renseignée)" : offer.description}`,
    formatList("Compétences requises", offer.requiredSkills),
    `Contrat : ${offer.contract === "" ? "(non renseigné)" : offer.contract}`,
    `Localisation : ${offer.location === "" ? "(non renseignée)" : offer.location}`,
  ].join("\n");

/**
 * Score un CV contre une offre via le modèle DeepSeek.
 *
 * Le score rendu est indicatif : il ne décide rien à la place d'un employeur.
 * Deux garde-fous déterministes encadrent le modèle : un court-circuit quand le
 * CV ou l'offre n'a pas de matière, et un filtrage des compétences inventées.
 */
export const computeMatch = async (
  cv: StructuredCv,
  offer: JobOfferLite,
  model: DeepSeekModel,
): Promise<MatchResult> => {
  if (!cvHasMatter(cv) || !offerHasMatter(offer)) {
    return {
      score: 0,
      relevance: "Non évaluable",
      matchedSkills: [],
      missingSkills: [],
      strengths: [],
      weaknesses: [],
      recommendation: `Avertissement : le CV ou l'offre ne contient pas assez de matière pour un score fiable. ${SCORE_INDICATIF}`,
    };
  }

  const output = await model.generateStructured<MatchOutput>({
    schema: MatchOutputSchema,
    system: SYSTEM_PROMPT,
    prompt: buildPrompt(cv, offer),
  });

  const checked = sanitize(output, cv, offer);

  return {
    score: checked.score,
    relevance: checked.relevance,
    matchedSkills: checked.matchedSkills,
    missingSkills: checked.missingSkills,
    strengths: checked.strengths,
    weaknesses: checked.weaknesses,
    recommendation: `${checked.recommendation}\n\n${SCORE_INDICATIF}`,
  };
};
