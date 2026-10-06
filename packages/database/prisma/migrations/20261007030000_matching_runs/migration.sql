-- Historique des matchings de CV.
-- Le POURQUOI : le cvText était reçu puis oublié, la page Matching ne pouvait donc
-- montrer qu'un résultat immédiat. Il est conservé avec une rétention courte
-- (MATCHING_RETENTION_HOURS, purge à chaque écriture) : un CV est une donnée
-- personnelle, la minimisation est une règle du dépôt (docs/legal-compliance.md).
CREATE TABLE "MatchingRun" (
    "id" TEXT NOT NULL,
    "cvText" TEXT NOT NULL,
    "jobCount" INTEGER NOT NULL DEFAULT 0,
    "bestScore" INTEGER NOT NULL DEFAULT 0,
    "items" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MatchingRun_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "MatchingRun_createdAt_idx" ON "MatchingRun"("createdAt");
