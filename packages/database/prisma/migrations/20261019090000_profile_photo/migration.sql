-- Photo de profil, en data URL : aucun stockage de fichier séparé n'est requis.
ALTER TABLE "Profile" ADD COLUMN "photoUrl" TEXT;
