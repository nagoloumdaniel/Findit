import { SourceAccessStatus } from "@findit/database";
import type { AtsKind, PrismaClient } from "@findit/database";

/**
 * Une entreprise trouvée par la découverte, prête à être surveillée.
 *
 * L'identifiant est le jeton de l'ATS ; le connecteur est celui qui saura la
 * collecter. C'est tout ce dont un cycle a besoin pour recollecter cette
 * entreprise sans repasser par le moteur de recherche.
 */
export interface DiscoveredSource {
  readonly connectorName: string;
  readonly atsKind: AtsKind;
  readonly atsIdentifier: string;
  /** Hôte de l'ATS où vit le board : « boards.greenhouse.io ». */
  readonly atsHost: string;
}

/** Une source prête à collecter : ce qu'un cycle rend à l'orchestrateur. */
export interface CollectableSource {
  readonly connectorName: string;
  readonly atsIdentifier: string;
  readonly companyName: string;
}

const slugify = (text: string): string =>
  text
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-+|-+$/gu, "");

/**
 * Enregistre une entreprise découverte, ou met à jour ce qu'on savait d'elle.
 *
 * L'opération est idempotente : la même entreprise redécouverte à chaque cycle
 * ne crée pas de doublon. Le nom conservé est le jeton de l'ATS — le seul
 * identifiant fiable à ce stade ; un vrai nom d'affichage viendra de la
 * collecte.
 *
 * La `Company` et sa `CompanySource` ne sont écrites que si le connecteur
 * existe au registre : une source qu'aucun connecteur autorisé ne dessert n'a
 * rien à faire ici.
 */
export const registerDiscoveredSource = async (
  prisma: PrismaClient,
  source: DiscoveredSource,
): Promise<{ registered: boolean }> => {
  const connector = await prisma.connector.findUnique({
    where: { name: source.connectorName },
    select: { id: true, accessStatus: true },
  });

  if (connector === null) {
    return { registered: false };
  }

  const slug = slugify(source.atsIdentifier) || source.atsIdentifier;

  const company = await prisma.company.upsert({
    where: { slug },
    update: {},
    create: { slug, name: source.atsIdentifier, normalizedName: slugify(source.atsIdentifier) },
    select: { id: true },
  });

  await prisma.companySource.upsert({
    where: { companyId_domain: { companyId: company.id, domain: source.atsHost } },
    update: {
      atsKind: source.atsKind,
      atsIdentifier: source.atsIdentifier,
      accessStatus: connector.accessStatus,
      connectorId: connector.id,
    },
    create: {
      companyId: company.id,
      domain: source.atsHost,
      atsKind: source.atsKind,
      atsIdentifier: source.atsIdentifier,
      accessStatus: connector.accessStatus,
      connectorId: connector.id,
      // Découverte par recherche : la confiance dans le rattachement est
      // moyenne tant qu'une collecte réussie ne l'a pas confirmée.
      confidence: 50,
    },
  });

  return { registered: true };
};

/**
 * Liste les sources qu'on a le droit de collecter maintenant : celles dont le
 * connecteur est `ACTIVE` et dont le régime d'accès l'autorise. C'est le
 * registre relu à chaque cycle — fermer un connecteur en base retire ses
 * sources de cette liste sans toucher au code.
 */
export const listCollectableSources = async (
  prisma: PrismaClient,
): Promise<readonly CollectableSource[]> => {
  const sources = await prisma.companySource.findMany({
    where: {
      atsIdentifier: { not: null },
      accessStatus: {
        in: [
          SourceAccessStatus.OFFICIAL_API,
          SourceAccessStatus.PUBLIC_FEED,
          SourceAccessStatus.AUTHORIZED_CRAWL,
        ],
      },
      connector: { is: { status: "ACTIVE" } },
    },
    select: {
      atsIdentifier: true,
      connector: { select: { name: true } },
      company: { select: { name: true } },
    },
  });

  const collectable: CollectableSource[] = [];
  for (const source of sources) {
    if (source.atsIdentifier === null || source.connector === null) {
      continue;
    }

    collectable.push({
      connectorName: source.connector.name,
      atsIdentifier: source.atsIdentifier,
      companyName: source.company.name,
    });
  }

  return collectable;
};
