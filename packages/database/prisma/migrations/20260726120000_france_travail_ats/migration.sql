-- France Travail rejoint les sources connues.
--
-- Ce n'est pas un ATS d'entreprise mais l'API officielle de l'Etat
-- (francetravail.io), sous inscription gratuite et jeton OAuth : le regime
-- d'acces le plus clair qui soit. Voir docs/legal-compliance.md.
--
-- Purement additif : aucune valeur retiree, aucune ligne invalidee.

ALTER TYPE "AtsKind" ADD VALUE IF NOT EXISTS 'FRANCE_TRAVAIL';
