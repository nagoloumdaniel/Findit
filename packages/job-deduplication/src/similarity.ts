/**
 * Deux offres à comparer. Ce sont des formes déjà normalisées - le titre et le
 * nom d'entreprise réduits, le département, la date - plus le texte de la
 * description pour mesurer le recouvrement.
 */
export interface ComparableOffer {
  readonly normalizedTitle: string;
  readonly normalizedCompany: string;
  readonly departmentCode: string;
  readonly city: string;
  readonly publishedAt: Date;
  readonly descriptionText: string;
}

/*
 * Score par critère, entre 0 et 1. Correspond au `scoreBreakdown` en base.
 * Type et non interface : le détail part tel quel dans un champ JSON Prisma,
 * qui n'accepte que les formes littérales indexables.
 */
export type SimilarityBreakdown = {
  readonly company: number;
  readonly title: number;
  readonly location: number;
  readonly date: number;
  readonly description: number;
};

export interface Similarity {
  /** Score global entre 0 et 1. */
  readonly score: number;
  readonly breakdown: SimilarityBreakdown;
  readonly reasons: readonly string[];
}

/*
 * Poids de chaque critère, sommés à 1. L'entreprise et le titre pèsent le plus :
 * deux offres au même titre et de la même entreprise sont presque toujours la
 * même publication. Le lieu et le texte confirment ; la date, plus faible,
 * varie légèrement d'une source à l'autre pour une même offre.
 */
const WEIGHTS: SimilarityBreakdown = {
  company: 0.3,
  title: 0.3,
  location: 0.15,
  description: 0.15,
  date: 0.1,
};

const MS_PER_HOUR = 60 * 60 * 1000;

const tokens = (text: string): ReadonlySet<string> =>
  new Set(
    text
      .toLowerCase()
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, "")
      .split(/[^a-z0-9+#]+/u)
      .filter((token) => token.length > 1),
  );

/**
 * Recouvrement de Jaccard : la part de mots communs sur l'ensemble des mots.
 * Deux textes identiques valent 1, deux textes sans mot commun valent 0.
 */
const jaccard = (a: ReadonlySet<string>, b: ReadonlySet<string>): number => {
  if (a.size === 0 && b.size === 0) {
    return 1;
  }
  if (a.size === 0 || b.size === 0) {
    return 0;
  }

  let common = 0;
  for (const token of a) {
    if (b.has(token)) {
      common += 1;
    }
  }

  return common / (a.size + b.size - common);
};

const stringScore = (a: string, b: string): number => {
  if (a === b) {
    return 1;
  }
  return jaccard(tokens(a), tokens(b));
};

/*
 * Mots qui ne distinguent pas une entreprise d'une autre : formes juridiques et
 * articles. « Acme » et « Acme SAS » sont la même entreprise ; « Preuve Alpha
 * SAS » et « Preuve Gamma SAS » ne le sont pas, et le « SAS » qu'elles partagent
 * ne doit pas peser dans leur ressemblance (bug B010).
 */
const COMPANY_STOPWORDS: ReadonlySet<string> = new Set([
  "sas",
  "sasu",
  "sarl",
  "sa",
  "eurl",
  "snc",
  "scop",
  "se",
  "gmbh",
  "ltd",
  "inc",
  "llc",
  "plc",
  "co",
  "cie",
  "de",
  "du",
  "des",
  "la",
  "le",
  "les",
  "et",
  "and",
  "the",
  "of",
]);

/** Score d'un nom contenu dans un autre : une variante probable, jamais l'identité. */
const COMPANY_VARIANT_SCORE = 0.85;

const isSubset = (small: ReadonlySet<string>, large: ReadonlySet<string>): boolean => {
  for (const token of small) {
    if (!large.has(token)) {
      return false;
    }
  }
  return true;
};

/**
 * Ressemblance de deux noms d'entreprise. Les formes juridiques sont écartées ;
 * des noms égaux ensuite valent 1 ; un nom qui contient l'autre - « Acme » et
 * « Acme France » - est une variante probable (0,85) ; sinon le recouvrement
 * décide, et deux noms qui ne partagent qu'un mot sur trois restent loin de
 * l'identité. Un nom qui n'est que formes juridiques se compare en entier.
 */
const companyScore = (a: string, b: string): number => {
  if (a === b) {
    return 1;
  }

  const withoutStopwords = (name: string): ReadonlySet<string> => {
    const all = tokens(name);
    const kept = new Set([...all].filter((token) => !COMPANY_STOPWORDS.has(token)));
    return kept.size === 0 ? all : kept;
  };

  const first = withoutStopwords(a);
  const second = withoutStopwords(b);

  if (first.size === second.size && isSubset(first, second)) {
    return 1;
  }
  if (isSubset(first, second) || isSubset(second, first)) {
    return COMPANY_VARIANT_SCORE;
  }

  return jaccard(first, second);
};

/**
 * Rapproche deux dates. Une même offre porte parfois des dates un peu
 * différentes selon la source : proche vaut fort, lointain vaut faible.
 */
const dateScore = (a: Date, b: Date): number => {
  const hours = Math.abs(a.getTime() - b.getTime()) / MS_PER_HOUR;
  if (hours <= 24) {
    return 1;
  }
  if (hours <= 72) {
    return 0.7;
  }
  if (hours <= 24 * 7) {
    return 0.3;
  }
  return 0;
};

const locationScore = (a: ComparableOffer, b: ComparableOffer): number => {
  if (a.departmentCode !== b.departmentCode) {
    return 0;
  }
  // Même département : la ville identique confirme, une ville différente laisse
  // un doute mais n'exclut pas (deux libellés d'un même bassin).
  return a.city.trim().toLowerCase() === b.city.trim().toLowerCase() ? 1 : 0.7;
};

/**
 * Mesure à quel point deux offres sont la même publication, critère par
 * critère. Le résultat est explicable : le détail et les raisons accompagnent
 * le score, comme le modèle `DuplicateDecision` l'exige.
 */
export const scoreSimilarity = (a: ComparableOffer, b: ComparableOffer): Similarity => {
  const breakdown: SimilarityBreakdown = {
    company: companyScore(a.normalizedCompany, b.normalizedCompany),
    title: stringScore(a.normalizedTitle, b.normalizedTitle),
    location: locationScore(a, b),
    date: dateScore(a.publishedAt, b.publishedAt),
    description: jaccard(tokens(a.descriptionText), tokens(b.descriptionText)),
  };

  const score =
    breakdown.company * WEIGHTS.company +
    breakdown.title * WEIGHTS.title +
    breakdown.location * WEIGHTS.location +
    breakdown.date * WEIGHTS.date +
    breakdown.description * WEIGHTS.description;

  const reasons: string[] = [];
  reasons.push(
    breakdown.company === 1
      ? "Même entreprise."
      : `Entreprises proches à ${String(Math.round(breakdown.company * 100))} %.`,
  );
  reasons.push(
    breakdown.title === 1
      ? "Même titre."
      : `Titres proches à ${String(Math.round(breakdown.title * 100))} %.`,
  );
  if (breakdown.location === 0) {
    reasons.push("Départements différents.");
  }

  return { score, breakdown, reasons };
};
