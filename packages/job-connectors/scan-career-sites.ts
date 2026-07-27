import { loadRootEnv, parseDatabaseEnv } from "@findit/config";
import { AtsKind, createPrismaClient } from "@findit/database";

import { extractAtsReferences } from "./src/career-scan.js";
import { FINDIT_USER_AGENT } from "./src/http.js";
import { decideRobots, parseRobots, type RobotsFile } from "./src/robots.js";

/*
 * Scanne les sites carrières du registre d'entreprises pour trouver où elles
 * publient : un lien Greenhouse, Lever ou Workday dans la page devient une
 * source collectable, rattachée à l'entreprise déjà connue.
 *
 * Les règles du registre dynamique s'appliquent (docs/legal-compliance.md) :
 * le robots.txt de CHAQUE domaine est lu d'abord, un verdict autre que
 * ALLOWED vaut refus, l'identité FinditBot est annoncée, une requête par
 * seconde. La page n'est jamais conservée - seuls les jetons d'ATS en
 * sortent. Rejouable : une source déjà enregistrée n'est pas dupliquée, une
 * entreprise déjà couverte n'est pas revisitée.
 */

const REQUEST_INTERVAL_MS = 1000;
const FETCH_TIMEOUT_MS = 20_000;

const ATS_KINDS: ReadonlyMap<string, AtsKind> = new Map([
  ["greenhouse", AtsKind.GREENHOUSE],
  ["lever", AtsKind.LEVER],
  ["workday", AtsKind.WORKDAY],
]);

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

let lastRequestAt = 0;

/** Une seule cadence pour tout le scan : robots et pages confondus. */
const pacedFetch = async (url: string, accept: string): Promise<Response> => {
  const wait = REQUEST_INTERVAL_MS - (Date.now() - lastRequestAt);
  if (wait > 0) {
    await sleep(wait);
  }
  lastRequestAt = Date.now();

  return fetch(url, {
    headers: { accept, "user-agent": FINDIT_USER_AGENT },
    redirect: "follow",
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
};

const robotsCache = new Map<string, RobotsFile | null>();

/** `null` : fichier absent ou illisible - ce n'est pas une permission. */
const robotsFor = async (host: string): Promise<RobotsFile | null> => {
  const cached = robotsCache.get(host);
  if (cached !== undefined) {
    return cached;
  }

  let file: RobotsFile | null = null;
  try {
    const response = await pacedFetch(`https://${host}/robots.txt`, "text/plain");
    if (response.ok) {
      file = parseRobots(await response.text());
    }
  } catch {
    file = null;
  }

  robotsCache.set(host, file);
  return file;
};

const main = async (): Promise<void> => {
  loadRootEnv();
  const prisma = createPrismaClient(parseDatabaseEnv(process.env).DATABASE_URL);

  const counts = { visited: 0, refusedRobots: 0, unreachable: 0, registered: 0, alreadyKnown: 0 };

  try {
    const connectors = new Map(
      (
        await prisma.connector.findMany({
          where: { name: { in: [...ATS_KINDS.keys()] }, status: "ACTIVE" },
          select: { id: true, name: true, accessStatus: true },
        })
      ).map((connector) => [connector.name, connector]),
    );

    // Les entreprises du registre qui ont un site carrière mais encore aucune
    // source collectable : exactement celles que le scan peut débloquer.
    const companies = await prisma.company.findMany({
      where: {
        careerUrl: { not: null },
        sources: { none: { atsIdentifier: { not: null } } },
      },
      select: { id: true, slug: true, careerUrl: true },
      orderBy: { slug: "asc" },
    });

    console.log(`Sites carrières à visiter : ${String(companies.length)}`);

    for (const company of companies) {
      if (company.careerUrl === null) {
        continue;
      }

      let url: URL;
      try {
        url = new URL(company.careerUrl);
      } catch {
        continue;
      }

      // La permission du domaine, d'abord. Silence ou absence = refus.
      const robots = await robotsFor(url.host);
      const decision =
        robots === null
          ? null
          : decideRobots(robots, FINDIT_USER_AGENT, url.pathname === "" ? "/" : url.pathname);

      if (decision === null || decision.verdict !== "ALLOWED") {
        counts.refusedRobots += 1;
        continue;
      }

      let html: string;
      try {
        const response = await pacedFetch(url.toString(), "text/html, */*;q=0.5");
        if (!response.ok) {
          counts.unreachable += 1;
          continue;
        }
        html = await response.text();
      } catch {
        counts.unreachable += 1;
        continue;
      }

      counts.visited += 1;

      for (const finding of extractAtsReferences(html)) {
        const connector = connectors.get(finding.connectorName);
        const atsKind = ATS_KINDS.get(finding.connectorName);
        if (connector === undefined || atsKind === undefined) {
          continue;
        }

        const existing = await prisma.companySource.findUnique({
          where: { companyId_domain: { companyId: company.id, domain: finding.atsHost } },
          select: { atsIdentifier: true },
        });
        if (existing?.atsIdentifier != null) {
          counts.alreadyKnown += 1;
          continue;
        }

        await prisma.companySource.upsert({
          where: { companyId_domain: { companyId: company.id, domain: finding.atsHost } },
          update: {
            atsKind,
            atsIdentifier: finding.atsIdentifier,
            accessStatus: connector.accessStatus,
            connectorId: connector.id,
          },
          create: {
            companyId: company.id,
            domain: finding.atsHost,
            atsKind,
            atsIdentifier: finding.atsIdentifier,
            accessStatus: connector.accessStatus,
            connectorId: connector.id,
            // Trouvé sur le propre site carrière de l'entreprise : le
            // rattachement est plus sûr qu'une découverte par moteur.
            confidence: 80,
            notes: `Trouvé sur ${company.careerUrl} (scan du site carrière).`,
          },
        });

        counts.registered += 1;
        console.log(`  ${company.slug} -> ${finding.connectorName} ${finding.atsIdentifier}`);
      }
    }

    console.log(
      `Visites : ${String(counts.visited)} ; refus robots : ${String(counts.refusedRobots)} ; ` +
        `injoignables : ${String(counts.unreachable)} ; sources enregistrées : ${String(counts.registered)} ; ` +
        `déjà connues : ${String(counts.alreadyKnown)}`,
    );
  } finally {
    await prisma.$disconnect();
  }
};

await main();
