import type { TextBlock } from "./html-text.js";

/**
 * Les trois sections que `Job` porte séparément. Une section absente est un
 * tableau vide : l'offre ne la donnait pas, et rien ne sera inventé pour la
 * remplir.
 */
export interface JobSections {
  readonly responsibilities: readonly string[];
  readonly requirements: readonly string[];
  readonly benefits: readonly string[];
}

type SectionKind = keyof JobSections;

/**
 * Réduit un intertitre à une forme comparable. L'apostrophe disparaît avant le
 * reste : « What You'll Do » et « What You´ll Do » sont le même intertitre, et
 * la traiter comme une ponctuation ordinaire donnerait « what you ll do » d'un
 * côté et autre chose de l'autre.
 */
const normalizeHeading = (text: string): string =>
  text
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/['’`´]/gu, "")
    .replace(/[^a-z0-9]+/gu, " ")
    .trim();

/**
 * Intertitres relevés sur les offres réelles de Greenhouse et Lever, complétés
 * de leurs équivalents français courants.
 *
 * Le périmètre de Findit est l'Île-de-France : ces offres sont écrites en
 * français ou en anglais. L'allemand présent sur certains boards — Doctolib
 * publie aussi à Berlin — n'est pas reconnu : ces offres sont hors zone et
 * seront écartées à l'étape de localisation.
 *
 * La correspondance se fait par inclusion, parce qu'un intertitre réel traîne
 * presque toujours une ponctuation ou un complément : « Benefits: », « What
 * You'll Do at Vercel ».
 */
const SECTION_HEADINGS: ReadonlyArray<readonly [SectionKind, readonly string[]]> = [
  [
    "responsibilities",
    [
      "what youll do",
      "what you will do",
      "what youll be doing",
      "your responsibilities",
      "your mission",
      "vos missions",
      "votre mission",
      "missions",
      "ce que vous ferez",
      "votre role",
      "vos responsabilites",
      "responsabilites",
      // Le tutoiement est courant dans les offres françaises, et Doctolib
      // publie « Tes missions » à côté de « Vos missions ».
      "tes missions",
      "ta mission",
      "ce que tu feras",
      "ton role",
      "tes responsabilites",
    ],
  ],
  [
    "requirements",
    [
      "who you are",
      "about you",
      "your profile",
      "what youll bring",
      "bonus if you",
      "nice to have",
      "requirements",
      "qualifications",
      "votre profil",
      "profil recherche",
      "qualites attendues",
      "competences requises",
      "ce que nous recherchons",
      "ce que vous apportez",
      "vous etes",
      "ton profil",
      "ce que tu apportes",
      "tu es",
    ],
  ],
  [
    "benefits",
    [
      "benefits",
      "what we offer",
      "perks",
      "notre offre",
      "ce que nous offrons",
      "ce que nous proposons",
      "avantages",
      "nos avantages",
    ],
  ],
];

const sectionFor = (heading: string): SectionKind | null => {
  const normalized = normalizeHeading(heading);

  for (const [kind, phrases] of SECTION_HEADINGS) {
    if (phrases.some((phrase) => normalized.includes(phrase))) {
      return kind;
    }
  }

  return null;
};

/**
 * Un bloc ouvre-t-il une section ?
 *
 * Un vrai `<h1>`…`<h6>` en ouvre une, sans discussion. Un paragraphe entièrement
 * en gras aussi, mais à une condition : qu'une puce le suive. Beaucoup
 * d'employeurs écrivent leurs intertitres ainsi — 189 fois chez Doctolib, dont
 * 149 suivis d'une liste — et les ignorer viderait leurs sections. Le gras seul
 * ne suffit pas : c'est la liste qui le suit qui prouve qu'il annonçait quelque
 * chose.
 */
const opensSection = (block: TextBlock, next: TextBlock | undefined): boolean => {
  if (block.kind === "heading") {
    return true;
  }

  return block.kind === "paragraph" && block.emphasised === true && next?.kind === "listItem";
};

/**
 * Range les puces d'une offre sous la section que leur intertitre annonce.
 *
 * Seules les puces sont retenues. Une section rédigée en prose reste dans la
 * description : `Job.responsibilities` est une liste, et découper un paragraphe
 * en phrases pour en fabriquer une reviendrait à inventer une structure que
 * l'employeur n'a pas écrite.
 */
export const extractSections = (blocks: readonly TextBlock[]): JobSections => {
  const found: Record<SectionKind, string[]> = {
    responsibilities: [],
    requirements: [],
    benefits: [],
  };

  let current: SectionKind | null = null;

  blocks.forEach((block, index) => {
    if (opensSection(block, blocks[index + 1])) {
      // Un intertitre non reconnu ferme la section précédente sans en ouvrir
      // d'autre : ses puces parlent d'autre chose.
      current = sectionFor(block.text);
      return;
    }

    if (block.kind === "listItem" && current !== null) {
      found[current].push(block.text);
    }
  });

  return found;
};
