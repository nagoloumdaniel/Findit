-- Score CV source / offre, calcule par regles et explicable.
-- Table nouvelle, purement additive : rien d'existant n'est modifie.
-- La ligne suit le CV et l'offre : suppression en cascade des deux cotes.

CREATE TABLE "SourceResumeMatch" (
    "id" TEXT NOT NULL,
    "sourceResumeId" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "scoreBreakdown" JSONB NOT NULL,
    "matchedSkills" TEXT[],
    "missingSkills" TEXT[],
    "missingKeywords" TEXT[],
    "strengths" TEXT[],
    "weaknesses" TEXT[],
    "recommendations" TEXT[],
    "confidence" INTEGER NOT NULL,
    "insufficientDataWarning" TEXT,
    "computedBy" "DecisionSource" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SourceResumeMatch_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SourceResumeMatch_sourceResumeId_jobId_key"
ON "SourceResumeMatch"("sourceResumeId", "jobId");

CREATE INDEX "SourceResumeMatch_jobId_idx" ON "SourceResumeMatch"("jobId");

CREATE INDEX "SourceResumeMatch_sourceResumeId_score_idx"
ON "SourceResumeMatch"("sourceResumeId", "score");

ALTER TABLE "SourceResumeMatch"
ADD CONSTRAINT "SourceResumeMatch_sourceResumeId_fkey"
FOREIGN KEY ("sourceResumeId") REFERENCES "SourceResume"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SourceResumeMatch"
ADD CONSTRAINT "SourceResumeMatch_jobId_fkey"
FOREIGN KEY ("jobId") REFERENCES "Job"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
