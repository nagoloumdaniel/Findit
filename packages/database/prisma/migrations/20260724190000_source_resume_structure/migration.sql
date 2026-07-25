-- Structure JSON des CV sources prives. Additif : les imports existants restent valides.

ALTER TABLE "SourceResume"
ADD COLUMN "structuredFacts" JSONB,
ADD COLUMN "structuredWarnings" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
ADD COLUMN "structuredConfidence" INTEGER,
ADD COLUMN "structuredAt" TIMESTAMP(3);

ALTER TABLE "SourceResume"
ADD CONSTRAINT "SourceResume_structuredConfidence_check"
CHECK (
  "structuredConfidence" IS NULL
  OR ("structuredConfidence" >= 0 AND "structuredConfidence" <= 100)
);

CREATE INDEX "SourceResume_structuredAt_idx" ON "SourceResume"("structuredAt");
