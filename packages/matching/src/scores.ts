import type { JobOfferLite, StructuredCv } from "./types.js";

/**
 * Sous-scores déterministes du matching.
 *
 * Le POURQUOI : ces trois indicateurs se calculent sans appeler le modèle. Ils
 * sont rendus à côté du score LLM, jamais mélangés à lui, pour que le candidat
 * voie ce qui est objectivement vérifiable (compétences, localisation, contrat)
 * indépendamment de l'appréciation subjective du modèle.
 */

/** Normalise une chaîne pour comparer sans être gêné par la casse ni les espaces. */
const normalize = (value: string): string => value.toLowerCase().replace(/\s+/g, " ").trim();

/** Joint tous les champs textuels du CV en un seul bloc normalisé. */
const cvCorpus = (cv: StructuredCv): string =>
  normalize(
    [
      cv.identity,
      ...cv.experiences,
      ...cv.projects,
      ...cv.skills,
      ...cv.languages,
      ...cv.certifications,
    ].join(" "),
  );

/**
 * Vrai quand une compétence requise est couverte par une compétence du CV.
 *
 * Le POURQUOI de la direction « la compétence du CV contient la requise » :
 * « React.js » couvre « React », mais « React » ne couvre pas « React Native ».
 * La direction inverse gonflerait le score en comptant une exigence plus large
 * comme satisfaite. C'est un filet simple, pas un moteur de correspondance : il
 * peut confondre « C » et « CSS ». Compromis assumé, identique au garde-fou
 * anti-invention de matching.ts.
 */
const skillPresent = (skill: string, cvSkills: readonly string[]): boolean => {
  if (skill === "") {
    return false;
  }
  return cvSkills.some((candidate) => candidate.includes(skill));
};

/**
 * Part des compétences requises présentes dans le CV, entre 0 et 100.
 *
 * Le POURQUOI : c'est la seule dimension objectivement mesurable sans modèle.
 * Une offre sans compétence requise rend 0, car il n'y a rien à confronter.
 */
export const skillMatch = (cv: StructuredCv, offer: JobOfferLite): number => {
  const required = offer.requiredSkills;
  if (required.length === 0) {
    return 0;
  }
  const cvSkills = cv.skills.map(normalize);
  const matched = required.filter((skill) => skillPresent(normalize(skill), cvSkills));
  return Math.round((matched.length / required.length) * 100);
};

/** Mots d'une localisation, découpés sur les espaces. */
const words = (text: string): string[] => text.split(/\s+/).filter((word) => word !== "");

/**
 * Vrai quand deux localisations se recouvrent sans être identiques.
 *
 * Le POURQUOI du choix « sous-chaîne OU mot commun » : une même ville peut
 * s'écrire « Paris » ou « Paris, Ile-de-France », et deux villes d'une même
 * région partagent le nom de cette région. Un mot commun peut produire un faux
 * 50 (deux localisations « Saint-* »), c'est un proxy assumé, pas un géocodeur.
 */
const relatedLocations = (a: string, b: string): boolean => {
  if (a.includes(b) || b.includes(a)) {
    return true;
  }
  const aWords = new Set(words(a));
  return words(b).some((word) => aWords.has(word));
};

/**
 * Concordance de localisation : 0, 50 ou 100.
 *
 * Le POURQUOI des paliers : 100 quand le lieu est identique, 50 quand les lieux
 * sont liés sans être identiques (même région), 0 sinon. Une localisation
 * manquante d'un côté rend 0, on ne note pas ce qu'on ignore.
 */
export const locationMatch = (cv: StructuredCv, offer: JobOfferLite): number => {
  const cvLocation = normalize(cv.location);
  const offerLocation = normalize(offer.location);
  if (cvLocation === "" || offerLocation === "") {
    return 0;
  }
  if (cvLocation === offerLocation) {
    return 100;
  }
  return relatedLocations(cvLocation, offerLocation) ? 50 : 0;
};

/**
 * Concordance du type de contrat : 0 ou 100.
 *
 * Le POURQUOI : le CV ne déclare pas son contrat dans un champ dédié, on le
 * cherche donc dans tout le texte du CV. 100 quand le contrat demandé y figure,
 * 0 sinon, y compris quand l'offre n'en demande aucun.
 */
export const contractMatch = (cv: StructuredCv, offer: JobOfferLite): number => {
  const contract = normalize(offer.contract);
  if (contract === "") {
    return 0;
  }
  return cvCorpus(cv).includes(contract) ? 100 : 0;
};
