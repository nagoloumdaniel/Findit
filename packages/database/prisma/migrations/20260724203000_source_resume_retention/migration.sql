-- Retention effective des CV sources prives.
-- Les lignes existantes recoivent la retention par defaut historique de 24 h.

ALTER TABLE "SourceResume"
ADD COLUMN "expiresAt" TIMESTAMP(3);

UPDATE "SourceResume"
SET "expiresAt" = "createdAt" + INTERVAL '24 hours'
WHERE "expiresAt" IS NULL;

ALTER TABLE "SourceResume"
ALTER COLUMN "expiresAt" SET NOT NULL;

CREATE INDEX "SourceResume_expiresAt_idx" ON "SourceResume"("expiresAt");
