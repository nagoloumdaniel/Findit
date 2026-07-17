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

export type JobDetail = JobListItem & {
  description: string;
  responsibilities: string[];
  requirements: string[];
  benefits: string[];
  postalCode: string | null;
  salaryMin: number | null;
  salaryMax: number | null;
  salaryPeriod: string | null;
  salaryText: string | null;
  studyLevel: string | null;
  startDate: Date | null;
  duration: string | null;
  expiresAt: Date;
  canonicalUrl: string;
  applyUrl: string | null;
  companyWebsite: string | null;
  companyCareerUrl: string | null;
  /// Toutes les sources détectées, rang décroissant. Aucune n'est perdue au
  /// profit de la source privilégiée.
  sources: { name: string; url: string; priority: number; checkedAt: Date }[];
};

export type JobStats = {
  /// Nombre réel d'offres publiées sur la fenêtre par défaut. Jamais estimé.
  publishedLast24h: number;
  publishedLast72h: number;
  /// Date de la dernière offre publiée, ou null si la base est vide.
  lastPublishedAt: Date | null;
};

/// Valeurs réellement présentes en base, avec leur décompte. Une option sans
/// offre n'est pas proposée : un filtre ne doit jamais mener à une liste vide.
export type JobFilters = {
  roles: { value: string; count: number }[];
  contracts: { value: string; count: number }[];
  departments: { value: string; count: number }[];
  workModes: { value: string; count: number }[];
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

  /*
   * Le détail applique exactement le même filtre public que la liste. Une offre
   * expirée ou hors fenêtre reste donc introuvable même si son adresse est
   * connue ou partagée.
   */
  async findBySlug(
    slug: string,
    freshness: JobQuery["freshness"],
    now: Date = new Date(),
  ): Promise<JobDetail | null> {
    const row = await this.prisma.job.findFirst({
      where: {
        slug,
        status: JobStatus.PUBLISHED,
        publishedAt: { gte: publishedAfterFor(freshness, now) },
        expiresAt: { gt: now },
      },
      include: {
        company: { select: { name: true, logoUrl: true, website: true, careerUrl: true } },
        skills: { include: { skill: { select: { name: true } } } },
        sources: { orderBy: { priority: "desc" } },
      },
    });

    if (!row) {
      return null;
    }

    return {
      slug: row.slug,
      title: row.title,
      roleCategory: row.roleCategory,
      companyName: row.company.name,
      companyLogoUrl: row.company.logoUrl,
      companyWebsite: row.company.website,
      companyCareerUrl: row.company.careerUrl,
      city: row.city,
      departmentCode: row.departmentCode,
      postalCode: row.postalCode,
      contractType: row.contractType,
      workMode: row.workMode,
      publishedAt: row.publishedAt,
      expiresAt: row.expiresAt,
      dataQualityScore: row.dataQualityScore,
      description: row.description,
      responsibilities: row.responsibilities,
      requirements: row.requirements,
      benefits: row.benefits,
      salaryMin: row.salaryMin,
      salaryMax: row.salaryMax,
      salaryPeriod: row.salaryPeriod,
      salaryText: row.salaryText,
      studyLevel: row.studyLevel,
      startDate: row.startDate,
      duration: row.duration,
      canonicalUrl: row.canonicalUrl,
      applyUrl: row.applyUrl,
      skills: row.skills.map((link) => link.skill.name),
      canonicalSource: row.sources[0]
        ? { name: row.sources[0].name, url: row.sources[0].url }
        : null,
      sources: row.sources.map((source) => ({
        name: source.name,
        url: source.url,
        priority: source.priority,
        checkedAt: source.checkedAt,
      })),
    };
  }

  async stats(now: Date = new Date()): Promise<JobStats> {
    const published = { status: JobStatus.PUBLISHED, expiresAt: { gt: now } };

    const [publishedLast24h, publishedLast72h, latest] = await Promise.all([
      this.prisma.job.count({
        where: { ...published, publishedAt: { gte: publishedAfterFor("LAST_24H", now) } },
      }),
      this.prisma.job.count({
        where: { ...published, publishedAt: { gte: publishedAfterFor("LAST_72H", now) } },
      }),
      this.prisma.job.findFirst({
        where: { ...published, publishedAt: { gte: publishedAfterFor("LAST_72H", now) } },
        orderBy: { publishedAt: "desc" },
        select: { publishedAt: true },
      }),
    ]);

    return { publishedLast24h, publishedLast72h, lastPublishedAt: latest?.publishedAt ?? null };
  }

  async filters(freshness: JobQuery["freshness"], now: Date = new Date()): Promise<JobFilters> {
    const where = {
      status: JobStatus.PUBLISHED,
      publishedAt: { gte: publishedAfterFor(freshness, now) },
      expiresAt: { gt: now },
    };

    const [roles, contracts, departments, workModes] = await Promise.all([
      this.prisma.job.groupBy({ by: ["roleCategory"], where, _count: { _all: true } }),
      this.prisma.job.groupBy({ by: ["contractType"], where, _count: { _all: true } }),
      this.prisma.job.groupBy({ by: ["departmentCode"], where, _count: { _all: true } }),
      this.prisma.job.groupBy({ by: ["workMode"], where, _count: { _all: true } }),
    ]);

    return {
      roles: roles.map((row) => ({ value: row.roleCategory, count: row._count._all })),
      contracts: contracts.map((row) => ({ value: row.contractType, count: row._count._all })),
      departments: departments
        .map((row) => ({ value: row.departmentCode, count: row._count._all }))
        .sort((a, b) => a.value.localeCompare(b.value)),
      workModes: workModes.map((row) => ({ value: row.workMode, count: row._count._all })),
    };
  }
}
