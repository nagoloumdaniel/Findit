-- Élargissement du périmètre : six catégories de contrat et une fraîcheur
-- de cinq jours (120 h) au lieu de trois (72 h).
--
-- 1. Contrats : ajout de CDI, CDD, intérim et job étudiant. `ALTER TYPE ... ADD
--    VALUE` est autorisé hors transaction sur PostgreSQL 18 (Neon) : les
--    nouvelles valeurs ne sont pas encore lues dans cette même migration.
-- 2. Fraîcheur : la contrainte de contrôle qui plafonnait l'expiration à 72 h
--    est remplacée par un plafond à 120 h. La borne est tenue par la base, pas
--    seulement par le code applicatif.

ALTER TYPE "ContractType" ADD VALUE 'CDI';
ALTER TYPE "ContractType" ADD VALUE 'CDD';
ALTER TYPE "ContractType" ADD VALUE 'INTERIM';
ALTER TYPE "ContractType" ADD VALUE 'STUDENT_JOB';

-- Une offre ne peut jamais survivre au-delà de 120 h après sa publication.
ALTER TABLE "Job" DROP CONSTRAINT "Job_expiresAt_within_72h";
ALTER TABLE "Job" ADD CONSTRAINT "Job_expiresAt_within_120h"
  CHECK ("expiresAt" <= "publishedAt" + INTERVAL '120 hours');
