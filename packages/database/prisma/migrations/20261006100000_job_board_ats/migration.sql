-- Les job boards rejoignent les sources connues.
--
-- Ce ne sont pas des ATS d'entreprise : LinkedIn, Welcome to the Jungle,
-- HelloWork, Glassdoor et Indeed sont lus par un fournisseur de scraping, sous
-- le regime OWNER_ACCEPTED_SCRAPING. Voir docs/legal-compliance.md.
--
-- Purement additif : aucune valeur retiree, aucune ligne invalidee.

ALTER TYPE "AtsKind" ADD VALUE IF NOT EXISTS 'JOB_BOARD';
