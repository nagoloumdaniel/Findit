-- Workable rejoint les ATS connus.
--
-- Sa vérification du 2026-07-17 l'a trouvé ouvert : « Disallow: » vide, et un
-- content signal qui accorde `ai-input`. Voir docs/legal-compliance.md.
--
-- Purement additif : aucune valeur retirée, aucune ligne invalidée.

ALTER TYPE "AtsKind" ADD VALUE IF NOT EXISTS 'WORKABLE';
