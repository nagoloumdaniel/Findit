import { Prisma, type PrismaClient } from "@findit/database";
import { Inject, Injectable } from "@nestjs/common";

import { PRISMA_CLIENT } from "../prisma/prisma.module.js";
import type { ProfileInput, ProfilePatch } from "./profile-input.js";

/// La plateforme est personnelle : un seul profil, sous cette clé fixe.
const OWNER = "owner";

export type CandidateProfileView = {
  fullName: string;
  email: string | null;
  phone: string | null;
  city: string | null;
  targetRoles: string[];
  availability: string | null;
  studyProgram: string | null;
  school: string | null;
  workStudyRhythm: string | null;
  portfolioUrl: string | null;
  githubUrl: string | null;
  linkedinUrl: string | null;
  languages: unknown;
  preferences: unknown;
  activeResumeId: string | null;
  updatedAt: Date;
};

@Injectable()
export class ProfileService {
  constructor(@Inject(PRISMA_CLIENT) private readonly prisma: PrismaClient) {}

  async get(): Promise<CandidateProfileView | null> {
    const row = await this.prisma.candidateProfile.findUnique({ where: { singleton: OWNER } });
    return row === null ? null : this.toView(row);
  }

  /*
   * Crée le profil s'il n'existe pas, le remplace sinon. Le nom est requis à la
   * création, d'où l'entrée complète attendue ici.
   */
  async put(input: ProfileInput): Promise<CandidateProfileView> {
    const data = this.toData(input);
    const row = await this.prisma.candidateProfile.upsert({
      where: { singleton: OWNER },
      update: data,
      create: { singleton: OWNER, fullName: input.fullName, ...data },
    });
    return this.toView(row);
  }

  /*
   * Met à jour les seuls champs fournis. Refuse si le profil n'existe pas encore :
   * on ne corrige pas ce qui n'a jamais été créé.
   */
  async patch(patch: ProfilePatch): Promise<CandidateProfileView | null> {
    const existing = await this.prisma.candidateProfile.findUnique({ where: { singleton: OWNER } });
    if (existing === null) {
      return null;
    }

    const row = await this.prisma.candidateProfile.update({
      where: { singleton: OWNER },
      data: this.toData(patch),
    });
    return this.toView(row);
  }

  private toData(input: ProfileInput | ProfilePatch) {
    return {
      ...(input.fullName !== undefined ? { fullName: input.fullName } : {}),
      ...(input.email !== undefined ? { email: input.email } : {}),
      ...(input.phone !== undefined ? { phone: input.phone } : {}),
      ...(input.city !== undefined ? { city: input.city } : {}),
      ...(input.targetRoles !== undefined ? { targetRoles: input.targetRoles } : {}),
      ...(input.availability !== undefined ? { availability: input.availability } : {}),
      ...(input.studyProgram !== undefined ? { studyProgram: input.studyProgram } : {}),
      ...(input.school !== undefined ? { school: input.school } : {}),
      ...(input.workStudyRhythm !== undefined ? { workStudyRhythm: input.workStudyRhythm } : {}),
      ...(input.portfolioUrl !== undefined ? { portfolioUrl: input.portfolioUrl } : {}),
      ...(input.githubUrl !== undefined ? { githubUrl: input.githubUrl } : {}),
      ...(input.linkedinUrl !== undefined ? { linkedinUrl: input.linkedinUrl } : {}),
      ...(input.languages !== undefined
        ? { languages: input.languages as Prisma.InputJsonValue }
        : {}),
      ...(input.preferences !== undefined
        ? { preferences: input.preferences as Prisma.InputJsonValue }
        : {}),
    };
  }

  private toView(row: {
    fullName: string;
    email: string | null;
    phone: string | null;
    city: string | null;
    targetRoles: string[];
    availability: string | null;
    studyProgram: string | null;
    school: string | null;
    workStudyRhythm: string | null;
    portfolioUrl: string | null;
    githubUrl: string | null;
    linkedinUrl: string | null;
    languages: unknown;
    preferences: unknown;
    activeResumeId: string | null;
    updatedAt: Date;
  }): CandidateProfileView {
    return {
      fullName: row.fullName,
      email: row.email,
      phone: row.phone,
      city: row.city,
      targetRoles: row.targetRoles,
      availability: row.availability,
      studyProgram: row.studyProgram,
      school: row.school,
      workStudyRhythm: row.workStudyRhythm,
      portfolioUrl: row.portfolioUrl,
      githubUrl: row.githubUrl,
      linkedinUrl: row.linkedinUrl,
      languages: row.languages,
      preferences: row.preferences,
      activeResumeId: row.activeResumeId,
      updatedAt: row.updatedAt,
    };
  }
}
