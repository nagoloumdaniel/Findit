import { describe, expect, it } from "vitest";

import { workspaceKeyMatches } from "./workspace-key.js";

const SECRET = "local-development-key-change-me-0001";

describe("workspaceKeyMatches", () => {
  it("accepts the exact secret", () => {
    expect(workspaceKeyMatches(SECRET, SECRET)).toBe(true);
  });

  it("refuses a wrong key", () => {
    expect(workspaceKeyMatches("mauvaise-cle", SECRET)).toBe(false);
  });

  it("refuses a key of the same length that differs", () => {
    const wrong = "x".repeat(SECRET.length);
    expect(workspaceKeyMatches(wrong, SECRET)).toBe(false);
  });

  it("refuses when the key is missing", () => {
    expect(workspaceKeyMatches(undefined, SECRET)).toBe(false);
    expect(workspaceKeyMatches("", SECRET)).toBe(false);
  });

  it("refuses everything when the secret is empty", () => {
    expect(workspaceKeyMatches("anything", "")).toBe(false);
    expect(workspaceKeyMatches("", "")).toBe(false);
  });

  it("refuses a prefix of the secret", () => {
    expect(workspaceKeyMatches(SECRET.slice(0, 10), SECRET)).toBe(false);
  });
});
