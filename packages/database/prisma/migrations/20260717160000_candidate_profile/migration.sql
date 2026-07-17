-- Profil du propriétaire, pour l'espace privé. Un seul exemplaire, garanti par
-- l'unicité de `singleton`. Purement additif.

CREATE TABLE "CandidateProfile" (
    "id" TEXT NOT NULL,
    "singleton" TEXT NOT NULL DEFAULT 'owner',
    "fullName" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "city" TEXT,
    "targetRoles" TEXT[],
    "availability" TEXT,
    "studyProgram" TEXT,
    "school" TEXT,
    "workStudyRhythm" TEXT,
    "portfolioUrl" TEXT,
    "githubUrl" TEXT,
    "linkedinUrl" TEXT,
    "languages" JSONB NOT NULL DEFAULT '[]',
    "preferences" JSONB NOT NULL DEFAULT '{}',
    "activeResumeId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CandidateProfile_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CandidateProfile_singleton_key" ON "CandidateProfile"("singleton");
