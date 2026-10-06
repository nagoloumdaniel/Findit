-- Coût de chaque exécution de connecteur (TASK-305, plafond de dépense).
--
-- Entier en micro-dollars (5 $ = 5 000 000) : pas d'erreur d'arrondi quand on
-- additionne des milliers de petits coûts. Zéro pour les sources gratuites,
-- donc toutes les lignes existantes restent valides.
--
-- Purement additif : une colonne avec valeur par défaut, rien de retiré.

ALTER TABLE "ConnectorRun" ADD COLUMN "costMicroUsd" INTEGER NOT NULL DEFAULT 0;
