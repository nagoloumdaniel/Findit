import { timingSafeEqual } from "node:crypto";

/**
 * Nom de l'en-tête qui porte la clé de l'espace privé.
 */
export const WORKSPACE_KEY_HEADER = "x-workspace-key";

/**
 * La clé fournie correspond-elle au secret ?
 *
 * La comparaison est à **temps constant** : une comparaison caractère par
 * caractère qui s'arrête au premier écart laisserait deviner le secret par la
 * mesure du temps de réponse. `timingSafeEqual` exige des tampons de même
 * longueur, d'où le contrôle de longueur préalable — il révèle la longueur du
 * secret, ce qui est un compromis admis et usuel.
 *
 * Une clé absente ou un secret vide ne correspondent jamais : l'espace privé
 * refuse par défaut.
 */
export const workspaceKeyMatches = (provided: string | undefined, secret: string): boolean => {
  if (provided === undefined || provided === "" || secret === "") {
    return false;
  }

  const a = Buffer.from(provided, "utf8");
  const b = Buffer.from(secret, "utf8");

  if (a.length !== b.length) {
    return false;
  }

  return timingSafeEqual(a, b);
};
