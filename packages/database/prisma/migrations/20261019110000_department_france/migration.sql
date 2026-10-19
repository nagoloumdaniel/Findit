-- La plateforme couvre toute la France : la contrainte de périmètre
-- géographique n'est plus limitée à l'Île-de-France.
ALTER TABLE "Job" DROP CONSTRAINT "Job_departmentCode_ile_de_france";
ALTER TABLE "Job" ADD CONSTRAINT "Job_departmentCode_france"
  CHECK ("departmentCode" ~ '^([0-9]{2}|2[AB]|97[1-6])$');
