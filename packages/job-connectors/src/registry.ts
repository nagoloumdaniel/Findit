import { AtsKind, ConnectorStatus, SourceAccessStatus, type PrismaClient } from "@findit/database";

import type { ConnectorRegistration } from "./access-policy.js";
import { FRANCE_TRAVAIL_CONNECTOR_NAME } from "./france-travail.js";
import { GREENHOUSE_CONNECTOR_NAME } from "./greenhouse.js";
import { HELLOWORK_CONNECTOR_NAME } from "./hellowork.js";
import { INDEED_CONNECTOR_NAME } from "./indeed.js";
import { LEVER_CONNECTOR_NAME } from "./lever.js";
import { LINKEDIN_CONNECTOR_NAME } from "./linkedin.js";
import { WORKABLE_CONNECTOR_NAME } from "./workable.js";
import { WORKDAY_CONNECTOR_NAME } from "./workday.js";
import { WTTJ_CONNECTOR_NAME } from "./wttj.js";

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
const VERIFIED_2026_10_06 = new Date("2026-10-06T00:00:00.000Z");

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
    name: WTTJ_CONNECTOR_NAME,
    atsKind: AtsKind.JOB_BOARD,
    accessStatus: SourceAccessStatus.OWNER_ACCEPTED_SCRAPING,
    status: ConnectorStatus.ACTIVE,
    termsCheckedAt: VERIFIED_2026_10_06,
    notes:
      "Acces TOLERE, non autorise : les conditions de Welcome to the Jungle interdisent la collecte automatisee, risque assume par le proprietaire (decision du 2026-10-05, compte Apify dedie confirme le 2026-10-06). Acteur Apify bebity/welcome-to-the-jungle-jobs-scraper, sans compte ni cookie, profession Tech, 30 resultats par run par defaut (plan gratuit), budget plafonne. Monte dans le cycle quotidien des sources scrapees, derriere l'interrupteur SCRAPED_SOURCES_ENABLED (eteint par defaut).",
  },
  {
    name: HELLOWORK_CONNECTOR_NAME,
    atsKind: AtsKind.JOB_BOARD,
    accessStatus: SourceAccessStatus.OWNER_ACCEPTED_SCRAPING,
    status: ConnectorStatus.ACTIVE,
    termsCheckedAt: VERIFIED_2026_10_06,
    notes:
      "Acces TOLERE, non autorise : les conditions de HelloWork interdisent la collecte automatisee, risque assume par le proprietaire (decision du 2026-10-05, compte Apify dedie confirme le 2026-10-06). Acteur Apify solidcode/hellowork-scraper, sans compte ni cookie, contrat alternance/stage et region Ile-de-France filtres cote acteur, 40 resultats par run par defaut (plan gratuit), budget plafonne. L'acteur garde la derniere page entiere quand elle depasse le plafond demande : la charge maximale couvre ce depassement (resultOvershoot 20). Monte dans le cycle quotidien des sources scrapees, derriere l'interrupteur SCRAPED_SOURCES_ENABLED (eteint par defaut).",
  },
  {
    name: INDEED_CONNECTOR_NAME,
    atsKind: AtsKind.JOB_BOARD,
    accessStatus: SourceAccessStatus.OWNER_ACCEPTED_SCRAPING,
    status: ConnectorStatus.ACTIVE,
    termsCheckedAt: VERIFIED_2026_10_06,
    notes:
      "Acces TOLERE, non autorise : les conditions d'Indeed interdisent la collecte automatisee, risque assume par le proprietaire (decision du 2026-10-05, compte Apify dedie confirme le 2026-10-06). Acteur Apify curious_coder/indeed-scraper, sans compte ni cookie, pages publiques du sous-domaine fr, mots-cles alternance developpeur - aucun filtre de contrat cote acteur, la classification Findit tranche, 100 resultats par run par defaut (plan gratuit), budget plafonne. Monte dans le cycle quotidien des sources scrapees, derriere l'interrupteur SCRAPED_SOURCES_ENABLED (eteint par defaut).",
  },
  {
    name: LINKEDIN_CONNECTOR_NAME,
    atsKind: AtsKind.JOB_BOARD,
    accessStatus: SourceAccessStatus.OWNER_ACCEPTED_SCRAPING,
    /*
     * DÉSACTIVÉ après mesure, décision du propriétaire le 2026-10-07.
     *
     * Le POURQUOI : deux runs réels bornés ont coûté 0,02810 $ pour **zéro offre
     * francilienne d'alternance**. L'acteur ignore la zone demandée — son `inputUrl`
     * portait bien `location=Île-de-France, France` et les 14/14 offres rendues
     * étaient en Bretagne (Brest, Guipavas, Plouzané) — et ne respecte pas non plus
     * le contrat. Le connecteur reste écrit et testé ; c'est son statut qui change.
     *
     * Le POURQUOI de le poser ICI et pas seulement en base : le report du registre
     * réécrit le statut depuis ce fichier, donc une simple resynchronisation
     * rallumerait la source et le cycle repartirait à 0,04 $/jour. Le verrou doit
     * vivre dans le code pour survivre à un `pnpm registry:sync`.
     */
    status: ConnectorStatus.DISABLED,
    termsCheckedAt: VERIFIED_2026_10_06,
    notes:
      "Acces TOLERE, non autorise : les conditions de LinkedIn interdisent la collecte automatisee, risque assume par le proprietaire (decision du 2026-10-05, compte Apify dedie confirme le 2026-10-06). Acteur Apify curious_coder/linkedin-jobs-scraper, page publique sans compte ni cookie (l'acteur avec compte est exclu), mots-cles alternance developpeur, splitByLocation desactive comme le registre l'impose, aucune donnee de recruteur stockee (jobPoster* ignores). LinkedIn ne filtre que 24 h / 7 jours / 30 jours : l'acteur est lance sur pastWeek, la fenetre de 3 jours est retablie par le connecteur a partir de postedAt. Deux runs reels le 2026-10-07 : 14 offres vues puis dataset vide, 0,02810 $ reels, 0 offre francilienne acceptee, l'acteur ignorant la zone demandee (14/14 en Bretagne). Bareme etabli au run (0,002 $ par resultat + 0,00005 $ de demarrage) et non plus estime. Statut DESACTIVE : ce n'est pas la source qui est refusee, c'est son rendement qui ne paie pas son cout. 20 resultats par run, plafond absolu 100, budget plafonne.",
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
