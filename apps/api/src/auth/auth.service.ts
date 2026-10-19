import { createHash, randomBytes } from "node:crypto";

import type { PrismaClient, UserRole } from "@findit/database";
import { ConflictException, Inject, Injectable, UnauthorizedException } from "@nestjs/common";

import { PRISMA_CLIENT } from "../prisma/prisma.module.js";
import { hashPassword, verifyPassword } from "./password.js";

/** Durée de vie d'une session, en millisecondes (7 jours). */
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** L'utilisateur tel qu'une session authentifiée le rend. */
export type AuthUser = {
  id: string;
  email: string;
  role: UserRole;
};

/** Un email déjà pris ne peut pas ouvrir un second compte. */
export class EmailTakenError extends ConflictException {
  constructor() {
    super("Cet email est déjà utilisé.");
  }
}

/**
 * Hache un jeton de session pour le stockage. Le jeton brut n'est jamais écrit :
 * une fuite de la base ne livre donc aucune session utilisable.
 */
const hashToken = (token: string): string => createHash("sha256").update(token).digest("hex");

const toAuthUser = (user: { id: string; email: string; role: UserRole }): AuthUser => ({
  id: user.id,
  email: user.email,
  role: user.role,
});

@Injectable()
export class AuthService {
  constructor(@Inject(PRISMA_CLIENT) private readonly prisma: PrismaClient) {}

  /** Crée un compte et rend l'utilisateur. Un email pris est refusé. */
  async register(email: string, password: string, role: UserRole): Promise<AuthUser> {
    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing !== null) {
      throw new EmailTakenError();
    }
    const user = await this.prisma.user.create({
      data: { email, passwordHash: hashPassword(password), role },
    });
    return toAuthUser(user);
  }

  /**
   * Ouvre une session si les identifiants sont justes. Le jeton brut est rendu
   * une seule fois, au client ; la base n'en garde que le hachage.
   */
  async login(email: string, password: string): Promise<{ token: string; user: AuthUser }> {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (user === null || !verifyPassword(password, user.passwordHash)) {
      // Même refus pour « inconnu » et « mauvais mot de passe » : ne pas révéler
      // qu'un email existe.
      throw new UnauthorizedException("Email ou mot de passe invalide.");
    }

    const token = randomBytes(32).toString("hex");
    await this.prisma.session.create({
      data: {
        tokenHash: hashToken(token),
        userId: user.id,
        expiresAt: new Date(Date.now() + SESSION_TTL_MS),
      },
    });

    return { token, user: toAuthUser(user) };
  }

  /** Révoque une session : une simple suppression, le jeton devient inerte. */
  async logout(token: string): Promise<void> {
    await this.prisma.session.deleteMany({ where: { tokenHash: hashToken(token) } });
  }

  /**
   * Résout un jeton en utilisateur, ou `null` quand il est inconnu ou expiré.
   * Le garde s'appuie dessus : aucune donnée n'est lue avant cette résolution.
   */
  async authenticate(token: string): Promise<AuthUser | null> {
    const session = await this.prisma.session.findUnique({
      where: { tokenHash: hashToken(token) },
      include: { user: { select: { id: true, email: true, role: true } } },
    });
    if (session === null || session.expiresAt.getTime() <= Date.now()) {
      return null;
    }
    return toAuthUser(session.user);
  }
}
