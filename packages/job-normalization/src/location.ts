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
// Les tirets longs de la classe [-–—:] sont des DONNÉES : les offres
// externes les écrivent, et cette regex sert justement à les éliminer. Rien de
// produit par Findit n'en contient.
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
 * étrangère sans son pays - « Paris, Texas » - passerait au travers. Le cas ne
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

/**
 * Département déduit d'un code postal français, par ses deux premiers chiffres.
 * Les huit départements d'Île-de-France y sont, et eux seuls : un code postal
 * hors zone prouve que l'offre est ailleurs, ce qui vaut mieux que « France ».
 */
const DEPARTMENT_BY_POSTAL_PREFIX: ReadonlyMap<string, IleDeFranceDepartment> = new Map([
  ["75", "75"],
  ["77", "77"],
  ["78", "78"],
  ["91", "91"],
  ["92", "92"],
  ["93", "93"],
  ["94", "94"],
  ["95", "95"],
]);

/** Un code postal français, isolé : cinq chiffres, rien de collé. */
const POSTAL_CODE = /\b\d{5}\b/u;

/** Le libellé débarrassé de son code postal, espaces normalisés. */
const withoutPostalCode = (part: string): string =>
  part.replace(POSTAL_CODE, " ").replace(/\s+/gu, " ").trim();

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
 * Le libellé est la seule information dont on dispose. La ville rendue est celle
 * que la source a écrite ; le département vient de la table officielle des
 * communes, ou des deux premiers chiffres d'un code postal quand la source en
 * porte un. Jamais d'une supposition.
 *
 * Un libellé peut porter plusieurs lieux - « Berlin, Berlin, Germany; Paris,
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
  let sawOutsideDepartment = false;

  // Le point-virgule sépare des lieux distincts ; la virgule, le tiret espacé et
  // les parenthèses précisent un même lieu. « Montrouge - 92 » écrit la commune
  // puis le département, et le tiret n'est pas un séparateur de communes.
  for (const segment of rest.split(";")) {
    const parts = segment
      .split(/[,()]|\s+[-–—]\s+/u)
      .map((part) => part.trim())
      .filter((part) => part !== "");

    if (parts.some((part) => FOREIGN_COUNTRIES.has(normalizeCommune(part)))) {
      continue;
    }

    for (const part of parts) {
      const key = normalizeCommune(part);

      /*
       * Certaines sources écrivent « 92000 Nanterre, France ». Le code postal
       * donne le département directement ; sans ce détour, la clé de commune
       * devient « 92000 nanterre », ne correspond à rien, et l'offre est refusée
       * comme trop vague alors que le département est explicite.
       */
      const postalCode = POSTAL_CODE.exec(part)?.[0] ?? null;
      if (postalCode !== null) {
        const department = DEPARTMENT_BY_POSTAL_PREFIX.get(postalCode.slice(0, 2));
        if (department !== undefined) {
          const city = withoutPostalCode(part);
          return {
            inScope: true,
            // La source n'a pas toujours écrit de commune : le code postal reste
            // alors le libellé, jamais une commune inventée.
            city: city === "" ? postalCode : city,
            departmentCode: department,
            workMode,
            evidence: segment.trim(),
          };
        }
        // Un code postal français hors des huit départements : la preuve que
        // l'offre est ailleurs, plus forte que le mot « France ».
        sawOutsideDepartment = true;
        continue;
      }

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

  if (sawOutsideDepartment) {
    return {
      inScope: false,
      reason: "OUTSIDE_ILE_DE_FRANCE",
      detail: `« ${label} » porte un code postal hors Île-de-France.`,
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
