-- Nouveau regime d'acces : OWNER_ACCEPTED_SCRAPING.
--
-- Decision du proprietaire du 2026-10-05 : les job boards (LinkedIn, Welcome to
-- the Jungle, HelloWork, Glassdoor, Indeed...) sont collectes alors que leurs
-- conditions d'utilisation l'interdisent. Ce n'est pas une autorisation de la
-- source, donc ce n'est ni PUBLIC_FEED ni AUTHORIZED_CRAWL : un acces tolere ne
-- doit jamais etre presente comme un acces permis. Voir docs/legal-compliance.md.
--
-- Purement additif : aucune valeur retiree, aucune ligne invalidee.

ALTER TYPE "SourceAccessStatus" ADD VALUE IF NOT EXISTS 'OWNER_ACCEPTED_SCRAPING';
