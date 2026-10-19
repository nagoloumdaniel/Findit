-- Préférences de recherche structurées du profil : intitulés de poste cibles et
-- secteurs cibles. Libres et facultatifs : ils nourrissent le matching et les
-- filtres, jamais des contraintes bloquantes.
ALTER TABLE "Profile" ADD COLUMN "targetRoles" TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE "Profile" ADD COLUMN "targetSectors" TEXT[] NOT NULL DEFAULT '{}';
