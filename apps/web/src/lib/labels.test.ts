import { describe, expect, it } from "vitest";

import { publishedAgo, qualityLabel } from "./labels";

describe("publishedAgo", () => {
  const now = new Date("2026-07-17T12:00:00.000Z");
  const ago = (minutes: number): string =>
    publishedAgo(new Date(now.getTime() - minutes * 60000).toISOString(), now);

  it("reads freshly published offers in minutes then hours", () => {
    expect(ago(0)).toBe("à l'instant");
    expect(ago(5)).toBe("il y a 5 min");
    expect(ago(59)).toBe("il y a 59 min");
    expect(ago(60)).toBe("il y a 1 h");
    expect(ago(23 * 60)).toBe("il y a 23 h");
  });

  it("switches to days at the day boundary", () => {
    expect(ago(24 * 60)).toBe("hier");
    expect(ago(48 * 60)).toBe("il y a 2 jours");
  });

  it("rounds down, so an offer is never announced fresher than it is", () => {
    expect(ago(119)).toBe("il y a 1 h");
    expect(ago(47 * 60 + 59)).toBe("hier");
  });
});

describe("qualityLabel", () => {
  it("follows the specification thresholds", () => {
    expect(qualityLabel(100)).toBe("Source très fiable");
    expect(qualityLabel(85)).toBe("Source très fiable");
    expect(qualityLabel(84)).toBe("Source fiable");
    expect(qualityLabel(70)).toBe("Source fiable");
    expect(qualityLabel(69)).toBe("Informations partielles");
  });
});
