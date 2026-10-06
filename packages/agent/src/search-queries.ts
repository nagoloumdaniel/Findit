import { normalizeText } from "./text.js";
import type { GeneratedSearchQuery } from "./types.js";

/** Moteur de recherche par défaut pour toutes les requêtes produites. */
const DEFAULT_ENGINE = "brave";

/** Termes qui désignent une alternance ou une formation en alternance. */
const ALTERNANCE_TERMS: readonly string[] = [
  "alternance",
  "apprentissage",
  "contrat d'apprentissage",
  "contrat de professionnalisation",
];

/** Termes qui désignent un stage. */
const STAGE_TERMS: readonly string[] = ["stage", "internship"];

/**
 * Technologies de développement reconnues dans un objectif.
 *
 * La liste est volontairement bornée : elle ne remplace pas un LLM, elle couvre
 * les termes les plus fréquents d'un objectif de collecte d'offres de
 * développement. Les formes sont canoniques (une seule orthographe par
 * technologie) pour que la détection ne produise pas de quasi-doublons.
 */
const TECHNOLOGY_TERMS: readonly string[] = [
  "fullstack",
  "next.js",
  "typescript",
  "javascript",
  "react",
  "angular",
  "vue",
  "svelte",
  "node",
  "express",
  "nest",
  "python",
  "django",
  "flask",
  "java",
  "kotlin",
  "spring",
  "php",
  "laravel",
  "symfony",
  "ruby",
  "rails",
  "golang",
  "rust",
  "sql",
  "postgresql",
  "mysql",
  "mongodb",
  "redis",
  "aws",
  "azure",
  "docker",
  "kubernetes",
  "devops",
  "mobile",
  "ios",
  "android",
  "frontend",
  "backend",
  "web",
];

/**
 * Localisations reconnues, pour produire une variante géographique. L'ordre
 * importe : les formes les plus spécifiques viennent d'abord, et la première
 * rencontrée dans l'objectif est retenue.
 */ const LOCATION_TERMS: readonly string[] = [
  "ile-de-france",
  "ile de france",
  "paris",
  "lyon",
  "marseille",
  "bordeaux",
  "nantes",
  "lille",
  "toulouse",
  "rennes",
  "strasbourg",
  "montpellier",
  "nice",
  "grenoble",
  "teletravail",
  "remote",
];

/**
 * Termes qui désignent un métier du développement.
 *
 * Le POURQUOI : sans eux, un objectif qui dit « développeur » sans citer de
 * technologie produit des requêtes génériques ; le moteur rend alors des job
 * boards généralistes dont les listes mélangent tous les métiers, et l'agent
 * extrait des offres hors périmètre (pâtisserie, presse, vente).
 */
const ROLE_TERMS: readonly string[] = [
  "développeur",
  "développeuse",
  "software engineer",
  "software developer",
  "ingénieur logiciel",
  "fullstack",
  "frontend",
  "backend",
  "web",
  "mobile",
  "devops",
  "sre",
];

/** Métiers visés quand l'objectif ne nomme aucun rôle explicite. */
const DEFAULT_ROLES: readonly string[] = ["développeur", "développeur web"];

/**
 * Domaines de pages carrière et d'ATS de confiance, ciblés par un `site:`.
 * Ces domaines hébergent les offres à la source, ce qui évite de repasser par
 * un agrégateur intermédiaire au moment de crawler.
 */
const SITE_TARGETS: readonly string[] = [
  "boards.greenhouse.io",
  "jobs.lever.co",
  "apply.workable.com",
  "jobs.ashbyhq.com",
  "jobs.teamtailor.com",
  "welcometothejungle.com",
  "hellowork.com",
  "francetravail.fr",
];

/** Les deux contrats du périmètre, couverts quand l'objectif n'en précise pas. */
const CONTRACTS = ["alternance", "stage"] as const;

const detectContracts = (normalized: string): readonly ("alternance" | "stage")[] => {
  const contracts: ("alternance" | "stage")[] = [];
  if (ALTERNANCE_TERMS.some((term) => normalized.includes(term))) {
    contracts.push("alternance");
  }
  if (STAGE_TERMS.some((term) => normalized.includes(term))) {
    contracts.push("stage");
  }
  return contracts;
};

/**
 * Détecte les technologies présentes dans l'objectif.
 *
 * Un terme qui n'est qu'une sous-chaîne d'un autre terme déjà détecté est
 * retiré : « javascript » rend « java » redondant, pas l'inverse. Cela évite
 * de produire une requête parasite pour une technologie qui n'a pas été citée.
 */
const detectTechnologies = (normalized: string): readonly string[] => {
  const found = TECHNOLOGY_TERMS.filter((term) => normalized.includes(term));
  return found.filter((term) => !found.some((other) => other !== term && other.includes(term)));
};

const detectLocation = (normalized: string): string | null => {
  const matches = LOCATION_TERMS.filter((term) => normalized.includes(term));
  return matches[0] ?? null;
};

/** Détecte les rôles de développement cités dans l'objectif. */
const detectRoles = (normalized: string): readonly string[] =>
  ROLE_TERMS.filter((term) => normalized.includes(normalizeText(term)));

/**
 * Génère les requêtes de recherche d'un objectif, sans appel de modèle.
 *
 * L'idée est de couvrir les quatre axes que l'Agent Search doit explorer : le
 * contrat (alternance/stage), la technologie, la localisation et les sites de
 * confiance (via `site:`). Chaque requête est déduite de l'objectif, donc le
 * résultat est le même pour un objectif donné : c'est ce qui rend le
 * comportement vérifiable et reproductible.
 */
export const generateSearchQueries = (objective: string): readonly GeneratedSearchQuery[] => {
  const cleaned = objective.trim();
  if (cleaned === "") {
    return [];
  }

  const normalized = normalizeText(cleaned);
  const contracts = detectContracts(normalized);
  // Sans contrat explicite, on couvre les deux contrats du périmètre.
  const contractVariants: readonly ("alternance" | "stage")[] =
    contracts.length > 0 ? contracts : CONTRACTS;
  const technologies = detectTechnologies(normalized);
  const roles = detectRoles(normalized);
  // Sans rôle cité, on vise les métiers du périmètre plutôt que rien du tout.
  const roleVariants = roles.length > 0 ? roles : DEFAULT_ROLES;
  const location = detectLocation(normalized);

  const queries: GeneratedSearchQuery[] = [];
  const seen = new Set<string>();
  const primary: string[] = [];
  const secondary: string[] = [];

  const add = (target: string[], query: string): void => {
    const trimmed = query.trim().replace(/\s+/gu, " ");
    const key = normalizeText(trimmed);
    if (key === "" || seen.has(key)) {
      return;
    }
    seen.add(key);
    target.push(trimmed);
  };

  // 1. L'objectif tel quel : le moteur sait le reformuler, et on ne perd rien.
  const first = cleaned.trim().replace(/\s+/gu, " ");
  seen.add(normalizeText(first));
  queries.push({ query: first, engine: DEFAULT_ENGINE });

  const firstTarget = technologies[0] ?? roleVariants[0] ?? "";

  // 2. Les pages de source d'abord, une par couple contrat × domaine de
  // confiance : c'est là que vivent les offres, à la source, alors qu'une liste
  // d'agrégateur coûte cher à crawler et rend peu.
  //
  // Le contrat est entre guillemets : mesuré contre Brave sur jobs.lever.co, la
  // même requête sans guillemets ne ramenait qu'un titre du périmètre sur dix,
  // contre six avec. La phrase exacte écarte les pages qui ne font que citer le
  // mot au passage.
  for (const contract of contractVariants) {
    for (const domain of SITE_TARGETS) {
      add(primary, `${firstTarget} "${contract}" site:${domain}`);
    }
  }

  // 3. Puis la découverte large : contrat absent, métier, lieu, technologie.
  if (contracts.length === 0) {
    add(secondary, `${cleaned} alternance`);
    add(secondary, `${cleaned} stage`);
  }

  // Un métier du périmètre, croisé avec le contrat et le lieu : c'est ce qui
  // cible les pages d'offres du périmètre, plutôt qu'une liste tous métiers.
  for (const contract of contractVariants) {
    for (const role of roleVariants.slice(0, 2)) {
      add(secondary, `offre ${role} ${contract}${location === null ? "" : ` ${location}`}`);
    }
  }

  // Le contrat rapproché du lieu, pour les recherches géographiques.
  if (location !== null) {
    for (const contract of contractVariants) {
      add(secondary, `${contract} ${location}`);
    }
  }

  // Une variante par technologie, croisée avec le contrat et le lieu.
  for (const contract of contractVariants) {
    for (const technology of technologies) {
      add(secondary, `${technology} ${contract}${location === null ? "" : ` ${location}`}`);
    }
  }

  // 4. Une requête de source pour une requête large : quand `maxQueries` tronque
  //    la liste, les deux natures de requête survivent au lieu de sacrifier les
  //    sources, qui sont justement celles qui rendent des offres.
  const depth = Math.max(primary.length, secondary.length);
  for (let index = 0; index < depth; index += 1) {
    const sourceQuery = primary[index];
    if (sourceQuery !== undefined) {
      queries.push({ query: sourceQuery, engine: DEFAULT_ENGINE });
    }
    const broadQuery = secondary[index];
    if (broadQuery !== undefined) {
      queries.push({ query: broadQuery, engine: DEFAULT_ENGINE });
    }
  }

  return queries;
};

/**
 * Contrat que doit respecter tout générateur de requêtes.
 *
 * La version déterministe ci-dessus suffit à faire tourner la recherche seule.
 * Le générateur DeepSeek, en cours de construction, implémentera la même
 * interface : le reste de l'agent n'aura rien à changer pour en profiter.
 */
export interface SearchQueryGenerator {
  generate(objective: string): readonly GeneratedSearchQuery[];
}

/** Le générateur par défaut, purement déterministe. */
export const deterministicSearchQueryGenerator: SearchQueryGenerator = {
  generate: generateSearchQueries,
};
