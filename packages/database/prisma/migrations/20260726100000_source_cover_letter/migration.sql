-- Lettre de motivation du proprietaire, verifiee avant stockage.
-- Table nouvelle, purement additive : rien d'existant n'est modifie.
-- La ligne suit le CV et l'offre : suppression en cascade des deux cotes.

CREATE TABLE "SourceCoverLetter" (
    "id" TEXT NOT NULL,
    "sourceResumeId" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "paragraphs" TEXT[],
    "usedFacts" TEXT[],
    "warnings" TEXT[],
    "computedBy" "DecisionSource" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SourceCoverLetter_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SourceCoverLetter_sourceResumeId_jobId_key"
ON "SourceCoverLetter"("sourceResumeId", "jobId");

CREATE INDEX "SourceCoverLetter_jobId_idx" ON "SourceCoverLetter"("jobId");

ALTER TABLE "SourceCoverLetter"
ADD CONSTRAINT "SourceCoverLetter_sourceResumeId_fkey"
FOREIGN KEY ("sourceResumeId") REFERENCES "SourceResume"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SourceCoverLetter"
ADD CONSTRAINT "SourceCoverLetter_jobId_fkey"
FOREIGN KEY ("jobId") REFERENCES "Job"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
