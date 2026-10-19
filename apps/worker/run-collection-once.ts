import { loadRootEnv, parseWorkerEnv } from "@findit/config";
import { createPrismaClient } from "@findit/database";

import { createCycleDeps, createScrapedCycleDeps } from "./src/collection/cycle-deps.js";
import { runScrapedCycle } from "./src/collection/run-scraped-cycle.js";

/*
 * Collecte ponctuelle des offres réelles : connecteurs de recherche (France
 * Travail) puis job boards agrégateurs (WTTJ, HelloWork, Indeed, LinkedIn, via
 * Apify). Sert à amorcer la base avec de vraies offres, sans attendre la
 * planification du worker. Le budget de dépense du cycle est plafonné par
 * `SCRAPING_BUDGET_CYCLE_USD`.
 */
const run = async (): Promise<void> => {
  loadRootEnv();
  const env = parseWorkerEnv(process.env);
  const prisma = createPrismaClient(env.DATABASE_URL);

  try {
    const nativeDeps = createCycleDeps(prisma, env);
    const native = await nativeDeps.collect(nativeDeps.searchJobs);
    console.log(
      JSON.stringify(
        {
          phase: "native",
          totalAccepted: native.totalAccepted,
          totalQuarantined: native.totalQuarantined,
          totalRejected: native.totalRejected,
        },
        null,
        2,
      ),
    );

    const scraped = await runScrapedCycle(createScrapedCycleDeps(prisma, env));
    console.log(
      JSON.stringify(
        {
          phase: "scraped",
          totalAccepted: scraped.totalAccepted,
          totalQuarantined: scraped.totalQuarantined,
          totalRejected: scraped.totalRejected,
          jobs: scraped.jobs.map((job) => ({
            connector: job.connectorName,
            discovered: job.discovered,
            accepted: job.accepted,
            rejected: job.rejected,
            failed: job.failed,
            reason: job.failureReason,
          })),
        },
        null,
        2,
      ),
    );
  } finally {
    await prisma.$disconnect();
  }
};

void run();
