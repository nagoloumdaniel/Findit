import type { CvDocumentData } from "@findit/documents";
import { computeMatch, type MatchResult } from "@findit/matching-engine";

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
