import { AtsKind, ConnectorStatus, SourceAccessStatus, type PrismaClient } from "@findit/database";

import type { ConnectorRegistration } from "./access-policy.js";
import { FRANCE_TRAVAIL_CONNECTOR_NAME } from "./france-travail.js";
import { GREENHOUSE_CONNECTOR_NAME } from "./greenhouse.js";
import { LEVER_CONNECTOR_NAME } from "./lever.js";
import { WORKABLE_CONNECTOR_NAME } from "./workable.js";
import { WORKDAY_CONNECTOR_NAME } from "./workday.js";

/**
 * Une ligne du registre, telle que docs/legal-compliance.md l'a établie.
 *
 * Ce tableau est la transcription du document ; la base en est le report, et le
 * garde-fou ne lit que la base. Une source absente d'ici n'a aucune ligne, donc
 * aucun connecteur ne peut s'exécuter pour elle.
 */
export interface ConnectorRegistryEntry {
  readonly name: string;
  readonly atsKind: AtsKind;
  readonly accessStatus: SourceAccessStatus;
  readonly status: ConnectorStatus;
  /** `null` tant qu'aucune vérification réelle n'a eu lieu. */
  readonly termsCheckedAt: Date | null;
  readonly notes: string;
}

/** Dates des vérifications consignées dans le registre. */
const VERIFIED_2026_07_17 = new Date("2026-07-17T00:00:00.000Z");
const VERIFIED_2026_07_26 = new Date("2026-07-26T00:00:00.000Z");

export const CONNECTOR_REGISTRY_ENTRIES: readonly ConnectorRegistryEntry[] = [
  {
    name: GREENHOUSE_CONNECTOR_NAME,
    atsKind: AtsKind.GREENHOUSE,
    accessStatus: SourceAccessStatus.PUBLIC_FEED,
    status: ConnectorStatus.ACTIVE,
    termsCheckedAt: VERIFIED_2026_07_17,
    notes: "Flux public. robots.txt n'interdit que /embed/, hors du chemin des offres.",
  },
  {
    name: LEVER_CONNECTOR_NAME,
    atsKind: AtsKind.LEVER,
    accessStatus: SourceAccessStatus.PUBLIC_FEED,
    status: ConnectorStatus.ACTIVE,
    termsCheckedAt: VERIFIED_2026_07_17,
    notes:
      "Flux public. Crawl-delay: 1 imposé par la source. Content signal : search=yes, ai-train=no.",
  },
  {
    name: WORKABLE_CONNECTOR_NAME,
    atsKind: AtsKind.WORKABLE,
    accessStatus: SourceAccessStatus.PUBLIC_FEED,
    status: ConnectorStatus.ACTIVE,
    termsCheckedAt: VERIFIED_2026_07_17,
    notes:
      "Flux public. robots.txt n'interdit rien. Content signal : search=yes, ai-input=yes, ai-train=no.",
  },
  {
    name: "smartrecruiters-www",
    atsKind: AtsKind.SMARTRECRUITERS,
    accessStatus: SourceAccessStatus.DISABLED_PENDING_PERMISSION,
    status: ConnectorStatus.DISABLED_PENDING_PERMISSION,
    termsCheckedAt: VERIFIED_2026_07_17,
    notes: "Pages publiques permises sauf 73 entreprises nommées. Voie non empruntée à ce jour.",
  },
  {
    name: "ashby",
    atsKind: AtsKind.ASHBY,
    accessStatus: SourceAccessStatus.DISABLED_PENDING_PERMISSION,
    status: ConnectorStatus.DISABLED_PENDING_PERMISSION,
    termsCheckedAt: VERIFIED_2026_07_17,
    notes: "L'API répond 200 sans authentification, mais robots.txt renvoie Unauthorized.",
  },
  {
    name: "smartrecruiters",
    atsKind: AtsKind.SMARTRECRUITERS,
    accessStatus: SourceAccessStatus.DISABLED_PENDING_PERMISSION,
    status: ConnectorStatus.DISABLED_PENDING_PERMISSION,
    termsCheckedAt: VERIFIED_2026_07_17,
    notes: "robots.txt n'ouvre /v1/companies/ qu'à LinkedInBot et interdit tout à User-agent: *.",
  },
  {
    name: "teamtailor",
    atsKind: AtsKind.TEAMTAILOR,
    accessStatus: SourceAccessStatus.DISABLED_PENDING_PERMISSION,
    status: ConnectorStatus.DISABLED_PENDING_PERMISSION,
    termsCheckedAt: null,
    notes: "Aucun accès contrôlé à ce jour.",
  },
  {
    name: "recruitee",
    atsKind: AtsKind.RECRUITEE,
    accessStatus: SourceAccessStatus.DISABLED_PENDING_PERMISSION,
    status: ConnectorStatus.DISABLED_PENDING_PERMISSION,
    termsCheckedAt: null,
    notes: "Aucun accès contrôlé à ce jour.",
  },
  {
    name: FRANCE_TRAVAIL_CONNECTOR_NAME,
    atsKind: AtsKind.FRANCE_TRAVAIL,
    accessStatus: SourceAccessStatus.OFFICIAL_API,
    status: ConnectorStatus.ACTIVE,
    termsCheckedAt: VERIFIED_2026_07_26,
    notes:
      "API officielle de l'Etat (francetravail.io), inscription gratuite, jeton OAuth. Ne tourne que si les identifiants partenaires sont configurés.",
  },
  {
    name: WORKDAY_CONNECTOR_NAME,
    atsKind: AtsKind.WORKDAY,
    accessStatus: SourceAccessStatus.AUTHORIZED_CRAWL,
    status: ConnectorStatus.ACTIVE,
    termsCheckedAt: VERIFIED_2026_07_26,
    notes:
      "robots.txt des locataires releve le 2026-07-26 : User-agent * avec Allow sur les sites carriere. Le connecteur relit le robots.txt de CHAQUE locataire avant CHAQUE collecte et refuse sans Allow explicite.",
  },
  {
    name: "successfactors",
    atsKind: AtsKind.SAP_SUCCESSFACTORS,
    accessStatus: SourceAccessStatus.DISABLED_PENDING_PERMISSION,
    status: ConnectorStatus.DISABLED_PENDING_PERMISSION,
    termsCheckedAt: VERIFIED_2026_07_26,
    notes:
      "Verifie le 2026-07-26 : aucun flux JSON public stable, chaque locataire differe (jobs.sap.com n'interdit que candidature et services). Un connecteur exigerait une verification par locataire, non faite.",
  },
  {
    name: "linkedin",
    atsKind: AtsKind.OTHER,
    accessStatus: SourceAccessStatus.DISABLED_PENDING_PERMISSION,
    status: ConnectorStatus.DISABLED_PENDING_PERMISSION,
    termsCheckedAt: VERIFIED_2026_07_17,
    notes: "Aucun accès public autorisé pour cet usage.",
  },
  {
    name: "indeed",
    atsKind: AtsKind.OTHER,
    accessStatus: SourceAccessStatus.DISABLED_PENDING_PERMISSION,
    status: ConnectorStatus.DISABLED_PENDING_PERMISSION,
    termsCheckedAt: VERIFIED_2026_07_17,
    notes: "Aucun accès public autorisé pour cet usage.",
  },
  {
    name: "glassdoor",
    atsKind: AtsKind.OTHER,
    accessStatus: SourceAccessStatus.DISABLED_PENDING_PERMISSION,
    status: ConnectorStatus.DISABLED_PENDING_PERMISSION,
    termsCheckedAt: VERIFIED_2026_07_17,
    notes: "Aucun accès public autorisé pour cet usage.",
  },
  {
    name: "welcome-to-the-jungle",
    atsKind: AtsKind.WELCOMEKIT,
    accessStatus: SourceAccessStatus.DISABLED_PENDING_PERMISSION,
    status: ConnectorStatus.DISABLED_PENDING_PERMISSION,
    termsCheckedAt: VERIFIED_2026_07_17,
    notes: "Aucun accès public autorisé pour cet usage.",
  },
];

/**
 * Reporte le registre en base. L'opération est rejouable : elle met à jour les
 * lignes existantes plutôt que de les dupliquer, et ne touche à aucune
 * exécution passée.
 */
export const syncConnectorRegistry = async (prisma: PrismaClient): Promise<number> => {
  for (const entry of CONNECTOR_REGISTRY_ENTRIES) {
    const row = {
      atsKind: entry.atsKind,
      accessStatus: entry.accessStatus,
      status: entry.status,
      termsCheckedAt: entry.termsCheckedAt,
      notes: entry.notes,
    };

    await prisma.connector.upsert({
      where: { name: entry.name },
      create: { name: entry.name, ...row },
      update: row,
    });
  }

  return CONNECTOR_REGISTRY_ENTRIES.length;
};

/**
 * Lit ce que la base dit d'un connecteur. Rend `null` si la source n'a pas de
 * ligne : sans ligne, rien n'autorise l'exécution.
 */
export const loadRegistration = async (
  prisma: PrismaClient,
  connectorName: string,
): Promise<ConnectorRegistration | null> =>
  prisma.connector.findUnique({
    where: { name: connectorName },
    select: { name: true, accessStatus: true, status: true, termsCheckedAt: true },
  });
