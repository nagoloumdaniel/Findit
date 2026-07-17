-- Notifications Telegram : idempotence des alertes de nouvelles offres.
-- Aucun secret n'est stocké ici. Purement additif.

CREATE TYPE "NotificationType" AS ENUM ('NEW_JOB', 'APPLICATION_REMINDER');
CREATE TYPE "NotificationStatus" AS ENUM ('SENT', 'FAILED', 'SKIPPED');

CREATE TABLE "TelegramJobNotification" (
    "id" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "chatId" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL,
    "jobId" TEXT NOT NULL,
    "status" "NotificationStatus" NOT NULL,
    "detail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" TIMESTAMP(3),
    CONSTRAINT "TelegramJobNotification_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TelegramJobNotification_idempotencyKey_key" ON "TelegramJobNotification"("idempotencyKey");
CREATE INDEX "TelegramJobNotification_type_createdAt_idx" ON "TelegramJobNotification"("type", "createdAt");
CREATE INDEX "TelegramJobNotification_jobId_idx" ON "TelegramJobNotification"("jobId");

ALTER TABLE "TelegramJobNotification" ADD CONSTRAINT "TelegramJobNotification_jobId_fkey"
  FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;
