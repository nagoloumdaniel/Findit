import type { PrismaClient } from "@findit/database";
import { describe, expect, it, vi } from "vitest";

import { registerDiscoveryFromUrl } from "./register-discovery.js";

/** Faux Prisma : une seule ligne de connecteur, et de quoi compter les écritures. */
const prismaWith = (
  connectorPresent: boolean,
  sourceAlreadyKnown = false,
): { readonly prisma: PrismaClient; readonly upserts: string[] } => {
  const upserts: string[] = [];
  const prisma = {
    connector: {
      findUnique: vi
        .fn()
        .mockResolvedValue(
          connectorPresent ? { id: "connector-1", accessStatus: "PUBLIC_FEED" } : null,
        ),
    },
    company: {
      upsert: vi.fn().mockImplementation(() => {
        upserts.push("company");
        return Promise.resolve({ id: "company-1" });
      }),
    },
    companySource: {
      findUnique: vi.fn().mockResolvedValue(sourceAlreadyKnown ? { id: "source-1" } : null),
      upsert: vi.fn().mockImplementation(() => {
        upserts.push("companySource");
        return Promise.resolve({});
      }),
    },
  } as unknown as PrismaClient;

  return { prisma, upserts };
};

describe("registerDiscoveryFromUrl", () => {
  it("enregistre une entreprise d'ATS à jeton et rend sa phrase", async () => {
    const { prisma, upserts } = prismaWith(true);

    await expect(
      registerDiscoveryFromUrl(prisma, "https://job-boards.greenhouse.io/acme/jobs/4606134004"),
    ).resolves.toBe("greenhouse/acme");
    expect(upserts).toEqual(["company", "companySource"]);
  });

  it("n'annonce rien pour une source déjà connue, mais la met à jour", async () => {
    const { prisma, upserts } = prismaWith(true, true);

    await expect(
      registerDiscoveryFromUrl(prisma, "https://job-boards.greenhouse.io/acme/jobs/4606134004"),
    ).resolves.toBeNull();
    expect(upserts).toEqual(["company", "companySource"]);
  });

  it("n'enregistre rien pour Workable, qui collecte par requête et non par entreprise", async () => {
    const { prisma, upserts } = prismaWith(true);

    await expect(
      registerDiscoveryFromUrl(prisma, "https://apply.workable.com/huzzle/j/CD16BBB82C/"),
    ).resolves.toBeNull();
    expect(upserts).toEqual([]);
  });

  it("n'enregistre rien pour un site carrière inconnu", async () => {
    const { prisma, upserts } = prismaWith(true);

    await expect(
      registerDiscoveryFromUrl(prisma, "https://careers.acme.example/jobs/1"),
    ).resolves.toBeNull();
    expect(upserts).toEqual([]);
  });

  it("n'enregistre rien quand le connecteur n'a pas de ligne au registre", async () => {
    const { prisma, upserts } = prismaWith(false);

    await expect(
      registerDiscoveryFromUrl(prisma, "https://jobs.lever.co/theodo"),
    ).resolves.toBeNull();
    expect(upserts).toEqual([]);
  });

  it("rend null sans jeter sur une URL illisible", async () => {
    const { prisma } = prismaWith(true);

    await expect(registerDiscoveryFromUrl(prisma, "pas une url")).resolves.toBeNull();
  });
});
