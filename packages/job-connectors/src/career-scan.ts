import { recognizeTarget } from "./discovery.js";

/**
 * Un ATS collectable trouvé dans une page carrière : de quoi enregistrer la
 * source pour l'entreprise déjà connue au registre.
 */
export interface CareerScanFinding {
  readonly connectorName: string;
  readonly atsIdentifier: string;
  /** Hôte de l'ATS - « boards.greenhouse.io », « x.wd3.myworkdayjobs.com ». */
  readonly atsHost: string;
  /** L'URL qui prouve la trouvaille, telle qu'écrite dans la page. */
  readonly evidenceUrl: string;
}

/** Les types d'ATS que `recognizeTarget` sait rendre, par connecteur. */
export const CAREER_SCAN_ATS: readonly string[] = ["greenhouse", "lever", "workday"];

/*
 * Les URLs sortent de la page par deux voies : les attributs (`href`, `src`,
 * `action`, iframes d'intégration) et les chaînes brutes des scripts - les
 * sites carrière modernes chargent leur board en JavaScript, l'URL de l'ATS
 * n'est alors visible que là.
 */
const URL_PATTERN = /https?:\/\/[a-z0-9.-]+\.[a-z]{2,}(?:\/[^\s"'<>\\)]*)?/giu;

/**
 * Greenhouse s'intègre aussi en iframe : `boards.greenhouse.io/embed/
 * job_board?for=jeton`. Le chemin `/embed/` est interdit par son robots.txt -
 * on ne le visite pas - mais le PARAMÈTRE nomme le jeton, et la collecte,
 * elle, passe par l'API de board autorisée. Lire un paramètre n'est pas
 * visiter un chemin.
 */
const GREENHOUSE_EMBED =
  /boards\.greenhouse\.io\/embed\/job_(?:board|app)\?[^"'\s<>]*for=([a-z0-9_-]+)/giu;

const dedupeKey = (finding: CareerScanFinding): string =>
  `${finding.connectorName}:${finding.atsIdentifier.toLowerCase()}`;

/**
 * Extrait d'une page carrière les ATS que Findit sait collecter.
 *
 * La page n'est PAS une source d'offres : elle n'est lue que pour trouver où
 * l'entreprise publie, et la collecte repart par le connecteur autorisé. Le
 * texte de la page n'est jamais conservé.
 */
export const extractAtsReferences = (html: string): readonly CareerScanFinding[] => {
  const findings = new Map<string, CareerScanFinding>();

  for (const match of html.matchAll(URL_PATTERN)) {
    const url = match[0];
    const recognized = recognizeTarget({ url, title: "", description: "", host: "" });

    if (recognized === null || recognized.kind !== "known") {
      continue;
    }

    const host = (() => {
      try {
        return new URL(url).host.toLowerCase();
      } catch {
        return null;
      }
    })();

    if (host === null) {
      continue;
    }

    const finding: CareerScanFinding = {
      connectorName: recognized.connectorName,
      atsIdentifier: recognized.target.atsIdentifier,
      atsHost: host,
      evidenceUrl: url,
    };
    findings.set(dedupeKey(finding), finding);
  }

  for (const match of html.matchAll(GREENHOUSE_EMBED)) {
    const token = match[1];
    if (token === undefined || token === "") {
      continue;
    }

    const finding: CareerScanFinding = {
      connectorName: "greenhouse",
      atsIdentifier: token,
      atsHost: "boards.greenhouse.io",
      evidenceUrl: match[0],
    };
    findings.set(dedupeKey(finding), finding);
  }

  return [...findings.values()];
};
