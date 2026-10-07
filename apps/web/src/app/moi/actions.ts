"use server";

import { revalidatePath } from "next/cache";

import { saveProfile } from "../../lib/profile-api";
import type { ProfileExperience, ProfileLanguage, ProfileLink } from "../../lib/profile-api";

/*
 * Enregistrement du profil depuis le formulaire.
 *
 * Le POURQUOI d'une action serveur : le navigateur n'a ni la clé interne ni accès
 * à l'API ; il envoie un formulaire, le serveur fait l'appel. Rien de secret ne
 * descend dans la page.
 */

/** Découpe une liste séparée par des virgules, en ignorant le vide. */
const splitList = (value: string): string[] =>
  value
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);

/** Une ligne « label | url » par lien. Une ligne illisible est ignorée. */
const parseLinks = (value: string): ProfileLink[] =>
  value
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => {
      const [label = "", url = ""] = line.split("|").map((part) => part.trim());
      return { label: label === "" ? url : label, url };
    })
    .filter((link) => link.url.length > 0);

/** Une ligne « français (courant) » ou « français | courant » par langue. */
const parseLanguages = (value: string): ProfileLanguage[] =>
  value
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => {
      const [name = "", level = ""] = line.split("|").map((part) => part.trim());
      return { name, level };
    })
    .filter((language) => language.name.length > 0);

/**
 * Une ligne « titre | entreprise | période | description » par expérience.
 * La description est le seul champ facultatif ; sans titre ni entreprise, la
 * ligne n'est pas retenue — un CV ne gagne rien à porter des lignes vides.
 */
const parseExperiences = (value: string): ProfileExperience[] =>
  value
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => {
      const [title = "", company = "", period = "", description = ""] = line
        .split("|")
        .map((part) => part.trim());
      return { title, company, period, description };
    })
    .filter((experience) => experience.title.length > 0 && experience.company.length > 0);

const text = (form: FormData, key: string): string => {
  const value = form.get(key);
  return typeof value === "string" ? value.trim() : "";
};

/** Enregistre le profil, puis redemande la page. */
export const saveProfileAction = async (form: FormData): Promise<void> => {
  const optional = (value: string): string | null => (value === "" ? null : value);

  await saveProfile({
    fullName: text(form, "fullName"),
    headline: optional(text(form, "headline")),
    email: optional(text(form, "email")),
    phone: optional(text(form, "phone")),
    city: optional(text(form, "city")),
    links: parseLinks(text(form, "links")),
    skills: splitList(text(form, "skills")),
    languages: parseLanguages(text(form, "languages")),
    experiences: parseExperiences(text(form, "experiences")),
    cvText: optional(text(form, "cvText")),
  });

  revalidatePath("/moi");
};
