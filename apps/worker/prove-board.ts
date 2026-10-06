import { randomUUID } from "node:crypto";

import { loadRootEnv, parseWorkerEnv } from "@findit/config";
import { createPrismaClient } from "@findit/database";
import type { RunConnectorDeps } from "@findit/job-connectors";
import {
  createCycleBudget,
  createHelloworkConnector,
  createPrismaConnectorRunStore,
  createPrismaSpendLedger,
  createWttjConnector,
  loadRegistration,
  microUsdToUsd,
  SOURCE_PRIORITY_JOB_BOARD,
  usdToMicroUsd,
  WTTJ_CONNECTOR_NAME,
  HELLOWORK_CONNECTOR_NAME,
} from "@findit/job-connectors";

import { createIngestionPersistence, runCollection } from "./src/collection/run-collection.js";

/*
 * Preuve réelle bornée d'un job board (TASK-306 et suivantes) : un seul run,
 * quelques offres, par le MÊME chemin que le cycle (journal de runs, garde de
 * budget, décision d'ingestion, écriture en base). Elle dépense de l'argent
 * réel : le plafond de résultats est obligatoire et le budget du mois s'applique.
 *
 * Les offres écrites sont supprimées ensuite - republier du contenu de job board
 * sur le site public n'est pas encore décidé. Le `ConnectorRun`, son coût et ses
 * notices restent : le coût fait partie du cumul du mois, l'effacer fausserait
 * la garde de budget.
 *
 *   pnpm board:proof -- --max-items 20                    # Welcome to the Jungle
 *   pnpm board:proof -- --source hellowork --max-items 20  # HelloWork
 *   pnpm board:proof -- --max-items 20 --keep              # garde les offres
 */

const SOURCES = {
  wttj: {
    name: WTTJ_CONNECTOR_NAME,
    target: { query: "développeur", location: "Île-de-France, France" },
    create: (token: string, maxItems: number) => createWttjConnector({ token, maxItems }),
  },
  hellowork: {
    name: HELLOWORK_CONNECTOR_NAME,
    target: { query: "développeur", location: "Île-de-France" },
    create: (token: string, maxItems: number) => createHelloworkConnector({ token, maxItems }),
  },
} as const;

type SourceKey = keyof typeof SOURCES;

const argValue = (name: string): string | undefined => {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
};

const main = async (): Promise<void> => {
  loadRootEnv();
  const env = parseWorkerEnv(process.env);
  const keep = process.argv.includes("--keep");
  const maxItems = Number(argValue("--max-items") ?? "20");
  const sourceKey = (argValue("--source") ?? "wttj") as SourceKey;
  const source = SOURCES[sourceKey];

  if (source === undefined) {
    console.error(
      `Source inconnue : ${sourceKey} (attendue : ${Object.keys(SOURCES).join(", ")}).`,
    );
    process.exitCode = 1;
    return;
  }

  if (env.APIFY_API_TOKEN === undefined) {
    console.error(
      "APIFY_API_TOKEN est absent du .env : renseigner le jeton du compte Apify dedie, puis relancer.",
    );
    process.exitCode = 1;
    return;
  }

  const prisma = createPrismaClient(env.DATABASE_URL);

  try {
    const registration = await loadRegistration(prisma, source.name);
    if (registration === null) {
      console.error(
        "Aucune ligne de registre pour la source : lancer d'abord `pnpm registry:sync`.",
      );
      process.exitCode = 1;
      return;
    }

    const counts = async () => ({
      jobs: await prisma.job.count(),
      sources: await prisma.jobSource.count(),
      companies: await prisma.company.count(),
      logs: await prisma.processingLog.count(),
      duplicateGroups: await prisma.duplicateGroup.count(),
    });

    const before = await counts();
    const startedAt = new Date();
    const correlationId = `proof-${randomUUID()}`;
    const ledger = createPrismaSpendLedger(prisma);
    const monthBefore = await ledger.monthToDateMicroUsd(startedAt);

    const connectorDeps: RunConnectorDeps = {
      fetch: globalThis.fetch,
      sleep: (ms) =>
        new Promise((resolve) => {
          setTimeout(resolve, ms);
        }),
      monotonicNow: () => performance.now(),
      now: () => new Date(),
      correlationId,
      budget: createCycleBudget(
        {
          monthlyMicroUsd: usdToMicroUsd(env.SCRAPING_BUDGET_MONTHLY_USD),
          cycleMicroUsd: usdToMicroUsd(env.SCRAPING_BUDGET_CYCLE_USD),
        },
        ledger,
      ),
    };

    console.log(`Source : ${source.name}, plafond ${String(maxItems)} resultats.`);
    console.log(`Cumul du mois avant : ${microUsdToUsd(monthBefore).toFixed(5)} $`);

    const summary = await runCollection(
      [
        {
          connector: source.create(env.APIFY_API_TOKEN, maxItems),
          target: source.target,
          companyName: "",
          /*
           * Le rang du cycle reel, pas celui d'un ATS : la preuve doit arbitrer
           * les sources comme la production. Avec le rang officiel, une offre de
           * job board deja presente en base serait elue canonique a tort, et le
           * nettoyage laisserait l'offre officielle en doublon.
           */
          sourcePriority: SOURCE_PRIORITY_JOB_BOARD,
        },
      ],
      {
        store: createPrismaConnectorRunStore(prisma),
        persistence: createIngestionPersistence(prisma, () => new Date()),
        connectorDeps,
        now: () => new Date(),
      },
    );

    for (const job of summary.jobs) {
      console.log(
        `Resultat : ${job.failed ? "ECHEC" : "ok"} - vues ${String(job.discovered)}, acceptees ${String(job.accepted)}, quarantaine ${String(job.quarantined)}, rejetees ${String(job.rejected)}${job.failureReason === null ? "" : ` - ${job.failureReason}`}`,
      );
    }

    const run = await prisma.connectorRun.findFirst({
      where: { correlationId },
      orderBy: { startedAt: "desc" },
      include: { errors: { select: { kind: true, message: true } } },
    });
    if (run === null) {
      console.log(
        "Aucune ligne ConnectorRun : le run n'a pas ete ouvert (refus de budget ou de registre).",
      );
    } else {
      console.log(
        `ConnectorRun : ${run.status}, ${String(run.pagesFetched)} requetes, cout ${microUsdToUsd(run.costMicroUsd).toFixed(5)} $ (${String(run.costMicroUsd)} micro-dollars)`,
      );
      for (const error of run.errors) {
        console.log(`  notice ${error.kind} : ${error.message}`);
      }
    }
    console.log(
      `Cumul du mois apres : ${microUsdToUsd(await ledger.monthToDateMicroUsd(new Date())).toFixed(5)} $`,
    );

    const created = await prisma.job.findMany({
      where: { firstSeenAt: { gte: startedAt }, sources: { some: { name: source.name } } },
      select: {
        title: true,
        status: true,
        company: { select: { name: true } },
        sources: { select: { url: true } },
      },
    });
    console.log(`Offres creees en base par ce run : ${String(created.length)}`);
    for (const job of created.slice(0, 5)) {
      console.log(
        `  [${job.status}] ${job.company.name} - ${job.title} - ${job.sources[0]?.url ?? "(sans url)"}`,
      );
    }

    if (keep) {
      console.log("--keep : offres conservees.");
      return;
    }

    // Nettoyage : seulement ce que CE run a ecrit. Une offre qui existait deja
    // n'est jamais supprimee ; une source ajoutee a une offre existante l'est.
    await prisma.job.deleteMany({
      where: { firstSeenAt: { gte: startedAt }, sources: { some: { name: source.name } } },
    });
    await prisma.jobSource.deleteMany({
      where: { name: source.name, createdAt: { gte: startedAt } },
    });
    await prisma.duplicateGroup.deleteMany({
      where: { createdAt: { gte: startedAt }, jobs: { none: {} } },
    });
    await prisma.processingLog.deleteMany({ where: { correlationId } });
    await prisma.company.deleteMany({
      where: { createdAt: { gte: startedAt }, jobs: { none: {} } },
    });

    const after = await counts();
    console.log("Avant   :", JSON.stringify(before));
    console.log("Apres   :", JSON.stringify(after));
    console.log(
      JSON.stringify(before) === JSON.stringify(after)
        ? "Nettoyage : la base est revenue exactement a son etat d'avant."
        : "ATTENTION : la base differe de son etat d'avant, a examiner.",
    );
  } finally {
    await prisma.$disconnect();
  }
};

await main();
