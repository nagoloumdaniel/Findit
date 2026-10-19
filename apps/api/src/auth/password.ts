import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

/**
 * Hachage de mot de passe : scrypt avec un sel aléatoire, stocké « sel:empreinte ».
 * Le mot de passe en clair n'est jamais écrit ni journalisé ; seul ce hachage vit
 * en base.
 */
export const hashPassword = (password: string): string => {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
};

/**
 * Vérifie un mot de passe contre un hachage stocké, à temps constant. Une forme
 * inattendue (`sel:empreinte` absent) rend `false` : ce n'est jamais une
 * exception, seulement une identité non reconnue.
 */
export const verifyPassword = (password: string, stored: string): boolean => {
  const separator = stored.indexOf(":");
  if (separator <= 0) {
    return false;
  }
  const salt = stored.slice(0, separator);
  const expected = Buffer.from(stored.slice(separator + 1), "hex");
  const computed = scryptSync(password, salt, expected.length);
  return computed.length === expected.length && timingSafeEqual(computed, expected);
};
