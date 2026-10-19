import { loadRootEnv, parseWorkerEnv } from "@findit/config";
import { createPrismaClient } from "@findit/database";

import { createCycleDeps } from "./src/collection/cycle-deps.js";

/*
 * Collecte ponctuelle des offres réelles via les connecteurs de recherche
 * (France Travail, Workable). Sert à amorcer la base avec de vraies offres,
 * sans attendre la planification du worker.
 */
const run = async (): Promise<void> => {
  loadRootEnv();
  const env = parseWorkerEnv(process.env);
  const prisma = createPrismaClient(env.DATABASE_URL);

  try {
    const deps = createCycleDeps(prisma, env);
    const summary = await deps.collect(deps.searchJobs);

    console.log(
      JSON.stringify(
        {
          correlationId: summary.correlationId,
          totalAccepted: summary.totalAccepted,
          totalQuarantined: summary.totalQuarantined,
          totalRejected: summary.totalRejected,
          jobs: summary.jobs.map((job) => ({
            connector: job.connectorName,
            discovered: job.discovered,
            accepted: job.accepted,
            quarantined: job.quarantined,
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
