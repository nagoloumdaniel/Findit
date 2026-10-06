import { describe, expect, it, vi } from "vitest";

import { resolveFinalUrl } from "./resolve.js";

/** Réponse minimale : `resolveFinalUrl` ne lit que `url`, `status` et `body`. */
const stub = (url: string, status = 200): Response =>
  ({ url, status, body: null }) as unknown as Response;

describe("resolveFinalUrl", () => {
  it("rend l'URL finale après redirection", async () => {
    const fetchStub = vi.fn().mockResolvedValue(stub("https://example.com/company/careers/"));

    const resolved = await resolveFinalUrl("https://example.com/carrieres", { fetch: fetchStub });

    expect(resolved).toBe("https://example.com/company/careers/");
    expect(fetchStub).toHaveBeenCalledOnce();
    expect(fetchStub.mock.calls[0]?.[1]).toMatchObject({ method: "HEAD", redirect: "follow" });
  });

  it("retombe sur une GET quand le serveur refuse HEAD", async () => {
    const fetchStub = vi
      .fn()
      .mockResolvedValueOnce(stub("https://example.com/carrieres", 405))
      .mockResolvedValueOnce(stub("https://example.com/company/careers/"));

    const resolved = await resolveFinalUrl("https://example.com/carrieres", { fetch: fetchStub });

    expect(resolved).toBe("https://example.com/company/careers/");
    expect(fetchStub).toHaveBeenCalledTimes(2);
    expect(fetchStub.mock.calls[1]?.[1]).toMatchObject({ method: "GET" });
  });

  it("rend null quand le réseau échoue, sans jeter", async () => {
    const fetchStub = vi.fn().mockRejectedValue(new Error("réseau"));

    await expect(
      resolveFinalUrl("https://example.com/carrieres", { fetch: fetchStub }),
    ).resolves.toBeNull();
  });

  it("rend l'URL demandée quand le serveur n'annonce pas d'URL finale", async () => {
    const fetchStub = vi.fn().mockResolvedValue(stub(""));

    await expect(
      resolveFinalUrl("https://example.com/carrieres", { fetch: fetchStub }),
    ).resolves.toBe("https://example.com/carrieres");
  });
});
