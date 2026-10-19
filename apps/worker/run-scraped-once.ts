import { loadRootEnv, parseWorkerEnv } from "@findit/config";
import { createPrismaClient } from "@findit/database";

import { createScrapedCycleDeps } from "./src/collection/cycle-deps.js";
import { runScrapedCycle } from "./src/collection/run-scraped-cycle.js";

/*
 * Collecte ponctuelle des job boards agrégateurs (WTTJ, HelloWork, Indeed,
 * LinkedIn, via Apify). La dépense est plafonnée par `SCRAPING_BUDGET_CYCLE_USD`.
 */
const run = async (): Promise<void> => {
  loadRootEnv();
  const env = parseWorkerEnv(process.env);
  const prisma = createPrismaClient(env.DATABASE_URL);

  try {
    const summary = await runScrapedCycle(createScrapedCycleDeps(prisma, env));
    console.log(
      JSON.stringify(
        {
          totalAccepted: summary.totalAccepted,
          totalQuarantined: summary.totalQuarantined,
          totalRejected: summary.totalRejected,
          jobs: summary.jobs.map((job) => ({
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
