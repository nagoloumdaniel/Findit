-- Marquage des offres dont la date de publication n'est pas fiable : elles
-- restent conservées mais sont exclues des résultats garantis comme récents.
ALTER TABLE "Job" ADD COLUMN "dateVerified" BOOLEAN NOT NULL DEFAULT true;
