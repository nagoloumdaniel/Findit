import type { CollectionTarget } from "./connector.js";
import { GREENHOUSE_CONNECTOR_NAME } from "./greenhouse.js";
import { LEVER_CONNECTOR_NAME } from "./lever.js";
import type { WebSearchResult } from "./web-search.js";

/**
 * Ce qu'une URL découverte désigne.
 *
 * `known` : une entreprise sur un ATS que Findit sait déjà collecter. La
 * découverte rend alors un jeton d'entreprise à un connecteur existant — la
 * collecte reste dans une source autorisée, et le résultat de recherche n'a
 * servi qu'à trouver le nom.
 *
 * `unknown` : un domaine que Findit ne sait pas encore lire. Il n'est pas
 * collecté ici — il relève du registre dynamique, qui exige de lire son
 * `robots.txt` avant toute visite. Le distinguer permet de ne pas le confondre
 * avec une source prête.
 */
export type DiscoveredTarget =
  | {
      readonly kind: "known";
      readonly connectorName: string;
      readonly target: CollectionTarget;
      readonly sourceUrl: string;
    }
  | {
      readonly kind: "unknown";
      readonly host: string;
      readonly sourceUrl: string;
    };

/**
 * Reconnaît une URL d'ATS et en extrait le jeton d'entreprise.
 *
 * Le jeton est le premier segment du chemin, lu par `URL` et non par une
 * expression régulière : c'est ce qui coupe proprement les paramètres. Une URL
 * comme `boards.greenhouse.io/sony?t=abc` rend « sony », pas « sony?t=abc ».
 */
const ATS_HOSTS: ReadonlyMap<string, string> = new Map([
  ["boards.greenhouse.io", GREENHOUSE_CONNECTOR_NAME],
  ["job-boards.greenhouse.io", GREENHOUSE_CONNECTOR_NAME],
  ["jobs.lever.co", LEVER_CONNECTOR_NAME],
]);

/**
 * Premiers segments qui ne sont pas des noms d'entreprise. `/embed/` est
 * d'ailleurs interdit par le `robots.txt` de Greenhouse : une URL qui commence
 * ainsi n'est pas une piste, c'est un cul-de-sac.
 */
const NON_COMPANY_SEGMENTS = new Set(["embed", "jobs", "job", "search", "api", "v1", "v0"]);

export const recognizeTarget = (result: WebSearchResult): DiscoveredTarget | null => {
  let parsed: URL;
  try {
    parsed = new URL(result.url);
  } catch {
    return null;
  }

  const host = parsed.host.toLowerCase();
  const connectorName = ATS_HOSTS.get(host);

  if (connectorName === undefined) {
    return { kind: "unknown", host, sourceUrl: result.url };
  }

  const token = parsed.pathname.split("/").filter((segment) => segment !== "")[0];
  if (token === undefined || NON_COMPANY_SEGMENTS.has(token.toLowerCase())) {
    // Un ATS reconnu mais sans jeton lisible : l'URL pointe la racine du réseau,
    // pas une entreprise. Rien à rendre à un connecteur.
    return null;
  }

  /*
   * L'identifiant d'entreprise est le jeton de l'ATS — « ivalua », « mirakllabs ».
   * Le nom d'affichage, lui, n'est pas fiable à ce stade : le titre du résultat
   * commence souvent par « Alternance » ou le métier, pas par l'entreprise. On
   * s'en tient donc au jeton, quitte à l'améliorer plus tard depuis la collecte.
   */
  const atsIdentifier = decodeURIComponent(token);

  return {
    kind: "known",
    connectorName,
    target: { atsIdentifier, companyName: atsIdentifier },
    sourceUrl: result.url,
  };
};

export interface DiscoveryOutcome {
  /** Entreprises reconnues sur un ATS collectable, chacune une seule fois. */
  readonly known: readonly {
    readonly connectorName: string;
    readonly target: CollectionTarget;
    readonly sourceUrls: readonly string[];
  }[];
  /** Domaines inconnus, chacun une fois, pour le registre dynamique. */
  readonly unknownHosts: readonly {
    readonly host: string;
    readonly sourceUrls: readonly string[];
  }[];
}

/**
 * Range une volée de résultats en cibles distinctes.
 *
 * La déduplication est le vrai travail : la même entreprise ressort de
 * plusieurs requêtes et de plusieurs offres. `ivalua` vu dix fois ne doit être
 * collecté qu'une fois — mais toutes les URLs qui l'ont fait découvrir sont
 * conservées, parce qu'elles sont la preuve de la découverte.
 */
export const collectDiscoveries = (results: readonly WebSearchResult[]): DiscoveryOutcome => {
  const known = new Map<
    string,
    { connectorName: string; target: CollectionTarget; sourceUrls: string[] }
  >();
  const unknown = new Map<string, { host: string; sourceUrls: string[] }>();

  for (const result of results) {
    const recognized = recognizeTarget(result);
    if (recognized === null) {
      continue;
    }

    if (recognized.kind === "known") {
      const key = `${recognized.connectorName}:${recognized.target.atsIdentifier.toLowerCase()}`;
      const existing = known.get(key);

      if (existing === undefined) {
        known.set(key, {
          connectorName: recognized.connectorName,
          target: recognized.target,
          sourceUrls: [recognized.sourceUrl],
        });
      } else if (!existing.sourceUrls.includes(recognized.sourceUrl)) {
        existing.sourceUrls.push(recognized.sourceUrl);
      }

      continue;
    }

    const existing = unknown.get(recognized.host);
    if (existing === undefined) {
      unknown.set(recognized.host, { host: recognized.host, sourceUrls: [recognized.sourceUrl] });
    } else if (!existing.sourceUrls.includes(recognized.sourceUrl)) {
      existing.sourceUrls.push(recognized.sourceUrl);
    }
  }

  return {
    known: [...known.values()],
    unknownHosts: [...unknown.values()],
  };
};
