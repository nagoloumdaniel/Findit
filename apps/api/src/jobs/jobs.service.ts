import { type PrismaClient, JobStatus } from "@findit/database";
import { publishedAfterFor } from "@findit/shared";
import { Inject, Injectable } from "@nestjs/common";

import { PRISMA_CLIENT } from "../prisma/prisma.module.js";
import type { JobQuery } from "./job-query.js";

export type JobListItem = {
  slug: string;
  title: string;
  roleCategory: string;
  companyName: string;
  companyLogoUrl: string | null;
  city: string;
  departmentCode: string;
  contractType: string;
  workMode: string;
  publishedAt: Date;
  dataQualityScore: number;
  skills: string[];
  canonicalSource: { name: string; url: string } | null;
};

export type JobList = {
  items: JobListItem[];
  total: number;
  page: number;
  pageSize: number;
};

@Injectable()
export class JobsService {
  constructor(@Inject(PRISMA_CLIENT) private readonly prisma: PrismaClient) {}

  /*
   * Construit le filtre commun à toute lecture publique.
   *
   * Deux règles y sont tenues sans exception : seules les offres PUBLISHED
   * sortent, et la borne de publication ne dépasse jamais la fenêtre demandée.
   * La base porte déjà la limite des 72 h, mais l'API la réapplique : une offre
   * dont l'expiration n'aurait pas encore été traitée par le worker ne peut pas
   * réapparaître dans la liste.
   */
  private publicWhere(query: JobQuery, now: Date) {
    return {
      status: JobStatus.PUBLISHED,
      publishedAt: { gte: publishedAfterFor(query.freshness, now) },
      expiresAt: { gt: now },
      ...(query.role ? { roleCategory: query.role } : {}),
      ...(query.contract ? { contractType: query.contract } : {}),
      ...(query.department ? { departmentCode: query.department } : {}),
      ...(query.workMode ? { workMode: query.workMode } : {}),
      ...(query.city ? { city: { equals: query.city, mode: "insensitive" as const } } : {}),
      ...(query.q
        ? {
            OR: [
              { title: { contains: query.q, mode: "insensitive" as const } },
              { description: { contains: query.q, mode: "insensitive" as const } },
              { company: { name: { contains: query.q, mode: "insensitive" as const } } },
            ],
          }
        : {}),
    };
  }

  async list(query: JobQuery, now: Date = new Date()): Promise<JobList> {
    const where = this.publicWhere(query, now);

    const [total, rows] = await Promise.all([
      this.prisma.job.count({ where }),
      this.prisma.job.findMany({
        where,
        orderBy:
          query.sort === "QUALITY"
            ? [{ dataQualityScore: "desc" }, { publishedAt: "desc" }]
            : [{ publishedAt: "desc" }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        include: {
          company: { select: { name: true, logoUrl: true } },
          skills: { include: { skill: { select: { name: true } } } },
          sources: { orderBy: { priority: "desc" }, take: 1 },
        },
      }),
    ]);

    return {
      items: rows.map((row) => ({
        slug: row.slug,
        title: row.title,
        roleCategory: row.roleCategory,
        companyName: row.company.name,
        companyLogoUrl: row.company.logoUrl,
        city: row.city,
        departmentCode: row.departmentCode,
        contractType: row.contractType,
        workMode: row.workMode,
        publishedAt: row.publishedAt,
        dataQualityScore: row.dataQualityScore,
        skills: row.skills.map((link) => link.skill.name),
        canonicalSource: row.sources[0]
          ? { name: row.sources[0].name, url: row.sources[0].url }
          : null,
      })),
      total,
      page: query.page,
      pageSize: query.pageSize,
    };
  }
}
