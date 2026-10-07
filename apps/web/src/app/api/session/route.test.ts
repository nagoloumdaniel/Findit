import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { DELETE, POST } from "./route";

const PASSWORD = "mot-de-passe-de-test";
const SECRET = "0123456789abcdef0123456789abcdef";

const post = (body: unknown): Promise<Response> =>
  POST(
    new Request("http://localhost/api/session", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );

describe("route /api/session", () => {
  beforeEach(() => {
    process.env.PROFILE_PASSWORD = PASSWORD;
    process.env.SESSION_SECRET = SECRET;
  });

  afterEach(() => {
    delete process.env.PROFILE_PASSWORD;
    delete process.env.SESSION_SECRET;
  });

  it("répond 503 quand l'espace personnel n'est pas configuré", async () => {
    delete process.env.PROFILE_PASSWORD;

    const response = await post({ password: PASSWORD });

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ error: "espace personnel non configuré" });
  });

  it("répond 401 quand le mot de passe ne correspond pas", async () => {
    const response = await post({ password: "mauvais" });

    expect(response.status).toBe(401);
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("répond 204 et pose un cookie de session quand le mot de passe correspond", async () => {
    const response = await post({ password: PASSWORD });

    expect(response.status).toBe(204);
    const cookie = response.headers.get("set-cookie") ?? "";
    expect(cookie).toContain("findit_session=");
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=lax");
    expect(cookie).toContain("Max-Age=2592000");
    expect(cookie).toContain("Path=/");
  });

  it("efface le cookie à la déconnexion", () => {
    const response = DELETE();

    expect(response.status).toBe(204);
    const cookie = response.headers.get("set-cookie") ?? "";
    expect(cookie).toContain("findit_session=");
    expect(cookie).toContain("Max-Age=0");
  });
});
