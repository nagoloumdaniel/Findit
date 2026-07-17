-- Deux catégories de développement s'ajoutent au périmètre.
--
-- L'opération est purement additive : aucune valeur existante n'est retirée ni
-- renommée, donc aucune offre déjà stockée ne devient invalide. MOBILE,
-- DATA_ANALYST et DATA_ENGINEER restent en base ; c'est le flux par défaut, tenu
-- par `@findit/shared`, qui décide de ne pas les montrer.

ALTER TYPE "RoleCategory" ADD VALUE IF NOT EXISTS 'SOFTWARE_ENGINEERING';
ALTER TYPE "RoleCategory" ADD VALUE IF NOT EXISTS 'OTHER_DEVELOPER';
