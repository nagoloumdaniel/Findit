import type { PrismaClient } from "@findit/database";

import { decideCollectionAccess } from "./access-policy.js";
import type { AccessDecision } from "./access-policy.js";
import { FRANCE_TRAVAIL_CONNECTOR_NAME } from "./france-travail.js";
import { GREENHOUSE_CONNECTOR_NAME } from "./greenhouse.js";
import { HELLOWORK_CONNECTOR_NAME } from "./hellowork.js";
import { INDEED_CONNECTOR_NAME } from "./indeed.js";
import { LEVER_CONNECTOR_NAME } from "./lever.js";
import { loadRegistration } from "./registry.js";
import { WTTJ_CONNECTOR_NAME } from "./wttj.js";
import { WORKABLE_CONNECTOR_NAME } from "./workable.js";
import { WORKDAY_CONNECTOR_NAME } from "./workday.js";

/**
 * Porte d'accès des sources découvertes par l'agent.
 *
 * Le POURQUOI : le cycle natif ne collecte qu'une `CompanySource` reliée à un
 * `Connector` du registre, mais l'agent, lui, crawlait n'importe quel domaine
 * rendu par le moteur de recherche — dont LinkedIn et Glassdoor, qu'aucun
 * connecteur ne couvre. Le registre est la seule autorité (`docs/legal-compliance.md`
 * fait foi) ; cette porte le consulte avant chaque visite.
 *
 * La règle, décidée le 2026-10-06 :
 * - un **job board connu** doit avoir un connecteur au registre, actif, dont le
 *   régime autorise la collecte ; sans ligne, il est refusé ;
 * - un domaine inconnu (site carrière d'entreprise) reste gouverné par
 *   `robots.txt`, que le crawler respecte déjà.
 *
 * Limite connue : la liste des boards est bornée à ceux que le registre et
 * `docs/legal-compliance.md` nomment. Un agrégateur absent de ces deux sources
 * passe pour un site carrière — c'est un trou à combler, pas une autorisation.
 */

/**
 * Domaines connus, et le connecteur du registre qui les dessert. `null` : connu
 * comme job board, mais aucun connecteur ne le couvre — donc refusé.
 *
 * Les hôtes d'ATS y figurent aussi : fermer le connecteur `lever` au registre
 * doit fermer le crawl de `jobs.lever.co`, sans toucher au code.
 */
const BOARD_CONNECTOR_BY_DOMAIN: ReadonlyMap<string, string | null> = new Map([
  ["linkedin.com", null],
  ["glassdoor.fr", null],
  ["glassdoor.com", null],
  ["indeed.com", INDEED_CONNECTOR_NAME],
  ["hellowork.com", HELLOWORK_CONNECTOR_NAME],
  ["welcometothejungle.com", WTTJ_CONNECTOR_NAME],
  ["francetravail.fr", FRANCE_TRAVAIL_CONNECTOR_NAME],
  ["greenhouse.io", GREENHOUSE_CONNECTOR_NAME],
  ["lever.co", LEVER_CONNECTOR_NAME],
  ["workable.com", WORKABLE_CONNECTOR_NAME],
  ["myworkdayjobs.com", WORKDAY_CONNECTOR_NAME],
]);

export type SourceAccessRefusal = "NO_CONNECTOR" | "NO_REGISTRATION" | "COLLECTION_FORBIDDEN";

export interface SourceAccessVerdict {
  readonly allowed: boolean;
  /** Code stable : `CAREER_SITE`, `REGISTERED`, ou la raison du refus. */
  readonly reason: string;
  /** Phrase lisible, écrite dans le journal du run. */
  readonly detail: string;
}

/** Hôte d'une URL, sans `www.`, ou chaîne vide si elle est illisible. */
const hostOf = (url: string): string => {
  try {
    return new URL(url).hostname.replace(/^www\./u, "").toLowerCase();
  } catch {
    return "";
  }
};

/** Connecteur du registre pour cet hôte, `null` s'il n'y en a pas, `undefined` si inconnu. */
const connectorForHost = (host: string): string | null | undefined => {
  for (const [domain, connector] of BOARD_CONNECTOR_BY_DOMAIN) {
    if (host === domain || host.endsWith(`.${domain}`)) {
      return connector;
    }
  }
  return undefined;
};

/**
 * Décide si une URL découverte peut être visitée. Une décision par appel, sans
 * cache : la porte est peu appelée et la fraîcheur du registre compte plus que
 * l'économie d'une lecture.
 */
export const decideDiscoveredSourceAccess = async (
  prisma: PrismaClient,
  url: string,
  now: Date,
): Promise<SourceAccessVerdict> => {
  const host = hostOf(url);
  const connectorName = connectorForHost(host);

  if (connectorName === undefined) {
    return {
      allowed: true,
      reason: "CAREER_SITE",
      detail: `« ${host} » n'est pas un job board connu : robots.txt gouverne la visite.`,
    };
  }

  if (connectorName === null) {
    return {
      allowed: false,
      reason: "NO_CONNECTOR" satisfies SourceAccessRefusal,
      detail: `« ${host} » est un job board connu qu'aucun connecteur du registre ne dessert.`,
    };
  }

  const registration = await loadRegistration(prisma, connectorName);
  if (registration === null) {
    return {
      allowed: false,
      reason: "NO_REGISTRATION" satisfies SourceAccessRefusal,
      detail: `Le connecteur « ${connectorName} » n'a pas de ligne au registre.`,
    };
  }

  const decision: AccessDecision = decideCollectionAccess(connectorName, registration, now);
  if (!decision.allowed) {
    return {
      allowed: false,
      reason: "COLLECTION_FORBIDDEN" satisfies SourceAccessRefusal,
      detail: `« ${host} » : ${decision.detail}`,
    };
  }

  return {
    allowed: true,
    reason: "REGISTERED",
    detail: `« ${host} » est desservi par le connecteur ${connectorName} (${registration.accessStatus}).`,
  };
};
