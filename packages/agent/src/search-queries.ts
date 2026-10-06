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
 */
const LOCATION_TERMS: readonly string[] = [
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
  const location = detectLocation(normalized);

  const queries: GeneratedSearchQuery[] = [];
  const push = (query: string): void => {
    const trimmed = query.trim().replace(/\s+/gu, " ");
    const key = normalizeText(trimmed);
    if (key === "") {
      return;
    }
    if (queries.some((existing) => normalizeText(existing.query) === key)) {
      return;
    }
    queries.push({ query: trimmed, engine: DEFAULT_ENGINE });
  };

  // 1. L'objectif tel quel : le moteur sait le reformuler, et on ne perd rien.
  push(cleaned);

  // 2. Contrat absent de l'objectif : on ajoute une variante par contrat.
  if (contracts.length === 0) {
    push(`${cleaned} alternance`);
    push(`${cleaned} stage`);
  }

  // 3. Une variante par technologie, croisée avec le contrat et le lieu.
  for (const contract of contractVariants) {
    for (const technology of technologies) {
      push(`${technology} ${contract}${location === null ? "" : ` ${location}`}`);
    }
  }

  // 4. Le contrat rapproché du lieu, pour les recherches géographiques.
  if (location !== null) {
    for (const contract of contractVariants) {
      push(`${contract} ${location}`);
    }
  }

  // 5. `site:` sur les domaines de confiance, borné à la première techno.
  const firstTechnology = technologies[0] ?? "";
  for (const contract of contractVariants) {
    for (const domain of SITE_TARGETS) {
      push(`${firstTechnology} ${contract} site:${domain}`);
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
