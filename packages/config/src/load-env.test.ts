import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it } from "vitest";

import { loadRootEnv } from "./load-env.js";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const envPath = join(repoRoot, ".env");

describe("loadRootEnv", () => {
  const original = { ...process.env };

  afterEach(() => {
    process.env = { ...original };
  });

  it("finds the repository root from wherever this package sits", () => {
    expect(existsSync(join(repoRoot, "pnpm-workspace.yaml"))).toBe(true);
  });

  it("reports the file it read, or nothing when there is none to read", () => {
    const loaded = loadRootEnv();

    if (existsSync(envPath)) {
      expect(loaded).toBe(envPath);
    } else {
      expect(loaded).toBeNull();
    }
  });

  it("puts the file's variables within reach of the schemas", () => {
    if (!existsSync(envPath)) {
      // Sans fichier local, il n'y a rien à charger : le cas est couvert
      // au-dessus.
      return;
    }

    const declared = readFileSync(envPath, "utf8")
      .split(/\r?\n/)
      .map((line) => line.split("=")[0]?.trim())
      .filter((name): name is string => name !== undefined && name !== "" && !name.startsWith("#"));

    delete process.env["DATABASE_URL"];
    loadRootEnv();

    expect(declared).toContain("DATABASE_URL");
    expect(process.env["DATABASE_URL"]).toBeDefined();
  });

  it("leaves a variable already set by the terminal alone", () => {
    process.env["DATABASE_URL"] = "postgresql://depuis-le-terminal:5432/findit";

    loadRootEnv();

    expect(process.env["DATABASE_URL"]).toBe("postgresql://depuis-le-terminal:5432/findit");
  });
});
