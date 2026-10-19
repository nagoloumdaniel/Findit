-- Offres mises en favori par le propriétaire. Mono-utilisateur : un simple lien
-- vers une offre, unique par offre, supprimé en cascade avec l'offre.
CREATE TABLE "Favorite" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Favorite_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Favorite_jobId_key" ON "Favorite"("jobId");
CREATE INDEX "Favorite_createdAt_idx" ON "Favorite"("createdAt");

ALTER TABLE "Favorite" ADD CONSTRAINT "Favorite_jobId_fkey"
  FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;
