import { containsAlias, normalizeText, tokenize } from "./normalize.js";
import { canonicalizeSkill, detectSkillsInText, type TechEntry } from "./tech-dictionary.js";

export interface ResumeMatchInput {
  /** Compétences déclarées dans la section dédiée du CV. */
  sectionSkills: string[];
  /** Compétences citées dans les expériences et projets : prouvées par l'usage. */
  evidenceSkills: string[];
  /** Intitulés du CV : titre du profil et titres des expériences. */
  titles: string[];
  languages: { name: string; level?: string | undefined }[];
}

export interface JobMatchInput {
  title: string;
  normalizedTitle: string;
  roleCategory: string;
  requirements: string[];
  responsibilities: string[];
  description: string;
}

export type MatchCriterionId =
  "required_skills" | "preferred_skills" | "title_alignment" | "languages";

/*
 * Type et non interface : le détail part tel quel dans un champ JSON Prisma,
 * qui n'accepte que les formes littérales indexables.
 */
export type MatchCriterion = {
  criterion: MatchCriterionId;
  /** Poids réellement appliqué, après renormalisation des critères actifs. */
  weight: number;
  /** Couverture brute du critère, entre 0 et 1. */
  rawScore: number;
  /** Contribution au score final sur 100 : weight × rawScore. */
  points: number;
  details: string[];
};

export interface MatchResult {
  score: number;
  breakdown: MatchCriterion[];
  matchedSkills: string[];
  missingSkills: string[];
  missingKeywords: string[];
  strengths: string[];
  weaknesses: string[];
  recommendations: string[];
  confidence: number;
  insufficientDataWarning: string | null;
}

/**
 * Poids de base, choisis et assumés : les compétences exigées dominent parce
 * qu'elles décident d'un entretien, le reste nuance sans jamais renverser.
 * Un critère sans signal côté offre est exclu et les poids restants sont
 * renormalisés à 100, plutôt que de noter sur un critère vide.
 */
const BASE_WEIGHTS: Record<MatchCriterionId, number> = {
  required_skills: 50,
  preferred_skills: 20,
  title_alignment: 15,
  languages: 15,
};

/** Mots des intitulés qui ne disent rien du métier : civilités, contrat, niveau. */
const TITLE_STOPWORDS = new Set([
  "h",
  "f",
  "hf",
  "h/f",
  "f/h",
  "m",
  "w",
  "x",
  "alternance",
  "alternant",
  "alternante",
  "apprentissage",
  "apprenti",
  "apprentie",
  "stage",
  "stagiaire",
  "junior",
  "senior",
  "confirme",
  "confirmee",
  "debutant",
  "debutante",
  "de",
  "d",
  "du",
  "des",
  "le",
  "la",
  "les",
  "un",
  "une",
  "en",
  "et",
  "ou",
  "au",
  "aux",
  "a",
  "pour",
  "chez",
  "avec",
  "sur",
  "the",
  "and",
  "or",
  "in",
  "for",
  "to",
]);

/** Vocabulaire d'intitulé qu'une catégorie de poste implique d'elle-même. */
const CATEGORY_TITLE_TOKENS: Record<string, string[]> = {
  FRONTEND: ["front", "frontend"],
  BACKEND: ["back", "backend"],
  FULLSTACK: ["fullstack", "full", "stack"],
  SOFTWARE_ENGINEERING: ["logiciel", "software"],
  OTHER_DEVELOPER: [],
  MOBILE: ["mobile"],
  DATA_ANALYST: ["data", "analyste", "analyst"],
  DATA_ENGINEER: ["data", "engineer"],
};

interface KnownLanguage {
  id: string;
  label: string;
  aliases: string[];
}

/** Langues détectables sans ambiguïté dans une offre francophone ou anglophone. */
const KNOWN_LANGUAGES: KnownLanguage[] = [
  { id: "francais", label: "français", aliases: ["francais", "french"] },
  { id: "anglais", label: "anglais", aliases: ["anglais", "english"] },
  { id: "allemand", label: "allemand", aliases: ["allemand", "german", "deutsch"] },
  { id: "espagnol", label: "espagnol", aliases: ["espagnol", "spanish"] },
  { id: "italien", label: "italien", aliases: ["italien", "italian"] },
];

const clampScore = (value: number): number => Math.max(0, Math.min(100, Math.round(value)));

const round = (value: number, decimals: number): number => {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
};

interface ResumeSkillEvidence {
  entry: TechEntry;
  /** Vrai si la compétence figure dans la section compétences du CV. */
  inSection: boolean;
}

const collectResumeSkills = (resume: ResumeMatchInput): Map<string, ResumeSkillEvidence> => {
  const skills = new Map<string, ResumeSkillEvidence>();
  for (const raw of resume.sectionSkills) {
    const entry = canonicalizeSkill(raw);
    if (entry !== null) {
      skills.set(entry.id, { entry, inSection: true });
    }
  }
  for (const raw of resume.evidenceSkills) {
    const entry = canonicalizeSkill(raw);
    if (entry !== null && !skills.has(entry.id)) {
      skills.set(entry.id, { entry, inSection: false });
    }
  }
  return skills;
};

const meaningfulTokens = (texts: string[]): Set<string> => {
  const tokens = new Set<string>();
  for (const text of texts) {
    for (const token of tokenize(text)) {
      if (!TITLE_STOPWORDS.has(token) && token.length > 1) {
        tokens.add(token);
      }
    }
  }
  return tokens;
};

const detectJobLanguages = (jobText: string): KnownLanguage[] => {
  const normalized = normalizeText(jobText);
  return KNOWN_LANGUAGES.filter((language) =>
    language.aliases.some((alias) => containsAlias(normalized, alias)),
  );
};

const resumeSpeaks = (resume: ResumeMatchInput, language: KnownLanguage): boolean =>
  resume.languages.some((declared) => language.aliases.includes(normalizeText(declared.name)));

/**
 * Score déterministe et explicable entre un CV structuré et une offre. Aucune
 * IA : chaque point vient d'une correspondance constatée et citée dans le
 * détail, donc le même couple CV/offre redonne toujours le même résultat.
 */
export const computeMatch = (resume: ResumeMatchInput, job: JobMatchInput): MatchResult => {
  const resumeSkills = collectResumeSkills(resume);

  // Ce que l'offre exige vit dans le titre et les prérequis ; ce qu'elle
  // souhaite vit dans la description et les missions.
  const requiredZone = [job.title, ...job.requirements].join("\n");
  const preferredZone = [job.description, ...job.responsibilities].join("\n");
  const requiredSkills = detectSkillsInText(requiredZone);
  const requiredIds = new Set(requiredSkills.map((entry) => entry.id));
  const preferredSkills = detectSkillsInText(preferredZone).filter(
    (entry) => !requiredIds.has(entry.id),
  );

  const matchedRequired = requiredSkills.filter((entry) => resumeSkills.has(entry.id));
  const missingRequired = requiredSkills.filter((entry) => !resumeSkills.has(entry.id));
  const matchedPreferred = preferredSkills.filter((entry) => resumeSkills.has(entry.id));
  const missingPreferred = preferredSkills.filter((entry) => !resumeSkills.has(entry.id));

  const jobTitleTokens = meaningfulTokens([
    job.normalizedTitle,
    ...(CATEGORY_TITLE_TOKENS[job.roleCategory] ?? []),
  ]);
  const resumeTitleTokens = meaningfulTokens(resume.titles);
  const matchedTitleTokens = [...jobTitleTokens].filter((token) => resumeTitleTokens.has(token));

  const jobLanguages = detectJobLanguages(
    [job.title, job.description, ...job.requirements, ...job.responsibilities].join("\n"),
  );
  const spokenLanguages = jobLanguages.filter((language) => resumeSpeaks(resume, language));
  const missingLanguages = jobLanguages.filter((language) => !resumeSpeaks(resume, language));

  // Un critère n'entre dans le score que si l'offre fournit de quoi le juger,
  // et le CV de quoi être jugé pour l'intitulé.
  const active: { id: MatchCriterionId; rawScore: number; details: string[] }[] = [];

  if (requiredSkills.length > 0) {
    active.push({
      id: "required_skills",
      rawScore: matchedRequired.length / requiredSkills.length,
      details: [
        `${String(matchedRequired.length)} des ${String(requiredSkills.length)} compétences exigées sont couvertes.`,
        ...matchedRequired.map((entry) => `Couvert : ${entry.label}.`),
        ...missingRequired.map((entry) => `Absent du CV : ${entry.label}.`),
      ],
    });
  }

  if (preferredSkills.length > 0) {
    active.push({
      id: "preferred_skills",
      rawScore: matchedPreferred.length / preferredSkills.length,
      details: [
        `${String(matchedPreferred.length)} des ${String(preferredSkills.length)} compétences souhaitées sont couvertes.`,
        ...matchedPreferred.map((entry) => `Couvert : ${entry.label}.`),
        ...missingPreferred.map((entry) => `Absent du CV : ${entry.label}.`),
      ],
    });
  }

  if (jobTitleTokens.size > 0 && resumeTitleTokens.size > 0) {
    active.push({
      id: "title_alignment",
      rawScore: matchedTitleTokens.length / jobTitleTokens.size,
      details:
        matchedTitleTokens.length > 0
          ? [`Termes d'intitulé partagés : ${matchedTitleTokens.join(", ")}.`]
          : ["Aucun terme partagé entre les intitulés du CV et celui de l'offre."],
    });
  }

  if (jobLanguages.length > 0) {
    active.push({
      id: "languages",
      rawScore: spokenLanguages.length / jobLanguages.length,
      details: [
        ...spokenLanguages.map((language) => `Langue demandée déclarée : ${language.label}.`),
        ...missingLanguages.map(
          (language) => `Langue demandée non déclarée dans le CV : ${language.label}.`,
        ),
      ],
    });
  }

  const totalBaseWeight = active.reduce((sum, criterion) => sum + BASE_WEIGHTS[criterion.id], 0);
  const breakdown: MatchCriterion[] = active.map((criterion) => {
    const weight = round((BASE_WEIGHTS[criterion.id] * 100) / totalBaseWeight, 1);
    return {
      criterion: criterion.id,
      weight,
      rawScore: round(criterion.rawScore, 2),
      points: round(weight * criterion.rawScore, 1),
      details: criterion.details,
    };
  });

  const score =
    breakdown.length === 0
      ? 0
      : clampScore(breakdown.reduce((sum, criterion) => sum + criterion.points, 0));

  // Les avertissements disent pourquoi le score est fragile au lieu de le
  // maquiller : peu de compétences lisibles côté CV, ou une offre muette.
  const warnings: string[] = [];
  if (resumeSkills.size < 3) {
    warnings.push(
      "Le CV structuré contient moins de trois compétences reconnues par le dictionnaire technique.",
    );
  }
  if (requiredSkills.length + preferredSkills.length === 0) {
    warnings.push("Aucune compétence technique reconnue dans le texte de l'offre.");
  }

  const matchedAll = [...matchedRequired, ...matchedPreferred];
  const strengths = [
    ...matchedRequired.map((entry) => `Compétence exigée couverte : ${entry.label}.`),
    ...spokenLanguages.map((language) => `Langue demandée déclarée : ${language.label}.`),
  ];
  const weaknesses = [
    ...missingRequired.map((entry) => `Compétence exigée absente du CV : ${entry.label}.`),
    ...missingLanguages.map(
      (language) => `Langue demandée non déclarée dans le CV : ${language.label}.`,
    ),
  ];

  // Les recommandations ne portent que sur la mise en valeur de l'existant :
  // remonter une compétence déjà prouvée ailleurs, jamais en ajouter une.
  const recommendations = matchedAll
    .filter((entry) => {
      const evidence = resumeSkills.get(entry.id);
      return evidence !== undefined && !evidence.inSection;
    })
    .map(
      (entry) =>
        `Remonter « ${entry.label} » dans la section compétences : déjà présent dans une expérience ou un projet du CV.`,
    );

  // La confiance mesure la quantité de matière comparée, pas la qualité du
  // candidat : beaucoup de signaux des deux côtés rendent le score plus solide.
  const evidenceCount = requiredSkills.length + preferredSkills.length;
  let confidence = Math.min(
    95,
    25 + 6 * Math.min(evidenceCount, 8) + 3 * Math.min(resumeSkills.size, 9),
  );
  if (warnings.length > 0) {
    confidence = Math.min(confidence, 30);
  }

  return {
    score,
    breakdown,
    matchedSkills: matchedAll.map((entry) => entry.label),
    missingSkills: missingRequired.map((entry) => entry.label),
    missingKeywords: missingPreferred.map((entry) => entry.label),
    strengths,
    weaknesses,
    recommendations,
    confidence: clampScore(confidence),
    insufficientDataWarning: warnings.length > 0 ? warnings.join(" ") : null,
  };
};
