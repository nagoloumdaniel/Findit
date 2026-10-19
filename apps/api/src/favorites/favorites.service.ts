import type { PrismaClient } from "@findit/database";
import { Inject, Injectable, NotFoundException } from "@nestjs/common";

import { PRISMA_CLIENT } from "../prisma/prisma.module.js";

/** Une offre en favori, telle que la liste la rend. */
export type FavoriteItem = {
  slug: string;
  title: string;
  companyName: string;
  city: string;
  contractType: string;
  favoritedAt: string;
};

@Injectable()
export class FavoritesService {
  constructor(@Inject(PRISMA_CLIENT) private readonly prisma: PrismaClient) {}

  /**
   * Ajoute ou retire une offre des favoris de l'utilisateur, et dit ce qui a été
   * fait. `ownerId` nul désigne l'historique antérieur aux comptes.
   *
   * Le POURQUOI d'un toggle idempotent : un favori est un simple lien vers une
   * offre, et l'état rendu reflète la base, pas une supposition.
   */
  async toggle(slug: string, ownerId: string | null): Promise<{ favorited: boolean }> {
    const job = await this.prisma.job.findUnique({ where: { slug }, select: { id: true } });
    if (job === null) {
      throw new NotFoundException("Cette offre n'existe pas.");
    }

    const existing = await this.prisma.favorite.findFirst({
      where: { jobId: job.id, ownerId },
    });
    if (existing !== null) {
      await this.prisma.favorite.delete({ where: { id: existing.id } });
      return { favorited: false };
    }

    await this.prisma.favorite.create({ data: { jobId: job.id, ownerId } });
    return { favorited: true };
  }

  /** Liste les favoris de l'utilisateur, du plus récent au plus ancien. */
  async list(ownerId: string | null): Promise<FavoriteItem[]> {
    const rows = await this.prisma.favorite.findMany({
      where: { ownerId },
      orderBy: { createdAt: "desc" },
      include: {
        job: {
          select: {
            slug: true,
            title: true,
            city: true,
            contractType: true,
            company: { select: { name: true } },
          },
        },
      },
    });

    return rows.map((row) => ({
      slug: row.job.slug,
      title: row.job.title,
      companyName: row.job.company.name,
      city: row.job.city,
      contractType: row.job.contractType,
      favoritedAt: row.createdAt.toISOString(),
    }));
  }
}
