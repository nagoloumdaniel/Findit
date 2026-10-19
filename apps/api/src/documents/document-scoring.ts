import type { CvDocumentData } from "@findit/documents";
import { computeMatch, detectSkillsInText, type MatchResult } from "@findit/matching-engine";

/**
 * Offre sous la forme attendue par le moteur de scoring déterministe. Elle est
 * distincte de `JobOfferLite` (matching LLM) : ici l'intitulé normalisé et la
 * catégorie de métier nourrissent l'alignement du titre.
 */
export type ScoredJob = {
  title: string;
  normalizedTitle: string;
  roleCategory: string;
  requirements: string[];
  responsibilities: string[];
  description: string;
};

/**
 * Score d'un CV généré contre une offre, déterministe et explicable.
 *
 * Le POURQUOI : le score de document mesure la couverture des exigences de
 * l'offre par le CV réellement généré. C'est un score distinct du score de
 * profil : il évalue le document produit, pas les capacités du candidat. Il
 * réutilise `@findit/matching-engine`, donc chaque point vient d'une
 * correspondance constatée et citée dans le détail, sans appel IA ni coût.
 *
 * Les compétences des expériences et des projets comptent comme des compétences
 * « prouvées par l'usage », ce qui les valorise sans rien inventer : elles
 * viennent du CV lui-même.
 */
export const scoreCvDocument = (cv: CvDocumentData, job: ScoredJob): MatchResult => {
  const sectionSkills = cv.skills.map((skill) => skill.name);
  const evidenceSkills = [
    ...cv.experiences.flatMap((experience) => experience.skills),
    ...cv.projects.flatMap((project) => project.skills),
  ];
  const titles = [
    cv.identity?.title ?? "",
    ...cv.experiences.map((experience) => experience.title ?? ""),
  ].filter((title) => title.trim() !== "");
  const languages = cv.languages.map((language) => ({
    name: language.name,
    level: language.level,
  }));

  return computeMatch(
    { sectionSkills, evidenceSkills, titles, languages },
    {
      title: job.title,
      normalizedTitle: job.normalizedTitle,
      roleCategory: job.roleCategory,
      requirements: job.requirements,
      responsibilities: job.responsibilities,
      description: job.description,
    },
  );
};

/**
 * Score d'une lettre contre une offre, déterministe et limité.
 *
 * Le POURQUOI : la lettre est générée anti-invention (aucune compétence inventée
 * ne survit à la génération), donc son score se concentre sur ce qui reste
 * mesurable sans IA : l'adéquation, c'est-à-dire la part des compétences exigées
 * par l'offre que la lettre cite réellement. La qualité rédactionnelle et la
 * cohérence narrative restent hors de ce score : ce n'est pas un jugement de
 * style, seulement une couverture constatée et citée.
 */
export type LetterScore = {
  /// Part des compétences de l'offre citées par la lettre, entre 0 et 100.
  score: number;
  offerSkills: string[];
  matchedSkills: string[];
  missingSkills: string[];
};

export const scoreLetterDocument = (letterText: string, job: ScoredJob): LetterScore => {
  // L'adéquation porte sur tout ce que l'offre nomme : exigences, missions et
  // description. Une lettre qui reprend les termes de l'offre est plus adaptée.
  const offer = detectSkillsInText(
    [job.title, ...job.requirements, ...job.responsibilities, job.description].join("\n"),
  );
  const letter = detectSkillsInText(letterText);
  const letterIds = new Set(letter.map((entry) => entry.id));

  const matched = offer.filter((entry) => letterIds.has(entry.id));
  const missing = offer.filter((entry) => !letterIds.has(entry.id));
  const score = offer.length === 0 ? 0 : Math.round((matched.length / offer.length) * 100);

  return {
    score,
    offerSkills: offer.map((entry) => entry.label),
    matchedSkills: matched.map((entry) => entry.label),
    missingSkills: missing.map((entry) => entry.label),
  };
};
