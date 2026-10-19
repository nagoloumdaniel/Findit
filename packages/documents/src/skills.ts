import type { CvSkill } from "./cv-data.js";

/** Ordre et libellés d'affichage des catégories de compétences. */
const SKILL_GROUPS: { category: string; label: string }[] = [
  { category: "programming_language", label: "Langages" },
  { category: "framework", label: "Frameworks" },
  { category: "database", label: "Bases de données" },
  { category: "cloud_tool", label: "Cloud & DevOps" },
  { category: "dev_tool", label: "Outils" },
  { category: "soft_skill", label: "Savoir-être" },
  { category: "language", label: "Langues" },
  { category: "other", label: "Autres" },
];

export type SkillGroup = {
  category: string;
  label: string;
  names: string[];
};

/*
 * Groupé par catégorie quand l'extraction en fournit, sinon null pour signaler
 * qu'une ligne simple suffit : on affiche la structure disponible, on n'en
 * fabrique pas. Les compétences sans catégorie connue partent dans « Divers ».
 */
export const groupSkills = (skills: CvSkill[]): SkillGroup[] | null => {
  const categorized = skills.filter((skill) => skill.category !== undefined);
  if (categorized.length < skills.length / 2) {
    return null;
  }

  const groups = SKILL_GROUPS.map((group) => ({
    ...group,
    names: skills
      .filter((skill) => skill.category === group.category)
      .map((skill) => skill.name),
  })).filter((group) => group.names.length > 0);

  const leftovers = skills
    .filter(
      (skill) =>
        skill.category === undefined ||
        !SKILL_GROUPS.some((group) => group.category === skill.category),
    )
    .map((skill) => skill.name);

  if (leftovers.length > 0) {
    groups.push({ category: "other", label: "Divers", names: leftovers });
  }

  return groups;
};
