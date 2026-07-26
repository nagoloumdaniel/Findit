import { ApplicationStatus, type PrismaClient } from "@findit/database";
import { Inject, Injectable } from "@nestjs/common";

import { PRISMA_CLIENT } from "../prisma/prisma.module.js";
import type { CreateApplicationInput, UpdateApplicationInput } from "./applications-input.js";

export const APPLICATIONS_CLOCK = Symbol("APPLICATIONS_CLOCK");

export interface ApplicationEventView {
  status: string;
  note: string | null;
  occurredAt: Date;
}

export interface ApplicationView {
  id: string;
  jobSlug: string;
  jobTitle: string;
  companyName: string;
  /// Vrai tant que l'offre existe encore dans la liste publique.
  jobStillExists: boolean;
  resumeFileName: string | null;
  matchScore: number | null;
  letterSubject: string | null;
  letterParagraphs: string[];
  status: string;
  notes: string | null;
  appliedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  events: ApplicationEventView[];
}

type ApplicationRow = {
  id: string;
  jobId: string | null;
  jobSlug: string;
  jobTitle: string;
  companyName: string;
  resumeFileName: string | null;
  matchScore: number | null;
  letterSubject: string | null;
  letterParagraphs: string[];
  status: ApplicationStatus;
  notes: string | null;
  appliedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  events: { status: ApplicationStatus; note: string | null; occurredAt: Date }[];
};

const toView = (row: ApplicationRow): ApplicationView => ({
  id: row.id,
  jobSlug: row.jobSlug,
  jobTitle: row.jobTitle,
  companyName: row.companyName,
  jobStillExists: row.jobId !== null,
  resumeFileName: row.resumeFileName,
  matchScore: row.matchScore,
  letterSubject: row.letterSubject,
  letterParagraphs: row.letterParagraphs,
  status: row.status,
  notes: row.notes,
  appliedAt: row.appliedAt,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
  events: row.events.map((event) => ({
    status: event.status,
    note: event.note,
    occurredAt: event.occurredAt,
  })),
});

const EVENT_INCLUDE = { events: { orderBy: { occurredAt: "asc" as const } } };

@Injectable()
export class ApplicationsService {
  constructor(
    @Inject(PRISMA_CLIENT) private readonly prisma: PrismaClient,
    @Inject(APPLICATIONS_CLOCK) private readonly now: () => Date,
  ) {}

  /*
   * Crée le dossier en photographiant l'offre, et - si un CV est fourni - le
   * score et la lettre existants pour ce couple. Le dossier restera lisible
   * même quand l'offre expirera et que le CV sera purgé : c'est sa raison
   * d'être.
   */
  async create(input: CreateApplicationInput): Promise<ApplicationView | "job_not_found"> {
    const job = await this.prisma.job.findFirst({ where: { slug: input.jobSlug } });
    if (job === null) {
      return "job_not_found";
    }

    let resumeFileName: string | null = null;
    let matchScore: number | null = null;
    let letterSubject: string | null = null;
    let letterParagraphs: string[] = [];

    if (input.resumeId !== undefined) {
      const resume = await this.prisma.sourceResume.findUnique({
        where: { id: input.resumeId },
      });
      resumeFileName = resume?.originalFileName ?? null;

      const match = await this.prisma.sourceResumeMatch.findFirst({
        where: { sourceResumeId: input.resumeId, jobId: job.id },
      });
      matchScore = match?.score ?? null;

      const letter = await this.prisma.sourceCoverLetter.findFirst({
        where: { sourceResumeId: input.resumeId, jobId: job.id },
      });
      letterSubject = letter?.subject ?? null;
      letterParagraphs = letter?.paragraphs ?? [];
    }

    const row = await this.prisma.application.create({
      data: {
        jobId: job.id,
        jobSlug: job.slug,
        jobTitle: job.title,
        companyName:
          (await this.prisma.company.findUnique({ where: { id: job.companyId } }))?.name ??
          "Entreprise inconnue",
        resumeFileName,
        matchScore,
        letterSubject,
        letterParagraphs,
        notes: input.notes ?? null,
        events: { create: { status: ApplicationStatus.TO_APPLY } },
      },
      include: EVENT_INCLUDE,
    });

    return toView(row);
  }

  /** Les dossiers, du plus récemment bougé au plus ancien, avec historique. */
  async list(): Promise<ApplicationView[]> {
    const rows = await this.prisma.application.findMany({
      orderBy: { updatedAt: "desc" },
      include: EVENT_INCLUDE,
    });
    return rows.map((row) => toView(row));
  }

  /*
   * Change le statut ou les notes. Un changement de statut écrit un événement
   * daté - l'historique s'ajoute, il ne se réécrit pas - et le passage à
   * APPLIED fixe la date d'envoi réelle une seule fois.
   */
  async update(id: string, input: UpdateApplicationInput): Promise<ApplicationView | null> {
    const existing = await this.prisma.application.findUnique({ where: { id } });
    if (existing === null) {
      return null;
    }

    const statusChanged = input.status !== undefined && input.status !== existing.status;

    const row = await this.prisma.application.update({
      where: { id },
      data: {
        ...(input.status !== undefined ? { status: input.status } : {}),
        ...(input.notes !== undefined ? { notes: input.notes === "" ? null : input.notes } : {}),
        ...(statusChanged && input.status === "APPLIED" && existing.appliedAt === null
          ? { appliedAt: this.now() }
          : {}),
        ...(statusChanged
          ? {
              events: {
                create: {
                  status: input.status as ApplicationStatus,
                  note: input.note ?? null,
                },
              },
            }
          : {}),
      },
      include: EVENT_INCLUDE,
    });

    return toView(row);
  }

  async remove(id: string): Promise<boolean> {
    const existing = await this.prisma.application.findUnique({ where: { id } });
    if (existing === null) {
      return false;
    }
    await this.prisma.application.delete({ where: { id } });
    return true;
  }
}
