import { existsSync } from "node:fs";
import { dirname, join, parse } from "node:path";
import { fileURLToPath } from "node:url";

import { config } from "dotenv";

/*
 * Le dépôt tient un seul `.env`, à sa racine. Les processus, eux, démarrent
 * depuis leur propre paquet : sans chemin explicite, dotenv chercherait le
 * fichier dans le dossier courant et ne le trouverait jamais.
 *
 * La racine est reconnue au fichier qui la définit plutôt que comptée en
 * « ../.. » : si ce paquet est déplacé, la recherche suit au lieu de casser en
 * silence.
 */
const WORKSPACE_MARKER = "pnpm-workspace.yaml";

const findRepoRoot = (startDir: string): string | null => {
  const { root } = parse(startDir);
  let current = startDir;

  for (;;) {
    if (existsSync(join(current, WORKSPACE_MARKER))) {
      return current;
    }

    if (current === root) {
      return null;
    }

    current = dirname(current);
  }
};

/**
 * Charge le `.env` de la racine dans `process.env`, s'il existe. Rend le chemin
 * lu, ou `null` si aucun fichier n'a été trouvé — l'absence n'est pas une
 * erreur : en production, les variables viennent de l'environnement, pas d'un
 * fichier.
 *
 * Une variable déjà présente n'est jamais écrasée. Ce qui vient du terminal ou
 * de l'orchestrateur reste prioritaire sur le fichier local.
 */
export const loadRootEnv = (): string | null => {
  const repoRoot = findRepoRoot(dirname(fileURLToPath(import.meta.url)));
  if (repoRoot === null) {
    return null;
  }

  const envPath = join(repoRoot, ".env");
  if (!existsSync(envPath)) {
    return null;
  }

  config({ path: envPath });
  return envPath;
};
