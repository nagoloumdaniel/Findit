-- Valeur brute de contrat conservée pour audit (§7.1) : le libellé tel que la
-- source l'a écrit (« CDI », « Apprenticeship »), à côté du type normalisé.
-- Nullable : une offre dont la source ne fournit pas de libellé reste stockable.
ALTER TABLE "Job" ADD COLUMN "contractTypeRaw" TEXT;
