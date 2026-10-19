-- Isolation des données par utilisateur : chaque CV, favori et profil porte
-- désormais un propriétaire. Les lignes historiques gardent `ownerId` nul.
DROP INDEX "Favorite_jobId_key";
ALTER TABLE "Favorite" ADD COLUMN "ownerId" TEXT;
ALTER TABLE "Favorite" ADD CONSTRAINT "Favorite_ownerId_fkey"
  FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE UNIQUE INDEX "Favorite_jobId_ownerId_key" ON "Favorite"("jobId", "ownerId");
CREATE INDEX "Favorite_ownerId_idx" ON "Favorite"("ownerId");

ALTER TABLE "Resume" ADD COLUMN "ownerId" TEXT;
ALTER TABLE "Resume" ADD CONSTRAINT "Resume_ownerId_fkey"
  FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE INDEX "Resume_ownerId_idx" ON "Resume"("ownerId");

ALTER TABLE "Profile" ADD COLUMN "ownerId" TEXT;
ALTER TABLE "Profile" ADD CONSTRAINT "Profile_ownerId_fkey"
  FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE UNIQUE INDEX "Profile_ownerId_key" ON "Profile"("ownerId");
