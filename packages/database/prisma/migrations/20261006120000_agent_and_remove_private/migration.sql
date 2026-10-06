-- CreateEnum
CREATE TYPE "SourceType" AS ENUM ('CAREER_SITE', 'JOB_BOARD', 'API', 'RSS', 'SEARCH_ENGINE');

-- CreateEnum
CREATE TYPE "AgentRunStatus" AS ENUM ('RUNNING', 'SUCCEEDED', 'FAILED', 'STOPPED');

-- CreateEnum
CREATE TYPE "MemoryKind" AS ENUM ('VISITED_URL', 'ANALYZED_URL', 'SEARCH_QUERY', 'SOURCE_PATTERN');

-- CreateEnum
CREATE TYPE "CrawlJobStatus" AS ENUM ('PENDING', 'RUNNING', 'SUCCEEDED', 'FAILED');

-- CreateEnum
CREATE TYPE "CrawlPageStatus" AS ENUM ('PENDING', 'FETCHED', 'FAILED', 'SKIPPED');

-- AlterEnum
BEGIN;
CREATE TYPE "NotificationType_new" AS ENUM ('NEW_JOB');
ALTER TABLE "TelegramJobNotification" ALTER COLUMN "type" TYPE "NotificationType_new" USING ("type"::text::"NotificationType_new");
ALTER TYPE "NotificationType" RENAME TO "NotificationType_old";
ALTER TYPE "NotificationType_new" RENAME TO "NotificationType";
DROP TYPE "public"."NotificationType_old";
COMMIT;

-- DropForeignKey
ALTER TABLE "Application" DROP CONSTRAINT "Application_jobId_fkey";

-- DropForeignKey
ALTER TABLE "ApplicationEvent" DROP CONSTRAINT "ApplicationEvent_applicationId_fkey";

-- DropForeignKey
ALTER TABLE "CoverLetter" DROP CONSTRAINT "CoverLetter_jobId_fkey";

-- DropForeignKey
ALTER TABLE "CoverLetter" DROP CONSTRAINT "CoverLetter_matchId_fkey";

-- DropForeignKey
ALTER TABLE "CoverLetter" DROP CONSTRAINT "CoverLetter_promptVersionId_fkey";

-- DropForeignKey
ALTER TABLE "CoverLetter" DROP CONSTRAINT "CoverLetter_resumeId_fkey";

-- DropForeignKey
ALTER TABLE "JobMatch" DROP CONSTRAINT "JobMatch_jobId_fkey";

-- DropForeignKey
ALTER TABLE "JobMatch" DROP CONSTRAINT "JobMatch_promptVersionId_fkey";

-- DropForeignKey
ALTER TABLE "JobMatch" DROP CONSTRAINT "JobMatch_resumeId_fkey";

-- DropForeignKey
ALTER TABLE "ResumeAnalysis" DROP CONSTRAINT "ResumeAnalysis_promptVersionId_fkey";

-- DropForeignKey
ALTER TABLE "ResumeAnalysis" DROP CONSTRAINT "ResumeAnalysis_resumeId_fkey";

-- DropForeignKey
ALTER TABLE "SourceCoverLetter" DROP CONSTRAINT "SourceCoverLetter_jobId_fkey";

-- DropForeignKey
ALTER TABLE "SourceCoverLetter" DROP CONSTRAINT "SourceCoverLetter_sourceResumeId_fkey";

-- DropForeignKey
ALTER TABLE "SourceResumeMatch" DROP CONSTRAINT "SourceResumeMatch_jobId_fkey";

-- DropForeignKey
ALTER TABLE "SourceResumeMatch" DROP CONSTRAINT "SourceResumeMatch_sourceResumeId_fkey";

-- DropTable
DROP TABLE "Application";

-- DropTable
DROP TABLE "ApplicationEvent";

-- DropTable
DROP TABLE "CandidateProfile";

-- DropTable
DROP TABLE "CoverLetter";

-- DropTable
DROP TABLE "JobMatch";

-- DropTable
DROP TABLE "Resume";

-- DropTable
DROP TABLE "ResumeAnalysis";

-- DropTable
DROP TABLE "SourceCoverLetter";

-- DropTable
DROP TABLE "SourceResume";

-- DropTable
DROP TABLE "SourceResumeMatch";

-- DropEnum
DROP TYPE "ApplicationStatus";

-- DropEnum
DROP TYPE "CoverLetterTone";

-- DropEnum
DROP TYPE "ResumeFileType";

-- DropEnum
DROP TYPE "ResumeStatus";

-- CreateTable
CREATE TABLE "Source" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "type" "SourceType" NOT NULL,
    "schedule" TEXT NOT NULL,
    "maxDepth" INTEGER NOT NULL DEFAULT 2,
    "maxPages" INTEGER NOT NULL DEFAULT 50,
    "priority" INTEGER NOT NULL DEFAULT 50,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "lastCrawlAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Source_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentRun" (
    "id" TEXT NOT NULL,
    "objective" TEXT NOT NULL,
    "status" "AgentRunStatus" NOT NULL DEFAULT 'RUNNING',
    "searches" INTEGER NOT NULL DEFAULT 0,
    "pages" INTEGER NOT NULL DEFAULT 0,
    "extracted" INTEGER NOT NULL DEFAULT 0,
    "validated" INTEGER NOT NULL DEFAULT 0,
    "duplicates" INTEGER NOT NULL DEFAULT 0,
    "inserted" INTEGER NOT NULL DEFAULT 0,
    "errors" INTEGER NOT NULL DEFAULT 0,
    "costMicroUsd" INTEGER NOT NULL DEFAULT 0,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),

    CONSTRAINT "AgentRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentAction" (
    "id" TEXT NOT NULL,
    "agentRunId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "detail" TEXT,
    "costMicroUsd" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgentAction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentError" (
    "id" TEXT NOT NULL,
    "agentRunId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "retried" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgentError_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentMemory" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "kind" "MemoryKind" NOT NULL,
    "value" JSONB,
    "lastSeenAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgentMemory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SearchQuery" (
    "id" TEXT NOT NULL,
    "agentRunId" TEXT NOT NULL,
    "query" TEXT NOT NULL,
    "engine" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SearchQuery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CrawlJob" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "agentRunId" TEXT,
    "status" "CrawlJobStatus" NOT NULL DEFAULT 'PENDING',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),

    CONSTRAINT "CrawlJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CrawlPage" (
    "id" TEXT NOT NULL,
    "crawlJobId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "status" "CrawlPageStatus" NOT NULL DEFAULT 'PENDING',
    "depth" INTEGER NOT NULL DEFAULT 0,
    "httpStatus" INTEGER,
    "html" TEXT,
    "text" TEXT,
    "robotsDenied" BOOLEAN NOT NULL DEFAULT false,
    "crawledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CrawlPage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Extraction" (
    "id" TEXT NOT NULL,
    "crawlPageId" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "model" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Extraction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Contact" (
    "id" TEXT NOT NULL,
    "companyId" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "sourceUrl" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Contact_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Source_enabled_priority_idx" ON "Source"("enabled", "priority");

-- CreateIndex
CREATE INDEX "AgentRun_startedAt_idx" ON "AgentRun"("startedAt");

-- CreateIndex
CREATE INDEX "AgentRun_status_startedAt_idx" ON "AgentRun"("status", "startedAt");

-- CreateIndex
CREATE INDEX "AgentAction_agentRunId_createdAt_idx" ON "AgentAction"("agentRunId", "createdAt");

-- CreateIndex
CREATE INDEX "AgentError_agentRunId_createdAt_idx" ON "AgentError"("agentRunId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "AgentMemory_kind_key_key" ON "AgentMemory"("kind", "key");

-- CreateIndex
CREATE INDEX "SearchQuery_agentRunId_createdAt_idx" ON "SearchQuery"("agentRunId", "createdAt");

-- CreateIndex
CREATE INDEX "CrawlJob_sourceId_startedAt_idx" ON "CrawlJob"("sourceId", "startedAt");

-- CreateIndex
CREATE INDEX "CrawlPage_crawlJobId_depth_idx" ON "CrawlPage"("crawlJobId", "depth");

-- CreateIndex
CREATE UNIQUE INDEX "CrawlPage_crawlJobId_url_key" ON "CrawlPage"("crawlJobId", "url");

-- CreateIndex
CREATE INDEX "Extraction_crawlPageId_idx" ON "Extraction"("crawlPageId");

-- CreateIndex
CREATE INDEX "Contact_companyId_idx" ON "Contact"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "Contact_companyId_email_key" ON "Contact"("companyId", "email");

-- CreateIndex
CREATE UNIQUE INDEX "Contact_companyId_phone_key" ON "Contact"("companyId", "phone");

-- AddForeignKey
ALTER TABLE "AgentAction" ADD CONSTRAINT "AgentAction_agentRunId_fkey" FOREIGN KEY ("agentRunId") REFERENCES "AgentRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentError" ADD CONSTRAINT "AgentError_agentRunId_fkey" FOREIGN KEY ("agentRunId") REFERENCES "AgentRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SearchQuery" ADD CONSTRAINT "SearchQuery_agentRunId_fkey" FOREIGN KEY ("agentRunId") REFERENCES "AgentRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrawlJob" ADD CONSTRAINT "CrawlJob_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "Source"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrawlJob" ADD CONSTRAINT "CrawlJob_agentRunId_fkey" FOREIGN KEY ("agentRunId") REFERENCES "AgentRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrawlPage" ADD CONSTRAINT "CrawlPage_crawlJobId_fkey" FOREIGN KEY ("crawlJobId") REFERENCES "CrawlJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Extraction" ADD CONSTRAINT "Extraction_crawlPageId_fkey" FOREIGN KEY ("crawlPageId") REFERENCES "CrawlPage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contact" ADD CONSTRAINT "Contact_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;
