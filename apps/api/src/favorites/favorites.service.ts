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
   * Ajoute ou retire une offre des favoris, et dit ce qui a été fait.
   *
   * Le POURQUOI d'un toggle idempotent : le propriétaire est unique, un favori
   * est un simple lien vers une offre, et l'état rendu reflète la base, pas une
   * supposition.
   */
  async toggle(slug: string): Promise<{ favorited: boolean }> {
    const job = await this.prisma.job.findUnique({ where: { slug }, select: { id: true } });
    if (job === null) {
      throw new NotFoundException("Cette offre n'existe pas.");
    }

    const existing = await this.prisma.favorite.findUnique({ where: { jobId: job.id } });
    if (existing !== null) {
      await this.prisma.favorite.delete({ where: { id: existing.id } });
      return { favorited: false };
    }

    await this.prisma.favorite.create({ data: { jobId: job.id } });
    return { favorited: true };
  }

  /** Liste les favoris, du plus récent au plus ancien. */
  async list(): Promise<FavoriteItem[]> {
    const rows = await this.prisma.favorite.findMany({
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
