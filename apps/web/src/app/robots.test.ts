import { afterEach, describe, expect, it, vi } from "vitest";

import { PRIVATE_PATHS, siteUrl } from "../lib/site";

import manifest from "./manifest";
import robots from "./robots";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("siteUrl", () => {
  it("defaults to the production deployment", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "");
    expect(siteUrl()).toBe("https://finditfr.vercel.app");
  });

  it("honours an override and strips the trailing slash", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://exemple.test/");
    expect(siteUrl()).toBe("https://exemple.test");
  });
});

describe("robots", () => {
  it("keeps private areas out of crawlers and announces the sitemap", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://exemple.test");
    const result = robots();
    const rule = Array.isArray(result.rules) ? result.rules[0] : result.rules;

    expect(rule?.allow).toBe("/");
    expect(rule?.disallow).toEqual([...PRIVATE_PATHS]);
    expect(PRIVATE_PATHS).toEqual(expect.arrayContaining(["/moi", "/dashboard", "/login"]));
    expect(result.sitemap).toBe("https://exemple.test/sitemap.xml");
  });
});

describe("manifest", () => {
  it("declares the product name and a versioned icon", () => {
    const result = manifest();
    expect(result.name).toBe("Findit");
    expect(result.icons?.[0]?.src).toBe("/logoblanc.png");
  });
});
