-- Élargissement du profil candidat : formations, certifications, projets et
-- préférences de contrat. Migration purement additive : aucune colonne n'est
-- modifiée ni supprimée, et les valeurs par défaut laissent le profil existant
-- intact (tableaux vides).

ALTER TABLE "Profile" ADD COLUMN "education" JSONB NOT NULL DEFAULT '[]';
ALTER TABLE "Profile" ADD COLUMN "certifications" JSONB NOT NULL DEFAULT '[]';
ALTER TABLE "Profile" ADD COLUMN "projects" JSONB NOT NULL DEFAULT '[]';
ALTER TABLE "Profile" ADD COLUMN "preferredContracts" TEXT[] DEFAULT ARRAY[]::TEXT[];
