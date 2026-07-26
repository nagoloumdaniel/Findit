/*
 * Le titre normalisé ne sert qu'à rapprocher deux publications de la même
 * offre. Il n'est jamais affiché : `Job.title` conserve le titre d'origine tel
 * que l'employeur l'a écrit. C'est pourquoi le nettoyage peut être franc - il
 * ne détruit rien, il produit une forme comparable à côté de l'originale.
 */

/**
 * Mentions de genre : « H/F », « (F/H) », « m/w/d ». Elles varient d'une
 * publication à l'autre pour une même offre, et ne disent rien du poste.
 */
const GENDER_MENTIONS = /\b[hfmwdx](?:\s*\/\s*[hfmwdx]){1,2}\b/gu;

/**
 * Mentions de contrat. Le contrat est un champ à part, décidé par la
 * classification : le laisser dans le titre ferait diverger « Alternance
 * Développeur Front-end » de « Développeur Front-end (alternance) », qui sont
 * la même offre.
 *
 * La préposition qui l'introduit part avec elle. Sans cela, « iOS en
 * apprentissage » laisserait un « en » orphelin qui ne se compare à rien.
 */
const CONTRACT_MENTIONS =
  /\b(?:(?:en|in)\s+)?(?:alternance|alternant(?:e)?|apprentissage|apprenti(?:e)?|stage|stagiaire|internship|intern|apprenticeship|contrat\s+de\s+professionnalisation|professionnalisation|cesure)\b/gu;

/**
 * Codes internes : « ref 1240 », « REQ-4821 », « #5156316004 ». Ils identifient
 * la publication, pas le poste, et diffèrent entre deux parutions de la même
 * offre.
 */
const INTERNAL_CODES = /\b(?:ref|req|reference|requisition|id)\s*[:#-]?\s*[a-z]*\d[a-z0-9-]*\b/gu;

/** Nombres isolés d'au moins trois chiffres : un identifiant, jamais un métier. */
const STANDALONE_NUMBERS = /\b\d{3,}\b/gu;

/**
 * Tout ce qui n'est ni lettre, ni chiffre, ni `+`, ni `#`. Les deux derniers
 * sont gardés parce qu'ils portent du sens dans un nom de technologie : « c++ »
 * et « c# » ne sont pas « c ».
 */
const NON_MEANINGFUL = /[^a-z0-9+#]+/gu;

/**
 * Réduit un titre à une forme comparable : sans accent, sans mention de genre,
 * sans contrat et sans code interne.
 *
 * Rend une chaîne vide si le titre ne portait que ces mentions. C'est un cas
 * réel - « Stage H/F » existe - et il vaut mieux le rendre visible que
 * fabriquer un titre qui n'a jamais été écrit.
 */
export const normalizeTitle = (title: string): string =>
  title
    .toLowerCase()
    // Sépare les diacritiques de leur lettre, puis les retire : « é » → « e ».
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(GENDER_MENTIONS, " ")
    .replace(CONTRACT_MENTIONS, " ")
    .replace(INTERNAL_CODES, " ")
    .replace(STANDALONE_NUMBERS, " ")
    .replace(NON_MEANINGFUL, " ")
    .split(" ")
    /*
     * Un jeton sans lettre ni chiffre ne dit rien. Retirer le code de
     * « Data Engineer #5156316004 » laisse un « # » seul, gardé jusqu'ici parce
     * que le même caractère porte du sens dans « c# ». Ce qui compte est le
     * jeton entier, pas le caractère.
     */
    .filter((token) => /[a-z0-9]/u.test(token))
    .join(" ");
