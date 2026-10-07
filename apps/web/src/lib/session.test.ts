import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { SESSION_COOKIE, createSessionToken, isValidSessionToken } from "./session";

const SECRET = "0123456789abcdef0123456789abcdef";

/** Remplace un caractère à une position donnée, sans changer la longueur. */
const withFlippedCharacter = (value: string, position: number): string => {
  const current = value[position] ?? "A";
  const replacement = current === "A" ? "B" : "A";
  return value.slice(0, position) + replacement + value.slice(position + 1);
};

describe("session", () => {
  beforeEach(() => {
    process.env.SESSION_SECRET = SECRET;
  });

  afterEach(() => {
    delete process.env.SESSION_SECRET;
  });

  it("expose le nom de cookie attendu par le reste du web", () => {
    expect(SESSION_COOKIE).toBe("findit_session");
  });

  it("accepte un jeton fraîchement signé", async () => {
    const token = await createSessionToken();

    await expect(isValidSessionToken(token)).resolves.toBe(true);
  });

  it("refuse un jeton expiré", async () => {
    const now = new Date("2026-01-01T00:00:00.000Z");
    const token = await createSessionToken(now);
    const later = new Date(now.getTime() + 31 * 24 * 60 * 60 * 1000);

    await expect(isValidSessionToken(token, later)).resolves.toBe(false);
  });

  it("refuse un jeton dont la signature est modifiée", async () => {
    const token = await createSessionToken();
    const signatureStart = token.indexOf(".") + 1;
    const tampered = withFlippedCharacter(token, signatureStart + 5);

    expect(tampered).not.toBe(token);
    await expect(isValidSessionToken(tampered)).resolves.toBe(false);
  });

  it("refuse une échéance prolongée sans nouvelle signature", async () => {
    const now = new Date("2026-01-01T00:00:00.000Z");
    const token = await createSessionToken(now);
    const separator = token.indexOf(".");
    const forgedExpiry = String(now.getTime() + 365 * 24 * 60 * 60 * 1000);
    const forged = `${forgedExpiry}${token.slice(separator)}`;

    await expect(isValidSessionToken(forged)).resolves.toBe(false);
  });

  it("refuse un jeton absent", async () => {
    await expect(isValidSessionToken(undefined)).resolves.toBe(false);
    await expect(isValidSessionToken("")).resolves.toBe(false);
  });

  it("refuse tout jeton quand le secret n'est pas configuré", async () => {
    const token = await createSessionToken();
    delete process.env.SESSION_SECRET;

    await expect(isValidSessionToken(token)).resolves.toBe(false);
    await expect(createSessionToken()).rejects.toThrow("SESSION_SECRET");
  });

  it("invalide les jetons existants quand le mot de passe change", async () => {
    // Un mot de passe qu'on change parce qu'il a fuité doit révoquer les sessions
    // déjà ouvertes : la signature engage donc aussi le mot de passe.
    process.env.PROFILE_PASSWORD = "premier-mot-de-passe";
    const token = await createSessionToken();
    await expect(isValidSessionToken(token)).resolves.toBe(true);

    process.env.PROFILE_PASSWORD = "second-mot-de-passe";
    await expect(isValidSessionToken(token)).resolves.toBe(false);

    delete process.env.PROFILE_PASSWORD;
  });
});
