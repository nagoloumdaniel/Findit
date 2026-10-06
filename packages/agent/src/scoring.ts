import { normalizeText } from "./text.js";
import type { SourceResult } from "./types.js";

/** Seuil de conservation par défaut : une source sous 40 est écartée. */
export const DEFAULT_SCORE_THRESHOLD = 40;

/** Une source notée, avec le détail de la décision. */
export interface ScoredSource {
  readonly result: SourceResult;
  /** Score entier entre 0 et 100. */
  readonly score: number;
  /** Raisons en français qui expliquent le score. */
  readonly reasons: readonly string[];
  /** Vrai quand le score atteint le seuil : la source mérite d'être explorée. */
  readonly keep: boolean;
}

export interface ScoreSourcesOptions {
  /** Seuil de conservation, entre 0 et 100. Défaut : 40. */
  readonly threshold?: number;
}

const OFFER_TERMS: readonly string[] = [
  "offre",
  "emploi",
  "recrut",
  "poste",
  "job",
  "hiring",
  "career",
  "carriere",
  "vacanc",
];

const CONTRACT_TERMS: readonly string[] = ["alternance", "stage", "apprentissage", "internship"];

/**
 * Termes qui signalent une offre ou une liste de développement.
 *
 * Le POURQUOI : un job board généraliste liste tous les métiers. Une page qui
 * parle de développement a plus de chances de porter des offres du périmètre,
 * on la fait donc remonter avant les listes tous métiers.
 */
const DEV_SIGNALS: readonly string[] = [
  "developpeur",
  "developpeuse",
  "developpement",
  "software",
  "fullstack",
  "full-stack",
  "frontend",
  "front-end",
  "backend",
  "back-end",
  "web",
  "mobile",
  "devops",
  "data engineer",
  "data scientist",
  "typescript",
  "javascript",
  "react",
  "node",
  "python",
];

const LISTING_TERMS: readonly string[] = [
  "jobs",
  "careers",
  "offres",
  "recrutement",
  "nous rejoignons",
  "nous-rejoignons",
  "nous rejoindre",
  "vacancies",
  "positions",
  "talents",
  "nos offres",
];

/** Signaux d'un fichier structuré lisible sans crawler du HTML. */
const FEED_SIGNALS: readonly string[] = [".xml", "/feed", "/rss", "rss.xml", "atom.xml", ".json"];

/** Signaux d'une API, source lisible sans passer par un navigateur. */
const API_SIGNALS: readonly string[] = ["/api/", "/api", "graphql", "/rest"];

/** Suffixes d'hôtes d'ATS reconnus, hébergeant les offres à la source. */
const ATS_HOSTS: readonly string[] = [
  "greenhouse.io",
  "lever.co",
  "workable.com",
  "myworkdayjobs.com",
  "recruitee.com",
  "teamtailor.com",
  "ashbyhq.com",
  "welcomekit.co",
  "flatchr.io",
  "jobteaser.com",
];

/** Vrai quand le domaine appartient à un ATS connu, à la source des offres. */
export const isAtsHost = (domain: string): boolean =>
  ATS_HOSTS.some((suffix) => domain === suffix || domain.endsWith(`.${suffix}`));

/** Hôte d'une URL, ou chaîne vide si elle n'est pas analysable. */
const hostnameOf = (url: string): string => {
  try {
    return new URL(url).hostname;
  } catch {
    return "";
  }
};

/** Job boards connus, qui jouissent d'une réputation de base favorable. */
const JOB_BOARD_DOMAINS: readonly string[] = [
  "welcometothejungle.com",
  "hellowork.com",
  "indeed.com",
  "linkedin.com",
  "francetravail.fr",
];

/**
 * Signaux d'une page de résultats de moteur ou d'agrégateur. Ces pages listent
 * des offres sans en porter une seule : les crawler coûte cher et rend peu. Le
 * malus les fait passer derrière les pages d'offre, il ne les écarte pas.
 */
const SEARCH_PAGE_SIGNALS: readonly string[] = [
  "/q-",
  "srch_",
  "?q=",
  "search=",
  "/recherche",
  "/emploi-",
];

/** Nombre de segments de chemin non vides d'une URL, 0 si elle est illisible. */
const pathSegmentCount = (url: string): number => {
  try {
    return new URL(url).pathname.split("/").filter((segment) => segment !== "").length;
  } catch {
    return 0;
  }
};

/**
 * Vrai pour la racine d'un board d'ATS : `/acme`, `?board=…` — une **liste** de
 * toutes les offres d'une entreprise, pas une offre. Le POURQUOI : mesuré, une
 * telle page fait extraire tout le board (tous contrats confondus) alors que ses
 * liens mènent à des pages d'offre précises. L'agent la traverse pour trouver
 * les offres, mais ne la prend pas pour une offre.
 */
export const isAtsBoardListing = (url: string): boolean =>
  isAtsHost(hostnameOf(url)) && pathSegmentCount(url) < 2;

/** Signaux d'un organisme de formation ou d'une école, à écarter. */
const SCHOOL_SIGNALS: readonly string[] = [
  "ecole",
  "formation",
  "universite",
  "university",
  "campus",
  "bootcamp",
  "openclassrooms",
  "lewagon",
  "wildcodeschool",
  "epitech",
  "simplon",
  "lycee",
  "master",
  "licence",
  "ifp",
];

const containsAny = (haystack: string, needles: readonly string[]): boolean =>
  needles.some((needle) => haystack.includes(needle));

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

/**
 * Note un résultat de recherche.
 *
 * Le score additionne trois axes, puis applique la réputation en bonus ou en
 * malus. Le seuil de conservation s'applique en dehors de cette fonction, ce
 * qui laisse l'appelant décider du tri ou de l'écartement sans recalculer.
 */
const scoreSource = (result: SourceResult): Omit<ScoredSource, "keep"> => {
  const domain = normalizeText(result.domain);
  const url = result.url.toLowerCase();
  const haystack = normalizeText(`${result.title} ${result.description} ${result.url}`);
  const reasons: string[] = [];
  let score = 0;

  // 1. Pertinence : le vocabulaire d'une offre d'emploi.
  if (containsAny(haystack, OFFER_TERMS)) {
    score += 20;
    reasons.push("vocabulaire d'offre détecté");
  }
  if (containsAny(haystack, CONTRACT_TERMS)) {
    score += 20;
    reasons.push("contrat alternance ou stage détecté");
  }
  if (containsAny(haystack, DEV_SIGNALS)) {
    score += 15;
    reasons.push("vocabulaire de développement détecté");
  }

  // 2. Liste d'offres probable : ATS reconnu ou vocabulaire de listing.
  if (isAtsHost(domain)) {
    score += 30;
    reasons.push("domaine d'ATS reconnu");

    // Sur un ATS, la racine du board n'est qu'une liste ; une URL plus profonde
    // (identifiant d'offre, candidature) porte l'offre à la source, souvent
    // accompagnée de ses données structurées. C'est le meilleur rendement du
    // crawl, donc ce qui passe en premier.
    if (pathSegmentCount(result.url) >= 2) {
      score += 25;
      reasons.push("page d'offre individuelle probable");
    }
  } else if (containsAny(haystack, LISTING_TERMS)) {
    score += 20;
    reasons.push("page de liste d'offres probable");
  }

  // 3. API ou flux : une source lisible sans crawler du HTML.
  if (containsAny(url, FEED_SIGNALS)) {
    score += 20;
    reasons.push("flux ou fichier structuré détecté");
  } else if (containsAny(url, API_SIGNALS)) {
    score += 15;
    reasons.push("chemin d'API probable");
  }

  // 4. Réputation : bonus pour un job board connu, malus pour une école.
  if (JOB_BOARD_DOMAINS.some((d) => domain === d || domain.endsWith(`.${d}`))) {
    score += 10;
    reasons.push("job board connu");
  }
  if (containsAny(url, SEARCH_PAGE_SIGNALS)) {
    score -= 15;
    reasons.push("page de recherche agrégée probable");
  }
  if (containsAny(domain, SCHOOL_SIGNALS)) {
    score -= 50;
    reasons.push("organisme de formation ou école probable");
  }
  if (domain === "") {
    score -= 20;
    reasons.push("domaine manquant");
  }

  if (reasons.length === 0) {
    reasons.push("aucun signal pertinent");
  }

  return { result, score: clamp(score, 0, 100), reasons };
};

/**
 * Note une volée de résultats et les trie du meilleur au moins bon.
 *
 * Chaque source reçoit un score et un drapeau `keep` calculé contre le seuil.
 * Rien n'est jeté ici : l'appelant filtre avec `keep`, ce qui garde la trace
 * des sources écartées et de leur raison.
 */
export const scoreSources = (
  results: readonly SourceResult[],
  options: ScoreSourcesOptions = {},
): readonly ScoredSource[] => {
  const threshold = options.threshold ?? DEFAULT_SCORE_THRESHOLD;

  return results
    .map((result) => {
      const scored = scoreSource(result);
      return { ...scored, keep: scored.score >= threshold };
    })
    .sort((a, b) => b.score - a.score);
};
