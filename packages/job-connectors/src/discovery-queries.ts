import type { WebSearchQuery } from "./web-search.js";

/*
 * Requêtes de découverte.
 *
 * Le test réel du 2026-07-17 a tranché : une requête libre remonte les
 * agrégateurs fermés — Indeed, Welcome to the Jungle — que Findit ne peut pas
 * collecter. Une requête `site:` sur un ATS autorisé remonte, elle, les
 * entreprises de cet ATS qui publient ce qu'on cherche. La découverte ne
 * ratisse donc pas le web au hasard : elle interroge les ATS qu'on sait déjà
 * lire, pour savoir quelles entreprises y regarder.
 */
const AUTHORIZED_ATS_SITES = [
  "boards.greenhouse.io",
  "job-boards.greenhouse.io",
  "jobs.lever.co",
] as const;

/** Intitulés de métier, en français et en anglais, tels que les titres réels les écrivent. */
const ROLE_TERMS = [
  "développeur",
  "developer",
  "software engineer",
  "front-end",
  "back-end",
  "full-stack",
] as const;

/** Ce qui restreint à l'alternance. Le stage est hors du flux par défaut. */
const CONTRACT_TERMS = ["alternance", "apprentissage", "apprentice"] as const;

/**
 * Croise ATS × métier × contrat en requêtes `site:`. Le pays et la langue sont
 * ceux du périmètre. Le résultat est déterministe : mêmes entrées, mêmes
 * requêtes, dans le même ordre — ce qui rend une rotation ou un plafond
 * reproductibles.
 */
export const buildDiscoveryQueries = (resultsPerQuery = 15): readonly WebSearchQuery[] => {
  const queries: WebSearchQuery[] = [];

  for (const site of AUTHORIZED_ATS_SITES) {
    for (const role of ROLE_TERMS) {
      for (const contract of CONTRACT_TERMS) {
        queries.push({
          query: `site:${site} ${contract} ${role} Paris`,
          country: "fr",
          language: "fr",
          count: resultsPerQuery,
        });
      }
    }
  }

  return queries;
};
