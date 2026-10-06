-- Journal des appels de modèle hors agent (matching CV, par exemple).
-- Le POURQUOI : ces appels dépensaient sans laisser de trace. AgentRun/AgentAction
-- sont réservés à l'agent, ConnectorRun aux connecteurs : cette table donne à ces
-- appels une ligne à eux, donc un coût mesurable.
CREATE TABLE "ModelCall" (
    "id" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "inputTokens" INTEGER NOT NULL DEFAULT 0,
    "outputTokens" INTEGER NOT NULL DEFAULT 0,
    "costMicroUsd" INTEGER NOT NULL DEFAULT 0,
    "correlationId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ModelCall_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ModelCall_purpose_createdAt_idx" ON "ModelCall"("purpose", "createdAt");
