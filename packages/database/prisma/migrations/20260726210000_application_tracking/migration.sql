-- Suivi des candidatures du proprietaire, avec instantanes et historique.
-- Tables nouvelles, purement additives : rien d'existant n'est modifie.
-- Le dossier survit a l'offre (SetNull) ; l'historique suit le dossier (Cascade).

CREATE TYPE "ApplicationStatus" AS ENUM (
  'TO_APPLY',
  'APPLIED',
  'INTERVIEW',
  'OFFER_RECEIVED',
  'REJECTED',
  'WITHDRAWN'
);

CREATE TABLE "Application" (
    "id" TEXT NOT NULL,
    "jobId" TEXT,
    "jobSlug" TEXT NOT NULL,
    "jobTitle" TEXT NOT NULL,
    "companyName" TEXT NOT NULL,
    "resumeFileName" TEXT,
    "matchScore" INTEGER,
    "letterSubject" TEXT,
    "letterParagraphs" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "status" "ApplicationStatus" NOT NULL DEFAULT 'TO_APPLY',
    "notes" TEXT,
    "appliedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Application_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Application_status_updatedAt_idx" ON "Application"("status", "updatedAt");

CREATE INDEX "Application_jobSlug_idx" ON "Application"("jobSlug");

ALTER TABLE "Application"
ADD CONSTRAINT "Application_jobId_fkey"
FOREIGN KEY ("jobId") REFERENCES "Job"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "ApplicationEvent" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "status" "ApplicationStatus" NOT NULL,
    "note" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApplicationEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ApplicationEvent_applicationId_occurredAt_idx"
ON "ApplicationEvent"("applicationId", "occurredAt");

ALTER TABLE "ApplicationEvent"
ADD CONSTRAINT "ApplicationEvent_applicationId_fkey"
FOREIGN KEY ("applicationId") REFERENCES "Application"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
