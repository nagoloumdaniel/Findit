import { describe, expect, it, vi } from "vitest";

import { FavoritesService } from "./favorites.service.js";

const createPrisma = () => ({
  job: { findUnique: vi.fn().mockResolvedValue({ id: "job-1" }) },
  favorite: {
    findFirst: vi.fn().mockResolvedValue(null),
    create: vi.fn().mockResolvedValue({ id: "fav-1" }),
    delete: vi.fn().mockResolvedValue({ id: "fav-1" }),
    findMany: vi.fn().mockResolvedValue([]),
  },
});

describe("FavoritesService", () => {
  it("ajoute un favori rattaché à son propriétaire", async () => {
    const prisma = createPrisma();
    const service = new FavoritesService(prisma as never);

    const result = await service.toggle("dev-acme", "user-1");

    expect(result).toEqual({ favorited: true });
    expect(prisma.favorite.create).toHaveBeenCalledWith({
      data: { jobId: "job-1", ownerId: "user-1" },
    });
  });

  it("retire un favori existant", async () => {
    const prisma = createPrisma();
    prisma.favorite.findFirst.mockResolvedValue({ id: "fav-1" });
    const service = new FavoritesService(prisma as never);

    const result = await service.toggle("dev-acme", "user-1");

    expect(result).toEqual({ favorited: false });
    expect(prisma.favorite.delete).toHaveBeenCalledWith({ where: { id: "fav-1" } });
  });

  it("signale une offre inconnue", async () => {
    const prisma = createPrisma();
    prisma.job.findUnique.mockResolvedValue(null);
    const service = new FavoritesService(prisma as never);

    await expect(service.toggle("inconnue", null)).rejects.toThrow("n'existe pas");
  });

  it("liste les favoris de l'utilisateur sans recharger l'offre entière", async () => {
    const prisma = createPrisma();
    prisma.favorite.findMany.mockResolvedValue([
      {
        createdAt: new Date("2026-10-19T00:00:00.000Z"),
        job: {
          slug: "dev-acme",
          title: "Développeur",
          city: "Paris",
          contractType: "ALTERNANCE",
          company: { name: "Acme" },
        },
      },
    ]);
    const service = new FavoritesService(prisma as never);

    const list = await service.list("user-1");

    expect(prisma.favorite.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { ownerId: "user-1" } }),
    );
    expect(list).toEqual([
      {
        slug: "dev-acme",
        title: "Développeur",
        companyName: "Acme",
        city: "Paris",
        contractType: "ALTERNANCE",
        favoritedAt: "2026-10-19T00:00:00.000Z",
      },
    ]);
  });
});
