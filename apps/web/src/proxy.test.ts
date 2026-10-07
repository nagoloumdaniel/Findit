import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import proxy, { config } from "./proxy";
import { SESSION_COOKIE, createSessionToken } from "./lib/session";

/*
 * Le POURQUOI de ce test : le 2026-10-07, le site en ligne laissait `/dashboard`,
 * `/dashboard/logs`, `/dashboard/config` et `/dashboard/crawls` répondre 200 sans
 * mot de passe. Un défaut de garde ne se voit pas dans le code, il se voit à
 * l'usage — donc il se teste ici : les chemins couverts, la redirection sans
 * session, et le laissez-passer avec une session valide.
 */

const SECRET = "0123456789abcdef0123456789abcdef";
const PASSWORD = "mot-de-passe-de-test";

const request = (path: string, cookie?: string): NextRequest =>
  new NextRequest(new URL(`http://localhost:3100${path}`), {
    headers: cookie === undefined ? {} : { cookie },
  });

describe("proxy", () => {
  beforeEach(() => {
    process.env.SESSION_SECRET = SECRET;
    process.env.PROFILE_PASSWORD = PASSWORD;
  });

  afterEach(() => {
    delete process.env.SESSION_SECRET;
    delete process.env.PROFILE_PASSWORD;
  });

  it("couvre l'espace personnel ET le dashboard d'exploitation", () => {
    // Ce que le matcher ne couvre pas répond 200 : c'est la garantie qui manquait.
    for (const path of ["/moi", "/dashboard", "/dashboard/logs", "/dashboard/config"]) {
      const covered = config.matcher.some((pattern) =>
        pattern.endsWith("/:path*")
          ? path === pattern.replace("/:path*", "") ||
            path.startsWith(`${pattern.replace("/:path*", "")}/`)
          : path === pattern,
      );
      expect(covered, `${path} doit être couvert par la garde`).toBe(true);
    }
  });

  it("renvoie vers la connexion sans session", async () => {
    const response = await proxy(request("/dashboard/logs"));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toContain("/connexion");
  });

  it("laisse passer le dashboard avec une session valide", async () => {
    const token = await createSessionToken();
    const response = await proxy(request("/dashboard", `${SESSION_COOKIE}=${token}`));

    expect(response.headers.get("location")).toBeNull();
  });

  it("laisse tout passer quand rien n'est configuré, sans boucle", async () => {
    delete process.env.PROFILE_PASSWORD;
    const response = await proxy(request("/moi"));

    expect(response.headers.get("location")).toBeNull();
  });
});
