import type { IleDeFranceDepartment, JobWorkMode } from "@findit/shared";

import { ILE_DE_FRANCE_COMMUNES } from "./ile-de-france-communes.js";

export type LocationRefusal =
  "NO_LOCATION" | "OUTSIDE_ILE_DE_FRANCE" | "AMBIGUOUS_COMMUNE" | "TOO_VAGUE";

export type LocationResolution =
  | {
      readonly inScope: true;
      /** La ville telle que la source l'a écrite, jamais réécrite. */
      readonly city: string;
      readonly departmentCode: IleDeFranceDepartment;
      readonly workMode: JobWorkMode | null;
      /** Le fragment du libellé qui a emporté la décision. */
      readonly evidence: string;
    }
  | {
      readonly inScope: false;
      readonly reason: LocationRefusal;
      readonly detail: string;
      readonly workMode: JobWorkMode | null;
    };

/**
 * Doit rester identique à `normalize` dans `generate-communes.mjs` : les clés de
 * la table sont produites par cette forme exactement.
 */
const normalizeCommune = (name: string): string =>
  name
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/['’]/gu, " ")
    .replace(/[^a-z0-9]+/gu, " ")
    .trim();

/**
 * Le mode de travail est souvent collé devant la localisation : « Hybrid -
 * London », « Remote - United States ». C'est une information réelle de la
 * source, pas une déduction.
 */
const WORK_MODE_PREFIX =
  /^(hybrid|hybride|remote|télétravail|teletravail|on-?site|présentiel|presentiel)\s*[-–—:]\s*/iu;

const WORK_MODES: ReadonlyMap<string, JobWorkMode> = new Map([
  ["hybrid", "HYBRID"],
  ["hybride", "HYBRID"],
  ["remote", "REMOTE"],
  ["télétravail", "REMOTE"],
  ["teletravail", "REMOTE"],
  ["onsite", "ONSITE"],
  ["on-site", "ONSITE"],
  ["présentiel", "ONSITE"],
  ["presentiel", "ONSITE"],
]);

/**
 * Pays étrangers nommés dans les libellés réels, plus les plus courants. Un
 * segment qui nomme un pays autre que la France ne parle pas d'Île-de-France,
 * même s'il contient par ailleurs un nom de commune française.
 *
 * Ce garde-fou a une limite connue : un libellé qui nomme une subdivision
 * étrangère sans son pays — « Paris, Texas » — passerait au travers. Le cas ne
 * s'est pas présenté sur les 348 offres relevées, et exiger « France » dans le
 * libellé rejetterait « Paris » seul, que les sources écrivent réellement.
 */
const FOREIGN_COUNTRIES = new Set([
  "germany",
  "deutschland",
  "allemagne",
  "united states",
  "usa",
  "us",
  "united kingdom",
  "uk",
  "england",
  "scotland",
  "ireland",
  "italy",
  "italia",
  "italie",
  "spain",
  "espana",
  "espagne",
  "portugal",
  "netherlands",
  "nederland",
  "belgium",
  "belgique",
  "switzerland",
  "suisse",
  "austria",
  "poland",
  "polska",
  "sweden",
  "sverige",
  "norway",
  "denmark",
  "finland",
  "canada",
  "australia",
  "japan",
  "korea",
  "south korea",
  "china",
  "india",
  "singapore",
  "brazil",
  "brasil",
  "mexico",
  "argentina",
  "israel",
  "turkey",
  "greece",
  "czechia",
  "romania",
  "hungary",
]);

/** Un pays ou une région qui dit « France » sans dire où. */
const VAGUE_FRENCH = new Set([
  "france",
  "ile de france",
  "idf",
  "region parisienne",
  "iles de france",
]);

const stripWorkMode = (label: string): { rest: string; workMode: JobWorkMode | null } => {
  const match = WORK_MODE_PREFIX.exec(label);
  if (match === null) {
    return { rest: label, workMode: null };
  }

  const keyword = (match[1] ?? "").toLowerCase();
  return { rest: label.slice(match[0].length), workMode: WORK_MODES.get(keyword) ?? null };
};

/**
 * Range un libellé de localisation dans le périmètre, ou dit pourquoi il n'y
 * entre pas.
 *
 * Le libellé est la seule information dont on dispose : aucune des offres
 * relevées ne porte de code postal. La ville rendue est celle que la source a
 * écrite ; le département vient de la table officielle des communes, jamais
 * d'une supposition.
 *
 * Un libellé peut porter plusieurs lieux — « Berlin, Berlin, Germany; Paris,
 * Paris, France » existe réellement. Il suffit qu'un seul soit en
 * Île-de-France : l'offre y est ouverte.
 */
export const resolveLocation = (label: string | null): LocationResolution => {
  if (label === null || label.trim() === "") {
    return {
      inScope: false,
      reason: "NO_LOCATION",
      detail: "La source n'indique aucune localisation.",
      workMode: null,
    };
  }

  const { rest, workMode } = stripWorkMode(label.trim());

  let sawVagueFrance = false;
  let sawAmbiguousCommune: string | null = null;

  // Le point-virgule sépare des lieux distincts, la virgule les précise.
  for (const segment of rest.split(";")) {
    const parts = segment
      .split(",")
      .map((part) => part.trim())
      .filter((part) => part !== "");

    if (parts.some((part) => FOREIGN_COUNTRIES.has(normalizeCommune(part)))) {
      continue;
    }

    for (const part of parts) {
      const key = normalizeCommune(part);

      if (VAGUE_FRENCH.has(key)) {
        sawVagueFrance = true;
        continue;
      }

      const department = ILE_DE_FRANCE_COMMUNES.get(key);
      if (department === undefined) {
        continue;
      }

      if (department === "AMBIGUOUS") {
        // Deux communes d'Île-de-France portent ce nom. Trancher reviendrait à
        // inventer le département.
        sawAmbiguousCommune = part;
        continue;
      }

      return {
        inScope: true,
        city: part,
        departmentCode: department,
        workMode,
        evidence: segment.trim(),
      };
    }
  }

  if (sawAmbiguousCommune !== null) {
    return {
      inScope: false,
      reason: "AMBIGUOUS_COMMUNE",
      detail: `« ${sawAmbiguousCommune} » est le nom de deux communes d'Île-de-France : le libellé ne dit pas laquelle.`,
      workMode,
    };
  }

  if (sawVagueFrance) {
    return {
      inScope: false,
      reason: "TOO_VAGUE",
      detail: `« ${label} » situe l'offre en France sans dire où : aucun département n'en découle.`,
      workMode,
    };
  }

  return {
    inScope: false,
    reason: "OUTSIDE_ILE_DE_FRANCE",
    detail: `« ${label} » ne désigne aucune commune d'Île-de-France.`,
    workMode,
  };
};
