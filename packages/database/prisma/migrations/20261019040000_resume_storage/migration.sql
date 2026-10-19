-- Stockage des CV importés : métadonnées, texte extrait et faits structurés,
-- pour permettre plusieurs versions et le choix d'un CV de référence (§10.2).
CREATE TABLE "Resume" (
    "id" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileType" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "contentHash" TEXT NOT NULL,
    "extractedText" TEXT NOT NULL,
    "structuredFacts" JSONB NOT NULL,
    "confidence" INTEGER NOT NULL,
    "warnings" TEXT[] NOT NULL DEFAULT '{}',
    "active" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Resume_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Resume_active_idx" ON "Resume"("active");
CREATE INDEX "Resume_createdAt_idx" ON "Resume"("createdAt");
