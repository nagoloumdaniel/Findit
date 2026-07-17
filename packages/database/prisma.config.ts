import { fileURLToPath } from "node:url";

import { config } from "dotenv";
import { defineConfig, env } from "prisma/config";

/*
 * Le `.env` est tenu à la racine du dépôt, mais les commandes Prisma
 * s'exécutent depuis ce paquet. Sans chemin explicite, dotenv chercherait le
 * fichier dans le dossier courant et ne le trouverait pas. Une variable déjà
 * présente dans l'environnement reste prioritaire : dotenv n'écrase rien.
 */
config({ path: fileURLToPath(new URL("../../.env", import.meta.url)) });

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: env("DATABASE_URL"),
  },
});
