-- CV source privé du propriétaire, et TXT ajouté aux formats. Additif.

ALTER TYPE "ResumeFileType" ADD VALUE IF NOT EXISTS 'TXT';

CREATE TABLE "SourceResume" (
    "id" TEXT NOT NULL,
    "fileType" "ResumeFileType" NOT NULL,
    "originalFileName" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "contentHash" TEXT NOT NULL,
    "extractedText" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "SourceResume_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SourceResume_contentHash_key" ON "SourceResume"("contentHash");
CREATE INDEX "SourceResume_createdAt_idx" ON "SourceResume"("createdAt");
