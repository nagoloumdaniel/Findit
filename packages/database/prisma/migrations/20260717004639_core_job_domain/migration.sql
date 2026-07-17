-- CreateEnum
CREATE TYPE "ContractType" AS ENUM ('ALTERNANCE', 'INTERNSHIP');

-- CreateEnum
CREATE TYPE "RoleCategory" AS ENUM ('FRONTEND', 'BACKEND', 'FULLSTACK', 'MOBILE', 'DATA_ANALYST', 'DATA_ENGINEER');

-- CreateEnum
CREATE TYPE "WorkMode" AS ENUM ('ONSITE', 'HYBRID', 'REMOTE');

-- CreateEnum
CREATE TYPE "SalaryPeriod" AS ENUM ('HOUR', 'MONTH', 'YEAR');

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('DISCOVERED', 'FETCHED', 'NORMALIZED', 'VALIDATED', 'QUARANTINED', 'REJECTED', 'DUPLICATE', 'PUBLISHED', 'EXPIRED', 'SOURCE_UNAVAILABLE');

-- CreateEnum
CREATE TYPE "SkillKind" AS ENUM ('PROGRAMMING_LANGUAGE', 'FRAMEWORK', 'DATABASE', 'CLOUD_TOOL', 'DEV_TOOL', 'SOFT_SKILL', 'LANGUAGE');

-- CreateEnum
CREATE TYPE "SkillRequirement" AS ENUM ('REQUIRED', 'PREFERRED');

-- CreateTable
CREATE TABLE "Company" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "normalizedName" TEXT NOT NULL,
    "website" TEXT,
    "careerUrl" TEXT,
    "logoUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Company_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Job" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "normalizedTitle" TEXT NOT NULL,
    "roleCategory" "RoleCategory" NOT NULL,
    "companyId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "responsibilities" TEXT[],
    "requirements" TEXT[],
    "benefits" TEXT[],
    "contractType" "ContractType" NOT NULL,
    "workMode" "WorkMode" NOT NULL,
    "city" TEXT NOT NULL,
    "departmentCode" TEXT NOT NULL,
    "postalCode" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "salaryMin" INTEGER,
    "salaryMax" INTEGER,
    "salaryPeriod" "SalaryPeriod",
    "salaryText" TEXT,
    "studyLevel" TEXT,
    "startDate" TIMESTAMP(3),
    "duration" TEXT,
    "publishedAt" TIMESTAMP(3) NOT NULL,
    "firstSeenAt" TIMESTAMP(3) NOT NULL,
    "lastSeenAt" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "canonicalUrl" TEXT NOT NULL,
    "applyUrl" TEXT,
    "externalId" TEXT,
    "requisitionId" TEXT,
    "duplicateGroupId" TEXT,
    "duplicateConfidence" DOUBLE PRECISION,
    "schoolRiskScore" INTEGER NOT NULL,
    "schoolRiskReasons" TEXT[],
    "fraudRiskScore" INTEGER NOT NULL,
    "fraudRiskReasons" TEXT[],
    "dataQualityScore" INTEGER NOT NULL,
    "confidenceScore" INTEGER NOT NULL,
    "status" "JobStatus" NOT NULL,

    CONSTRAINT "Job_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobSource" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "priority" INTEGER NOT NULL,
    "checkedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JobSource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Skill" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "SkillKind" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Skill_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobSkill" (
    "jobId" TEXT NOT NULL,
    "skillId" TEXT NOT NULL,
    "requirement" "SkillRequirement" NOT NULL,

    CONSTRAINT "JobSkill_pkey" PRIMARY KEY ("jobId","skillId")
);

-- CreateIndex
CREATE UNIQUE INDEX "Company_slug_key" ON "Company"("slug");

-- CreateIndex
CREATE INDEX "Company_normalizedName_idx" ON "Company"("normalizedName");

-- CreateIndex
CREATE UNIQUE INDEX "Job_slug_key" ON "Job"("slug");

-- CreateIndex
CREATE INDEX "Job_status_publishedAt_idx" ON "Job"("status", "publishedAt");

-- CreateIndex
CREATE INDEX "Job_status_roleCategory_publishedAt_idx" ON "Job"("status", "roleCategory", "publishedAt");

-- CreateIndex
CREATE INDEX "Job_status_departmentCode_publishedAt_idx" ON "Job"("status", "departmentCode", "publishedAt");

-- CreateIndex
CREATE INDEX "Job_status_contractType_publishedAt_idx" ON "Job"("status", "contractType", "publishedAt");

-- CreateIndex
CREATE INDEX "Job_status_expiresAt_idx" ON "Job"("status", "expiresAt");

-- CreateIndex
CREATE INDEX "Job_duplicateGroupId_idx" ON "Job"("duplicateGroupId");

-- CreateIndex
CREATE INDEX "Job_normalizedTitle_idx" ON "Job"("normalizedTitle");

-- CreateIndex
CREATE UNIQUE INDEX "Job_companyId_externalId_key" ON "Job"("companyId", "externalId");

-- CreateIndex
CREATE INDEX "JobSource_jobId_priority_idx" ON "JobSource"("jobId", "priority");

-- CreateIndex
CREATE UNIQUE INDEX "JobSource_jobId_url_key" ON "JobSource"("jobId", "url");

-- CreateIndex
CREATE UNIQUE INDEX "Skill_slug_key" ON "Skill"("slug");

-- CreateIndex
CREATE INDEX "Skill_kind_idx" ON "Skill"("kind");

-- CreateIndex
CREATE INDEX "JobSkill_skillId_idx" ON "JobSkill"("skillId");

-- AddForeignKey
ALTER TABLE "Job" ADD CONSTRAINT "Job_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobSource" ADD CONSTRAINT "JobSource_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobSkill" ADD CONSTRAINT "JobSkill_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobSkill" ADD CONSTRAINT "JobSkill_skillId_fkey" FOREIGN KEY ("skillId") REFERENCES "Skill"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Extension de similarité sémantique, requise par les étapes de déduplication
-- et de correspondance. Aucune colonne vector n'existe tant qu'aucun embedding
-- n'est produit.
CREATE EXTENSION IF NOT EXISTS vector;

-- Les règles métier ci-dessous sont tenues par la base et pas seulement par le
-- code applicatif : une écriture par un worker, une reprise manuelle ou un
-- script de correction ne peuvent pas les contourner.

-- Périmètre géographique : Île-de-France uniquement.
ALTER TABLE "Job" ADD CONSTRAINT "Job_departmentCode_ile_de_france"
  CHECK ("departmentCode" IN ('75', '77', '78', '91', '92', '93', '94', '95'));

-- Une offre ne peut jamais survivre au-delà de 72 h après sa publication. Une
-- source annonçant une fin plus proche reste acceptée.
ALTER TABLE "Job" ADD CONSTRAINT "Job_expiresAt_within_72h"
  CHECK ("expiresAt" <= "publishedAt" + INTERVAL '72 hours');

-- Une offre ne peut pas avoir été vue avant d'avoir été vue la première fois.
ALTER TABLE "Job" ADD CONSTRAINT "Job_lastSeenAt_after_firstSeenAt"
  CHECK ("lastSeenAt" >= "firstSeenAt");

-- Les scores sont exprimés sur 100.
ALTER TABLE "Job" ADD CONSTRAINT "Job_scores_within_range"
  CHECK (
    "schoolRiskScore" BETWEEN 0 AND 100
    AND "fraudRiskScore" BETWEEN 0 AND 100
    AND "dataQualityScore" BETWEEN 0 AND 100
    AND "confidenceScore" BETWEEN 0 AND 100
  );

-- La confiance de déduplication est une probabilité.
ALTER TABLE "Job" ADD CONSTRAINT "Job_duplicateConfidence_within_range"
  CHECK ("duplicateConfidence" IS NULL OR "duplicateConfidence" BETWEEN 0 AND 1);

-- Une fourchette de rémunération doit être ordonnée.
ALTER TABLE "Job" ADD CONSTRAINT "Job_salary_range_ordered"
  CHECK ("salaryMin" IS NULL OR "salaryMax" IS NULL OR "salaryMin" <= "salaryMax");

-- Le rang d'une source ne peut pas être négatif.
ALTER TABLE "JobSource" ADD CONSTRAINT "JobSource_priority_not_negative"
  CHECK ("priority" >= 0);
