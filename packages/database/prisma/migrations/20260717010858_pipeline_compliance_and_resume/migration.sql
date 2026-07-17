-- CreateEnum
CREATE TYPE "AtsKind" AS ENUM ('GREENHOUSE', 'LEVER', 'ASHBY', 'SMARTRECRUITERS', 'WORKDAY', 'TEAMTAILOR', 'RECRUITEE', 'TALEO', 'SAP_SUCCESSFACTORS', 'WELCOMEKIT', 'FLATCHR', 'JOBTEASER', 'OTHER', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "SourceAccessStatus" AS ENUM ('OFFICIAL_API', 'PUBLIC_FEED', 'AUTHORIZED_CRAWL', 'SEARCH_ENGINE_DISCOVERY_ONLY', 'MANUAL_IMPORT', 'DISABLED_PENDING_PERMISSION', 'PROHIBITED');

-- CreateEnum
CREATE TYPE "CompanyKind" AS ENUM ('EMPLOYER', 'SCHOOL', 'TRAINING_ORGANISATION', 'BOOTCAMP', 'RECRUITMENT_AGENCY', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "DecisionSource" AS ENUM ('RULE', 'AI', 'HUMAN');

-- CreateEnum
CREATE TYPE "ConnectorStatus" AS ENUM ('ACTIVE', 'DISABLED', 'DISABLED_PENDING_PERMISSION', 'FAILING');

-- CreateEnum
CREATE TYPE "ConnectorRunStatus" AS ENUM ('RUNNING', 'SUCCEEDED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "DuplicateAction" AS ENUM ('MERGED', 'UNMERGED', 'REJECTED');

-- CreateEnum
CREATE TYPE "ClassificationOutcome" AS ENUM ('ACCEPTED', 'REJECTED', 'QUARANTINED');

-- CreateEnum
CREATE TYPE "ResumeFileType" AS ENUM ('PDF', 'DOCX');

-- CreateEnum
CREATE TYPE "ResumeStatus" AS ENUM ('UPLOADED', 'PARSED', 'PARSE_FAILED', 'DELETED');

-- CreateEnum
CREATE TYPE "CoverLetterTone" AS ENUM ('PROFESSIONAL', 'DIRECT', 'ENTHUSIASTIC', 'SOBER');

-- CreateTable
CREATE TABLE "CompanyAlias" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "alias" TEXT NOT NULL,
    "normalizedAlias" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CompanyAlias_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompanySource" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "careerUrl" TEXT,
    "atsKind" "AtsKind" NOT NULL DEFAULT 'UNKNOWN',
    "atsIdentifier" TEXT,
    "accessStatus" "SourceAccessStatus" NOT NULL,
    "connectorId" TEXT,
    "lastSuccessfulRunAt" TIMESTAMP(3),
    "fetchedJobCount" INTEGER NOT NULL DEFAULT 0,
    "confidence" INTEGER NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompanySource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompanyClassification" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "kind" "CompanyKind" NOT NULL,
    "schoolRiskScore" INTEGER NOT NULL,
    "reasons" TEXT[],
    "decidedBy" "DecisionSource" NOT NULL,
    "decidedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "promptVersionId" TEXT,

    CONSTRAINT "CompanyClassification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Connector" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "atsKind" "AtsKind" NOT NULL DEFAULT 'UNKNOWN',
    "accessStatus" "SourceAccessStatus" NOT NULL,
    "status" "ConnectorStatus" NOT NULL DEFAULT 'DISABLED_PENDING_PERMISSION',
    "termsCheckedAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Connector_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConnectorRun" (
    "id" TEXT NOT NULL,
    "connectorId" TEXT NOT NULL,
    "status" "ConnectorRunStatus" NOT NULL DEFAULT 'RUNNING',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "pagesFetched" INTEGER NOT NULL DEFAULT 0,
    "jobsDiscovered" INTEGER NOT NULL DEFAULT 0,
    "jobsAccepted" INTEGER NOT NULL DEFAULT 0,
    "jobsRejected" INTEGER NOT NULL DEFAULT 0,
    "jobsQuarantined" INTEGER NOT NULL DEFAULT 0,
    "duplicatesFound" INTEGER NOT NULL DEFAULT 0,
    "errorCount" INTEGER NOT NULL DEFAULT 0,
    "correlationId" TEXT NOT NULL,

    CONSTRAINT "ConnectorRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConnectorError" (
    "id" TEXT NOT NULL,
    "connectorId" TEXT NOT NULL,
    "runId" TEXT,
    "kind" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "url" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConnectorError_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobSourceSnapshot" (
    "id" TEXT NOT NULL,
    "jobSourceId" TEXT NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "httpStatus" INTEGER,
    "contentType" TEXT,
    "contentHash" TEXT NOT NULL,
    "rawContent" TEXT,

    CONSTRAINT "JobSourceSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SkillAlias" (
    "id" TEXT NOT NULL,
    "skillId" TEXT NOT NULL,
    "alias" TEXT NOT NULL,
    "normalizedAlias" TEXT NOT NULL,

    CONSTRAINT "SkillAlias_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DuplicateGroup" (
    "id" TEXT NOT NULL,
    "canonicalJobId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DuplicateGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DuplicateDecision" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "action" "DuplicateAction" NOT NULL,
    "score" DOUBLE PRECISION NOT NULL,
    "scoreBreakdown" JSONB NOT NULL,
    "reasons" TEXT[],
    "decidedBy" "DecisionSource" NOT NULL,
    "decidedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DuplicateDecision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobClassificationDecision" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "outcome" "ClassificationOutcome" NOT NULL,
    "roleCategory" "RoleCategory",
    "contractType" "ContractType",
    "confidence" INTEGER NOT NULL,
    "reasons" TEXT[],
    "decidedBy" "DecisionSource" NOT NULL,
    "decidedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "promptVersionId" TEXT,

    CONSTRAINT "JobClassificationDecision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SchoolDetectionDecision" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "riskScore" INTEGER NOT NULL,
    "excluded" BOOLEAN NOT NULL,
    "reasons" TEXT[],
    "decidedBy" "DecisionSource" NOT NULL,
    "decidedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "promptVersionId" TEXT,

    CONSTRAINT "SchoolDetectionDecision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FraudDetectionDecision" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "riskScore" INTEGER NOT NULL,
    "excluded" BOOLEAN NOT NULL,
    "reasons" TEXT[],
    "decidedBy" "DecisionSource" NOT NULL,
    "decidedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "promptVersionId" TEXT,

    CONSTRAINT "FraudDetectionDecision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProcessingLog" (
    "id" TEXT NOT NULL,
    "jobId" TEXT,
    "stage" TEXT NOT NULL,
    "fromStatus" "JobStatus",
    "toStatus" "JobStatus",
    "succeeded" BOOLEAN NOT NULL,
    "message" TEXT,
    "durationMs" INTEGER,
    "correlationId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProcessingLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Resume" (
    "id" TEXT NOT NULL,
    "browserSessionId" TEXT NOT NULL,
    "fileType" "ResumeFileType" NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "storageKey" TEXT NOT NULL,
    "contentHash" TEXT NOT NULL,
    "status" "ResumeStatus" NOT NULL DEFAULT 'UPLOADED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Resume_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ResumeAnalysis" (
    "id" TEXT NOT NULL,
    "resumeId" TEXT NOT NULL,
    "headline" TEXT,
    "summary" TEXT,
    "yearsExperience" DOUBLE PRECISION,
    "studyLevel" TEXT,
    "location" TEXT,
    "availability" TEXT,
    "extractedFacts" JSONB NOT NULL,
    "warnings" TEXT[],
    "confidence" INTEGER NOT NULL,
    "analysedBy" "DecisionSource" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "promptVersionId" TEXT,

    CONSTRAINT "ResumeAnalysis_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobMatch" (
    "id" TEXT NOT NULL,
    "resumeId" TEXT NOT NULL,
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
    "promptVersionId" TEXT,

    CONSTRAINT "JobMatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CoverLetter" (
    "id" TEXT NOT NULL,
    "resumeId" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "matchId" TEXT,
    "tone" "CoverLetterTone" NOT NULL DEFAULT 'PROFESSIONAL',
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "usedResumeFacts" JSONB NOT NULL,
    "editedByUser" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "generatedBy" "DecisionSource" NOT NULL,
    "promptVersionId" TEXT,

    CONSTRAINT "CoverLetter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PromptVersion" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "model" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "contentHash" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PromptVersion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CompanyAlias_normalizedAlias_idx" ON "CompanyAlias"("normalizedAlias");

-- CreateIndex
CREATE UNIQUE INDEX "CompanyAlias_companyId_normalizedAlias_key" ON "CompanyAlias"("companyId", "normalizedAlias");

-- CreateIndex
CREATE INDEX "CompanySource_accessStatus_idx" ON "CompanySource"("accessStatus");

-- CreateIndex
CREATE INDEX "CompanySource_atsKind_idx" ON "CompanySource"("atsKind");

-- CreateIndex
CREATE UNIQUE INDEX "CompanySource_companyId_domain_key" ON "CompanySource"("companyId", "domain");

-- CreateIndex
CREATE INDEX "CompanyClassification_companyId_decidedAt_idx" ON "CompanyClassification"("companyId", "decidedAt");

-- CreateIndex
CREATE INDEX "CompanyClassification_kind_idx" ON "CompanyClassification"("kind");

-- CreateIndex
CREATE UNIQUE INDEX "Connector_name_key" ON "Connector"("name");

-- CreateIndex
CREATE INDEX "Connector_status_idx" ON "Connector"("status");

-- CreateIndex
CREATE INDEX "ConnectorRun_connectorId_startedAt_idx" ON "ConnectorRun"("connectorId", "startedAt");

-- CreateIndex
CREATE INDEX "ConnectorRun_status_idx" ON "ConnectorRun"("status");

-- CreateIndex
CREATE INDEX "ConnectorRun_correlationId_idx" ON "ConnectorRun"("correlationId");

-- CreateIndex
CREATE INDEX "ConnectorError_connectorId_occurredAt_idx" ON "ConnectorError"("connectorId", "occurredAt");

-- CreateIndex
CREATE INDEX "ConnectorError_runId_idx" ON "ConnectorError"("runId");

-- CreateIndex
CREATE INDEX "JobSourceSnapshot_jobSourceId_fetchedAt_idx" ON "JobSourceSnapshot"("jobSourceId", "fetchedAt");

-- CreateIndex
CREATE INDEX "JobSourceSnapshot_contentHash_idx" ON "JobSourceSnapshot"("contentHash");

-- CreateIndex
CREATE UNIQUE INDEX "SkillAlias_normalizedAlias_key" ON "SkillAlias"("normalizedAlias");

-- CreateIndex
CREATE INDEX "SkillAlias_skillId_idx" ON "SkillAlias"("skillId");

-- CreateIndex
CREATE INDEX "DuplicateGroup_canonicalJobId_idx" ON "DuplicateGroup"("canonicalJobId");

-- CreateIndex
CREATE INDEX "DuplicateDecision_groupId_decidedAt_idx" ON "DuplicateDecision"("groupId", "decidedAt");

-- CreateIndex
CREATE INDEX "DuplicateDecision_jobId_idx" ON "DuplicateDecision"("jobId");

-- CreateIndex
CREATE INDEX "JobClassificationDecision_jobId_decidedAt_idx" ON "JobClassificationDecision"("jobId", "decidedAt");

-- CreateIndex
CREATE INDEX "JobClassificationDecision_outcome_idx" ON "JobClassificationDecision"("outcome");

-- CreateIndex
CREATE INDEX "SchoolDetectionDecision_jobId_decidedAt_idx" ON "SchoolDetectionDecision"("jobId", "decidedAt");

-- CreateIndex
CREATE INDEX "SchoolDetectionDecision_excluded_idx" ON "SchoolDetectionDecision"("excluded");

-- CreateIndex
CREATE INDEX "FraudDetectionDecision_jobId_decidedAt_idx" ON "FraudDetectionDecision"("jobId", "decidedAt");

-- CreateIndex
CREATE INDEX "FraudDetectionDecision_excluded_idx" ON "FraudDetectionDecision"("excluded");

-- CreateIndex
CREATE INDEX "ProcessingLog_jobId_createdAt_idx" ON "ProcessingLog"("jobId", "createdAt");

-- CreateIndex
CREATE INDEX "ProcessingLog_stage_createdAt_idx" ON "ProcessingLog"("stage", "createdAt");

-- CreateIndex
CREATE INDEX "ProcessingLog_correlationId_idx" ON "ProcessingLog"("correlationId");

-- CreateIndex
CREATE UNIQUE INDEX "Resume_storageKey_key" ON "Resume"("storageKey");

-- CreateIndex
CREATE INDEX "Resume_browserSessionId_idx" ON "Resume"("browserSessionId");

-- CreateIndex
CREATE INDEX "Resume_expiresAt_idx" ON "Resume"("expiresAt");

-- CreateIndex
CREATE INDEX "ResumeAnalysis_resumeId_createdAt_idx" ON "ResumeAnalysis"("resumeId", "createdAt");

-- CreateIndex
CREATE INDEX "JobMatch_resumeId_score_idx" ON "JobMatch"("resumeId", "score");

-- CreateIndex
CREATE INDEX "JobMatch_jobId_idx" ON "JobMatch"("jobId");

-- CreateIndex
CREATE UNIQUE INDEX "JobMatch_resumeId_jobId_computedBy_key" ON "JobMatch"("resumeId", "jobId", "computedBy");

-- CreateIndex
CREATE INDEX "CoverLetter_resumeId_createdAt_idx" ON "CoverLetter"("resumeId", "createdAt");

-- CreateIndex
CREATE INDEX "CoverLetter_jobId_idx" ON "CoverLetter"("jobId");

-- CreateIndex
CREATE INDEX "CoverLetter_expiresAt_idx" ON "CoverLetter"("expiresAt");

-- CreateIndex
CREATE INDEX "PromptVersion_name_active_idx" ON "PromptVersion"("name", "active");

-- CreateIndex
CREATE UNIQUE INDEX "PromptVersion_name_version_key" ON "PromptVersion"("name", "version");

-- AddForeignKey
ALTER TABLE "Job" ADD CONSTRAINT "Job_duplicateGroupId_fkey" FOREIGN KEY ("duplicateGroupId") REFERENCES "DuplicateGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyAlias" ADD CONSTRAINT "CompanyAlias_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanySource" ADD CONSTRAINT "CompanySource_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanySource" ADD CONSTRAINT "CompanySource_connectorId_fkey" FOREIGN KEY ("connectorId") REFERENCES "Connector"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyClassification" ADD CONSTRAINT "CompanyClassification_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyClassification" ADD CONSTRAINT "CompanyClassification_promptVersionId_fkey" FOREIGN KEY ("promptVersionId") REFERENCES "PromptVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConnectorRun" ADD CONSTRAINT "ConnectorRun_connectorId_fkey" FOREIGN KEY ("connectorId") REFERENCES "Connector"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConnectorError" ADD CONSTRAINT "ConnectorError_connectorId_fkey" FOREIGN KEY ("connectorId") REFERENCES "Connector"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConnectorError" ADD CONSTRAINT "ConnectorError_runId_fkey" FOREIGN KEY ("runId") REFERENCES "ConnectorRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobSourceSnapshot" ADD CONSTRAINT "JobSourceSnapshot_jobSourceId_fkey" FOREIGN KEY ("jobSourceId") REFERENCES "JobSource"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SkillAlias" ADD CONSTRAINT "SkillAlias_skillId_fkey" FOREIGN KEY ("skillId") REFERENCES "Skill"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DuplicateDecision" ADD CONSTRAINT "DuplicateDecision_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "DuplicateGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DuplicateDecision" ADD CONSTRAINT "DuplicateDecision_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobClassificationDecision" ADD CONSTRAINT "JobClassificationDecision_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobClassificationDecision" ADD CONSTRAINT "JobClassificationDecision_promptVersionId_fkey" FOREIGN KEY ("promptVersionId") REFERENCES "PromptVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolDetectionDecision" ADD CONSTRAINT "SchoolDetectionDecision_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolDetectionDecision" ADD CONSTRAINT "SchoolDetectionDecision_promptVersionId_fkey" FOREIGN KEY ("promptVersionId") REFERENCES "PromptVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FraudDetectionDecision" ADD CONSTRAINT "FraudDetectionDecision_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FraudDetectionDecision" ADD CONSTRAINT "FraudDetectionDecision_promptVersionId_fkey" FOREIGN KEY ("promptVersionId") REFERENCES "PromptVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProcessingLog" ADD CONSTRAINT "ProcessingLog_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResumeAnalysis" ADD CONSTRAINT "ResumeAnalysis_resumeId_fkey" FOREIGN KEY ("resumeId") REFERENCES "Resume"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResumeAnalysis" ADD CONSTRAINT "ResumeAnalysis_promptVersionId_fkey" FOREIGN KEY ("promptVersionId") REFERENCES "PromptVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobMatch" ADD CONSTRAINT "JobMatch_resumeId_fkey" FOREIGN KEY ("resumeId") REFERENCES "Resume"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobMatch" ADD CONSTRAINT "JobMatch_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobMatch" ADD CONSTRAINT "JobMatch_promptVersionId_fkey" FOREIGN KEY ("promptVersionId") REFERENCES "PromptVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoverLetter" ADD CONSTRAINT "CoverLetter_resumeId_fkey" FOREIGN KEY ("resumeId") REFERENCES "Resume"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoverLetter" ADD CONSTRAINT "CoverLetter_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoverLetter" ADD CONSTRAINT "CoverLetter_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "JobMatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoverLetter" ADD CONSTRAINT "CoverLetter_promptVersionId_fkey" FOREIGN KEY ("promptVersionId") REFERENCES "PromptVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Comme pour le noyau, ces règles sont tenues par la base afin qu'aucune
-- écriture, reprise manuelle ou script de correction ne puisse les contourner.

-- Les scores de risque et de confiance sont exprimés sur 100.
ALTER TABLE "CompanyClassification" ADD CONSTRAINT "CompanyClassification_schoolRiskScore_range"
  CHECK ("schoolRiskScore" BETWEEN 0 AND 100);

ALTER TABLE "CompanySource" ADD CONSTRAINT "CompanySource_confidence_range"
  CHECK ("confidence" BETWEEN 0 AND 100);

ALTER TABLE "JobClassificationDecision" ADD CONSTRAINT "JobClassificationDecision_confidence_range"
  CHECK ("confidence" BETWEEN 0 AND 100);

ALTER TABLE "SchoolDetectionDecision" ADD CONSTRAINT "SchoolDetectionDecision_riskScore_range"
  CHECK ("riskScore" BETWEEN 0 AND 100);

ALTER TABLE "FraudDetectionDecision" ADD CONSTRAINT "FraudDetectionDecision_riskScore_range"
  CHECK ("riskScore" BETWEEN 0 AND 100);

ALTER TABLE "ResumeAnalysis" ADD CONSTRAINT "ResumeAnalysis_confidence_range"
  CHECK ("confidence" BETWEEN 0 AND 100);

ALTER TABLE "JobMatch" ADD CONSTRAINT "JobMatch_score_range"
  CHECK ("score" BETWEEN 0 AND 100);

ALTER TABLE "JobMatch" ADD CONSTRAINT "JobMatch_confidence_range"
  CHECK ("confidence" BETWEEN 0 AND 100);

-- Le score de similarité de déduplication est une probabilité.
ALTER TABLE "DuplicateDecision" ADD CONSTRAINT "DuplicateDecision_score_range"
  CHECK ("score" BETWEEN 0 AND 1);

-- Une exécution terminée ne peut pas finir avant d'avoir commencé.
ALTER TABLE "ConnectorRun" ADD CONSTRAINT "ConnectorRun_finishedAt_after_startedAt"
  CHECK ("finishedAt" IS NULL OR "finishedAt" >= "startedAt");

-- Les compteurs d'une exécution ne peuvent pas être négatifs.
ALTER TABLE "ConnectorRun" ADD CONSTRAINT "ConnectorRun_counters_not_negative"
  CHECK (
    "pagesFetched" >= 0 AND "jobsDiscovered" >= 0 AND "jobsAccepted" >= 0
    AND "jobsRejected" >= 0 AND "jobsQuarantined" >= 0 AND "duplicatesFound" >= 0
    AND "errorCount" >= 0
  );

-- Un CV doit avoir une échéance de suppression postérieure à son dépôt : la
-- conservation ne peut pas être illimitée.
ALTER TABLE "Resume" ADD CONSTRAINT "Resume_expiresAt_after_createdAt"
  CHECK ("expiresAt" > "createdAt");

ALTER TABLE "Resume" ADD CONSTRAINT "Resume_fileSize_positive"
  CHECK ("fileSize" > 0);

ALTER TABLE "CoverLetter" ADD CONSTRAINT "CoverLetter_expiresAt_after_createdAt"
  CHECK ("expiresAt" > "createdAt");

-- Une version d'instruction commence à 1.
ALTER TABLE "PromptVersion" ADD CONSTRAINT "PromptVersion_version_positive"
  CHECK ("version" >= 1);

-- Une seule instruction active par nom, pour qu'aucune décision ne dépende d'un
-- choix ambigu entre deux versions.
CREATE UNIQUE INDEX "PromptVersion_one_active_per_name"
  ON "PromptVersion" ("name") WHERE "active";
