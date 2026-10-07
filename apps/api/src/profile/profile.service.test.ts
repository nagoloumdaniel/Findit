import { describe, expect, it, vi } from "vitest";

import { ProfileService, PROFILE_SINGLETON_ID } from "./profile.service.js";

/** Ligne telle que Prisma la rendrait pour un profil rempli. */
const storedRow = () => ({
  fullName: "Ada Lovelace",
  headline: "Ingénieure",
  email: "ada@example.com",
  phone: null,
  city: "Paris",
  links: [{ label: "GitHub", url: "https://github.com/ada" }],
  skills: ["typescript"],
  languages: [{ name: "français", level: "natif" }],
  experiences: [{ title: "Dev", company: "Acme", period: "2024", description: "desc" }],
  cvText: "un CV",
  updatedAt: new Date("2026-10-07T04:00:00.000Z"),
});

const createPrisma = () => ({
  profile: {
    findUnique: vi.fn().mockResolvedValue(null),
    upsert: vi.fn().mockResolvedValue(storedRow()),
  },
});

type UpsertArgs = {
  where: { id: string };
  create: Record<string, unknown>;
  update: Record<string, unknown>;
};

describe("ProfileService - lecture", () => {
  it("rend la forme vide quand aucune ligne n'existe", async () => {
    const prisma = createPrisma();
    const service = new ProfileService(prisma as never);

    await expect(service.get()).resolves.toEqual({
      fullName: "",
      headline: null,
      email: null,
      phone: null,
      city: null,
      links: [],
      skills: [],
      languages: [],
      experiences: [],
      cvText: null,
      updatedAt: null,
    });

    // Le singleton est lu par sa clé fixe, pas « la première ligne venue ».
    expect(prisma.profile.findUnique).toHaveBeenCalledWith({ where: { id: PROFILE_SINGLETON_ID } });
  });

  it("relit les champs JSON et date la dernière écriture", async () => {
    const prisma = createPrisma();
    prisma.profile.findUnique.mockResolvedValue(storedRow());
    const service = new ProfileService(prisma as never);

    const view = await service.get();

    expect(view.links).toEqual([{ label: "GitHub", url: "https://github.com/ada" }]);
    expect(view.languages).toEqual([{ name: "français", level: "natif" }]);
    expect(view.experiences[0]).toMatchObject({ title: "Dev", company: "Acme" });
    expect(view.skills).toEqual(["typescript"]);
    expect(view.updatedAt).toBe("2026-10-07T04:00:00.000Z");
  });
});

describe("ProfileService - écriture", () => {
  it("écrit le singleton par upsert et rend ce qui a été enregistré", async () => {
    const prisma = createPrisma();
    const service = new ProfileService(prisma as never);

    const view = await service.save({ fullName: "Ada Lovelace", skills: ["typescript"] });

    const call = prisma.profile.upsert.mock.calls[0]?.[0] as UpsertArgs;
    expect(call.where).toEqual({ id: PROFILE_SINGLETON_ID });
    expect(call.create).toEqual({
      id: PROFILE_SINGLETON_ID,
      fullName: "Ada Lovelace",
      skills: ["typescript"],
    });
    expect(call.update).toEqual({ fullName: "Ada Lovelace", skills: ["typescript"] });
    expect(view.fullName).toBe("Ada Lovelace");
  });

  it("n'écrase pas les champs absents d'un PUT partiel", async () => {
    const prisma = createPrisma();
    const service = new ProfileService(prisma as never);

    await service.save({ city: "Lyon" });

    const call = prisma.profile.upsert.mock.calls[0]?.[0] as UpsertArgs;
    expect(call.update).toEqual({ city: "Lyon" });
    // `undefined` n'apparaît nulle part : Prisma ignorerait la clé, mais la
    // laisser dans l'objet rendrait la relecture du test ambiguë.
    expect(Object.keys(call.create).sort()).toEqual(["city", "id"]);
  });

  it("accepte un effacement explicite par null", async () => {
    const prisma = createPrisma();
    const service = new ProfileService(prisma as never);

    await service.save({ headline: null });

    const call = prisma.profile.upsert.mock.calls[0]?.[0] as UpsertArgs;
    expect(call.update).toEqual({ headline: null });
  });
});
