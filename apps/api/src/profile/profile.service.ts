import type { PrismaClient } from "@findit/database";
import { Inject, Injectable } from "@nestjs/common";

import { PRISMA_CLIENT } from "../prisma/prisma.module.js";

/**
 * Identifiant du singleton. Il n'existe qu'un propriétaire et aucun système
 * d'utilisateurs : le profil tient sur une seule ligne, toujours la même.
 * C'est la clé primaire qui garantit l'unicité, sans colonne de garde.
 */
export const PROFILE_SINGLETON_ID = "default";

/** Un lien du profil, tel que le web le rend et le renvoie. */
export type ProfileLink = {
  label: string;
  url: string;
};

/** Une langue parlée et son niveau déclaré. */
export type ProfileLanguage = {
  name: string;
  level: string;
};

/** Une expérience professionnelle, saisie librement. */
export type ProfileExperience = {
  title: string;
  company: string;
  period: string;
  description: string;
};

/**
 * Forme JSON du profil, telle que le contrat d'API la promet au web.
 *
 * `updatedAt` est `null` tant qu'aucune ligne n'a été écrite : le web préfère
 * une forme vide à un 404, et inventer une date à la lecture rendrait
 * indistinguable un profil jamais rempli d'un profil enregistré.
 */
export type ProfileView = {
  fullName: string;
  headline: string | null;
  email: string | null;
  phone: string | null;
  city: string | null;
  links: ProfileLink[];
  skills: string[];
  languages: ProfileLanguage[];
  experiences: ProfileExperience[];
  cvText: string | null;
  updatedAt: string | null;
};

/**
 * Champs acceptés en écriture. Tous facultatifs : un `PUT` partiel ne doit pas
 * effacer ce qu'il ne nomme pas. `| undefined` est explicite parce que
 * `exactOptionalPropertyTypes` distingue « absent » de « présent et indéfini ».
 */
export type ProfileInput = {
  fullName?: string | undefined;
  headline?: string | null | undefined;
  email?: string | null | undefined;
  phone?: string | null | undefined;
  city?: string | null | undefined;
  links?: ProfileLink[] | undefined;
  skills?: string[] | undefined;
  languages?: ProfileLanguage[] | undefined;
  experiences?: ProfileExperience[] | undefined;
  cvText?: string | null | undefined;
};

/** Ligne telle que Prisma la rend, sans dépendre du type généré. */
interface ProfileRow {
  readonly fullName: string;
  readonly headline: string | null;
  readonly email: string | null;
  readonly phone: string | null;
  readonly city: string | null;
  readonly links: unknown;
  readonly skills: string[];
  readonly languages: unknown;
  readonly experiences: unknown;
  readonly cvText: string | null;
  readonly updatedAt: Date;
}

/** Ce qu'on écrit, une fois les champs absents retirés. */
interface ProfileWrite {
  fullName?: string;
  headline?: string | null;
  email?: string | null;
  phone?: string | null;
  city?: string | null;
  links?: ProfileLink[];
  skills?: string[];
  languages?: ProfileLanguage[];
  experiences?: ProfileExperience[];
  cvText?: string | null;
}

/** Profil vide, rendu neuf à chaque appel pour qu'aucun appelant ne le mute. */
const emptyProfile = (): ProfileView => ({
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

const toView = (row: ProfileRow): ProfileView => ({
  fullName: row.fullName,
  headline: row.headline,
  email: row.email,
  phone: row.phone,
  city: row.city,
  /*
   * `links`, `languages` et `experiences` sont du JSON libre côté base : leur
   * forme a été validée par Zod à l'écriture. La lecture fait donc confiance à
   * ce qu'elle a elle-même accepté, sans reconstruire un schéma ici.
   */
  links: row.links as ProfileLink[],
  skills: row.skills,
  languages: row.languages as ProfileLanguage[],
  experiences: row.experiences as ProfileExperience[],
  cvText: row.cvText,
  updatedAt: row.updatedAt.toISOString(),
});

@Injectable()
export class ProfileService {
  constructor(@Inject(PRISMA_CLIENT) private readonly prisma: PrismaClient) {}

  /**
   * Lit le singleton, ou rend la forme vide.
   *
   * Jamais `null` : le tableau de bord est personnel et doit s'afficher avant
   * toute saisie ; un 404 pour un profil encore vierge serait un cas d'erreur
   * inventé, pas un fait.
   */
  async get(): Promise<ProfileView> {
    const row = await this.prisma.profile.findUnique({ where: { id: PROFILE_SINGLETON_ID } });
    return row === null ? emptyProfile() : toView(row);
  }

  /**
   * Enregistre le singleton, puis relit ce qui est en base.
   *
   * L'upsert est la seule écriture : il n'y a jamais deux profils, et le
   * mettre à jour ne dépend pas d'une lecture préalable. Les champs absents du
   * corps ne sont pas écrits — Prisma ignore une propriété `undefined` — donc un
   * `PUT` partiel complète le profil au lieu de le vider.
   */
  async save(input: ProfileInput): Promise<ProfileView> {
    const write: ProfileWrite = {};
    if (input.fullName !== undefined) write.fullName = input.fullName;
    if (input.headline !== undefined) write.headline = input.headline;
    if (input.email !== undefined) write.email = input.email;
    if (input.phone !== undefined) write.phone = input.phone;
    if (input.city !== undefined) write.city = input.city;
    if (input.links !== undefined) write.links = input.links;
    if (input.skills !== undefined) write.skills = [...input.skills];
    if (input.languages !== undefined) write.languages = input.languages;
    if (input.experiences !== undefined) write.experiences = input.experiences;
    if (input.cvText !== undefined) write.cvText = input.cvText;

    const row = await this.prisma.profile.upsert({
      where: { id: PROFILE_SINGLETON_ID },
      create: { id: PROFILE_SINGLETON_ID, ...write },
      update: write,
    });

    return toView(row);
  }
}
