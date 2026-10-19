import { beforeEach, describe, expect, it, vi } from "vitest";

import { hashPassword } from "./password.js";
import { AuthService, EmailTakenError } from "./auth.service.js";

const createPrisma = () => ({
  user: {
    findUnique: vi.fn().mockResolvedValue(null),
    create: vi.fn((args: { data: { email: string; role: string } }) =>
      Promise.resolve({ id: "user-1", email: args.data.email, role: args.data.role }),
    ),
  },
  session: {
    create: vi.fn().mockResolvedValue({ id: "session-1" }),
    findUnique: vi.fn().mockResolvedValue(null),
    deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
  },
});

beforeEach(() => {
  vi.resetAllMocks();
});

describe("AuthService", () => {
  it("crée un compte candidat et refuse un email déjà pris", async () => {
    const prisma = createPrisma();
    const service = new AuthService(prisma as never);

    const user = await service.register("ada@example.com", "mot-de-passe-long", "CANDIDATE");
    expect(user).toMatchObject({ email: "ada@example.com", role: "CANDIDATE" });
    // Le mot de passe est haché avant l'écriture, jamais en clair.
    const createArgs = prisma.user.create.mock.calls[0]?.[0] as unknown as {
      data: { passwordHash: string };
    };
    expect(createArgs.data.passwordHash).not.toBe("mot-de-passe-long");

    prisma.user.findUnique.mockResolvedValue({ id: "user-1" });
    await expect(service.register("ada@example.com", "x", "CANDIDATE")).rejects.toBeInstanceOf(
      EmailTakenError,
    );
  });

  it("ouvre une session sur les bons identifiants, la refuse sur les mauvais", async () => {
    const prisma = createPrisma();
    prisma.user.findUnique.mockResolvedValue({
      id: "user-1",
      email: "ada@example.com",
      role: "CANDIDATE",
      passwordHash: hashPassword("mot-de-passe-long"),
    });
    const service = new AuthService(prisma as never);

    const login = await service.login("ada@example.com", "mot-de-passe-long");
    expect(login.user).toMatchObject({ email: "ada@example.com" });
    expect(login.token).toHaveLength(64);
    // Le jeton est haché avant stockage : la base ne voit jamais le jeton brut.
    const sessionArgs = prisma.session.create.mock.calls[0]?.[0] as {
      data: { tokenHash: string };
    };
    expect(sessionArgs.data.tokenHash).not.toBe(login.token);

    await expect(service.login("ada@example.com", "mauvais")).rejects.toThrow("invalide");
  });

  it("résout un jeton en utilisateur, ou null s'il est expiré", async () => {
    const prisma = createPrisma();
    const service = new AuthService(prisma as never);

    prisma.session.findUnique.mockResolvedValue({
      expiresAt: new Date(Date.now() + 60_000),
      user: { id: "user-1", email: "ada@example.com", role: "CANDIDATE" },
    });
    expect(await service.authenticate("jeton")).toMatchObject({ id: "user-1" });

    prisma.session.findUnique.mockResolvedValue({
      expiresAt: new Date(Date.now() - 60_000),
      user: { id: "user-1", email: "ada@example.com", role: "CANDIDATE" },
    });
    expect(await service.authenticate("jeton")).toBeNull();
  });
});
