/*
 * Session de l'espace personnel : un mot de passe unique côté serveur
 * (`PROFILE_PASSWORD`) est échangé contre un cookie signé.
 *
 * Le POURQUOI : le projet n'a aucune authentification, et un compte par personne
 * serait disproportionné pour un espace personnel. Le cookie ne porte aucune
 * donnée personnelle - seulement une échéance - et il est signé en HMAC-SHA-256
 * avec `SESSION_SECRET`. Sans le secret, on ne peut ni forger un cookie ni
 * prolonger une échéance.
 *
 * Module réservé au serveur (middleware et route handler) : il lit
 * `SESSION_SECRET`, qui ne doit jamais atteindre le navigateur. Aucune
 * dépendance nouvelle : Web Crypto (`crypto.subtle`) est fourni par le runtime,
 * aussi bien en Node.js que dans le runtime du middleware.
 */

export const SESSION_COOKIE = "findit_session";

/** Durée de vie du jeton et du cookie : 30 jours. */
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

const encoder = new TextEncoder();

/** Base64 URL sans remplissage : un cookie ne doit contenir que des caractères sûrs. */
const base64UrlEncode = (bytes: ArrayBuffer): string => {
  let binary = "";
  for (const byte of new Uint8Array(bytes)) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/gu, "-").replace(/\//gu, "_").replace(/=+$/u, "");
};

const base64UrlDecode = (value: string): Uint8Array<ArrayBuffer> => {
  const base64 = value.replace(/-/gu, "+").replace(/_/gu, "/");
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
};

const importKey = (secret: string): Promise<CryptoKey> =>
  crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
    "verify",
  ]);

/**
 * Matériau de signature : le secret de session **et** le mot de passe.
 *
 * Le POURQUOI du second terme : un jeton signé du seul `SESSION_SECRET` resterait
 * valide 30 jours même après un changement de mot de passe — un mot de passe
 * qu'on change parce qu'il a fuité n'aurait alors rien révoqué. En dérivant la clé
 * des deux, changer l'un ou l'autre invalide immédiatement tous les cookies émis.
 *
 * Lu à chaque appel : un test peut le changer sans recharger le module, et un
 * secret absent reste absent (aucune valeur par défaut ne doit signer des
 * cookies).
 */
const signingMaterial = (): string | undefined => {
  const secret = process.env.SESSION_SECRET;
  if (secret === undefined || secret === "") {
    return undefined;
  }

  const password = process.env.PROFILE_PASSWORD ?? "";
  return `${secret}:${password}`;
};

/**
 * Signe un jeton d'expiration. Le contenu est l'échéance en millisecondes, en
 * clair : la signature ne cache rien, elle empêche de la modifier.
 */
export const createSessionToken = async (now: Date = new Date()): Promise<string> => {
  const secret = signingMaterial();
  if (secret === undefined) {
    throw new Error("SESSION_SECRET n'est pas configuré : aucun cookie ne peut être signé.");
  }

  const expiresAt = String(now.getTime() + SESSION_TTL_MS);
  const signature = await crypto.subtle.sign(
    "HMAC",
    await importKey(secret),
    encoder.encode(expiresAt),
  );

  return `${expiresAt}.${base64UrlEncode(signature)}`;
};

/**
 * Vrai seulement si la signature est valide **et** l'échéance future. Une erreur
 * de format n'est pas une exception : un cookie illisible est un cookie invalide.
 */
export const isValidSessionToken = async (
  token: string | undefined,
  now: Date = new Date(),
): Promise<boolean> => {
  if (token === undefined || token === "") {
    return false;
  }

  const secret = signingMaterial();
  if (secret === undefined) {
    return false;
  }

  const separator = token.indexOf(".");
  if (separator <= 0) {
    return false;
  }

  const expiresAt = token.slice(0, separator);
  const expiresMs = Number(expiresAt);
  if (!Number.isFinite(expiresMs) || expiresMs <= now.getTime()) {
    return false;
  }

  let signature: Uint8Array<ArrayBuffer>;
  try {
    signature = base64UrlDecode(token.slice(separator + 1));
  } catch {
    return false;
  }

  /*
   * `crypto.subtle.verify` compare la signature dans l'implémentation
   * cryptographique, sans arrêt anticipé sur le premier octet différent -
   * contrairement à une comparaison `===` sur la chaîne.
   */
  return crypto.subtle.verify(
    "HMAC",
    await importKey(secret),
    signature,
    encoder.encode(expiresAt),
  );
};
