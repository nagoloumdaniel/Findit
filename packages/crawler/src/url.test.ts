import { describe, expect, it } from "vitest";

import { CrawlConfigError } from "./types.js";
import { normalizeUrl, sameOrigin, tryResolveLink } from "./url.js";

describe("normalizeUrl", () => {
  it("résout une URL relative contre sa base", () => {
    expect(normalizeUrl("/a/b", "https://example.com/liste/")).toBe("https://example.com/a/b");
  });

  it("retire le fragment sans changer la ressource", () => {
    expect(normalizeUrl("https://example.com/a#section")).toBe("https://example.com/a");
  });

  it("rejette ce qui n'est pas http(s)", () => {
    expect(() => normalizeUrl("ftp://example.com/a")).toThrow(CrawlConfigError);
    expect(() => normalizeUrl("mailto:x@example.com")).toThrow(CrawlConfigError);
  });

  it("rejette une adresse mal formée", () => {
    expect(() => normalizeUrl("https://")).toThrow(CrawlConfigError);
  });
});

describe("tryResolveLink", () => {
  it("rend null pour un lien hors de portée au lieu de lever", () => {
    expect(tryResolveLink("javascript:void(0)", "https://example.com/")).toBeNull();
    expect(tryResolveLink("mailto:x@example.com", "https://example.com/")).toBeNull();
    expect(tryResolveLink("ftp://example.com/a", "https://example.com/")).toBeNull();
  });
});

describe("sameOrigin", () => {
  it("compare protocole, hôte et port", () => {
    expect(sameOrigin(new URL("https://example.com/a"), new URL("https://example.com/b"))).toBe(
      true,
    );
    expect(sameOrigin(new URL("https://example.com/a"), new URL("http://example.com/a"))).toBe(
      false,
    );
    expect(sameOrigin(new URL("https://example.com/a"), new URL("https://autre.com/a"))).toBe(
      false,
    );
  });
});
