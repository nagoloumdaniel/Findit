import type { JobRoleCategory } from "@findit/shared";

import { normalizeForMatching } from "./normalize.js";

export type RoleSignal = {
  readonly role: JobRoleCategory | null;
  readonly reason: string | null;
};

/*
 * L'ordre décide. « Senior Product Engineer - iOS/Swift » est un poste mobile
 * avant d'être un poste d'ingénierie logicielle : la catégorie la plus précise
 * doit être essayée la première, sinon la plus large l'avale.
 */
const ROLE_TOKENS: ReadonlyArray<readonly [JobRoleCategory, readonly string[]]> = [
  ["FULLSTACK", ["full stack", "fullstack", "full stack developer", "full stack engineer"]],
  ["MOBILE", ["mobile", "ios", "android", "react native", "flutter", "swift", "kotlin", "swiftui"]],
  ["DATA_ENGINEER", ["data engineer", "data engineering", "ingenieur data", "ingenieur donnees"]],
  ["DATA_ANALYST", ["data analyst", "analyste de donnees", "analyste data"]],
  [
    "FRONTEND",
    ["front end", "frontend", "react", "angular", "vue js", "vuejs", "svelte", "ui engineer"],
  ],
  [
    "BACKEND",
    [
      "back end",
      "backend",
      "node js",
      "nodejs",
      "nest js",
      "nestjs",
      "java",
      "python",
      "php",
      "symfony",
      "django",
      "spring",
      "rails",
      "golang",
      "net",
      "c#",
      "api engineer",
    ],
  ],
  [
    "SOFTWARE_ENGINEERING",
    [
      "software engineer",
      "software engineering",
      "software developer",
      "ingenieur logiciel",
      "product engineer",
      "swe",
    ],
  ],
  /*
   * Le filet du développement, et rien d'autre. Une offre qui ne nomme aucun
   * métier du périmètre n'atterrit pas ici : elle est rejetée. Ces mots-là
   * disent « développement » sans dire lequel.
   */
  ["OTHER_DEVELOPER", ["developpeur", "developpeuse", "developer", "programmeur", "web developer"]],
];

/*
 * Des titres où « developer » et « développeur » désignent un poste commercial :
 * un « business developer » vend, il ne programme pas (bug B009, constaté sur
 * des offres réelles de Welcome to the Jungle). Sans cette liste, le mot suffit
 * à ranger le poste parmi les développeurs.
 */
const COMMERCIAL_PHRASES: readonly string[] = [
  "business developer",
  "business development",
  "biz dev",
  "bizdev",
  "sales developer",
  "sales development",
  "developpeur commercial",
  "developpeuse commerciale",
  "developpeur d affaires",
  "developpeuse d affaires",
  "developpement commercial",
  "developpement d affaires",
];

/*
 * Un titre d'ingénierie qui cite le développement commercial comme domaine du
 * produit - « Software Engineer, Business Development Platform » - reste un
 * poste d'ingénierie. Seuls des mots qui nomment le métier d'ingénieur ou une
 * spécialité d'ingénierie le prouvent ; « mobile » ou « react » seuls ne le
 * prouvent pas, un commercial peut vendre du mobile.
 */
const ENGINEERING_MARKERS: readonly string[] = [
  "engineer",
  "ingenieur",
  "software",
  "full stack",
  "fullstack",
  "back end",
  "backend",
  "front end",
  "frontend",
  "devops",
];

/*
 * `normalizeForMatching` rend un texte encadré d'espaces et à espaces uniques.
 * Chercher « mot » entouré d'espaces suffit donc à trouver un mot entier, sans
 * expression régulière - et donc sans avoir à échapper « c++ » ou « c# », dont
 * les caractères sont des métacaractères de regex.
 */
const mentions = (haystack: string, needle: string): boolean => haystack.includes(` ${needle} `);

/**
 * Lit le métier d'un titre. Le titre seul, jamais la description : une offre de
 * marketing dont la description cite « notre stack React » n'est pas une offre
 * front-end.
 */
export const readRole = (title: string): RoleSignal => {
  const normalized = normalizeForMatching(title);

  const commercial = COMMERCIAL_PHRASES.some((phrase) => mentions(normalized, phrase));
  if (commercial && !ENGINEERING_MARKERS.some((marker) => mentions(normalized, marker))) {
    return { role: null, reason: null };
  }

  for (const [role, tokens] of ROLE_TOKENS) {
    const found = tokens.find((token) => mentions(normalized, token));
    if (found !== undefined) {
      return { role, reason: found };
    }
  }

  return { role: null, reason: null };
};
