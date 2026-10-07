import { normalizeForMatching } from "./normalize.js";

/**
 * Nature réelle de l'organisation qui publie, au sens de `CompanyKind` en base.
 * Une école ne doit jamais apparaître comme employeur.
 */
export type OrganisationKind =
  "EMPLOYER" | "SCHOOL" | "TRAINING_ORGANISATION" | "RECRUITMENT_AGENCY" | "UNKNOWN";

export interface SchoolDetection {
  readonly kind: OrganisationKind;
  /** Risque d'école sur 100. */
  readonly riskScore: number;
  /** Vrai si le risque impose d'écarter l'offre. */
  readonly excluded: boolean;
  /** Signaux relevés, cités tels quels. */
  readonly reasons: readonly string[];
}

export interface SchoolDetectionInput {
  readonly companyName: string;
  readonly title: string;
  readonly description: string;
}

/**
 * Un nom d'entreprise qui est en fait une école ou un organisme de formation.
 * C'est le signal le plus fiable : une offre normale d'employeur ne s'appelle
 * pas « École … » ni « … Formation ».
 */
const SCHOOL_NAME_TOKENS = [
  "ecole",
  "institut",
  "campus",
  "academie",
  "academy",
  "universite",
  "university",
  "cfa",
  "bootcamp",
  "formations",
  "college",
  "school",
];

/**
 * Employeurs reconnus comme écoles, **cités** parce qu'ils ont été observés dans
 * nos propres offres : ISCOD, EEMI, IRIS. Le POURQUOI : une école qui recrute
 * pour ses entreprises partenaires publie une annonce d'alternance qui ressemble
 * à celle d'un employeur — mesuré le 2026-10-07, cinq offres d'écoles étaient
 * publiées, et le détecteur de texte concluait « aucun signal d'école ». Le nom
 * de l'employeur, lui, ne trompe pas.
 *
 * La liste est volontairement courte et citée : elle constate, elle ne devine
 * pas. Un nom ambigu (« iris » est aussi un prénom et une marque) est assumé —
 * sur le périmètre alternance/stage, le risque d'écarter un employeur légitime
 * homonyme est plus faible que celui de publier une école.
 */
const KNOWN_SCHOOL_EMPLOYERS = ["iscod", "eemi", "iris"];

/**
 * Formulations d'une **arnaque d'école** : l'annonce vend une formation ou
 * promet de placer le candidat, au lieu de décrire un poste. Ces signaux sont
 * forts parce qu'aucune offre d'employeur réel ne les emploie.
 */
const STRONG_TEXT_SIGNALS: ReadonlyArray<readonly [string, string]> = [
  ["cout de la formation", "le coût de la formation est mentionné"],
  ["notre cursus", "l'annonce décrit un cursus"],
  ["notre programme de formation", "l'annonce décrit un programme de formation"],
  ["preparez un titre", "l'annonce vend la préparation d'un titre"],
  ["obtenez un diplome", "l'annonce vend l'obtention d'un diplôme"],
];

/**
 * Formulations qui suffisent à elles seules, parce qu'un employeur ne les écrit
 * jamais : il ne demande pas de frais, ne vend pas de cursus et ne promet pas de
 * placer le candidat. Mesuré le 2026-10-07 : « entreprises partenaires » (IRIS)
 * pesait 35 points, sous le seuil de quarantaine de 40 — l'école passait donc en
 * employeur. Ces phrases valent désormais le seuil d'exclusion à elles seules.
 */
const DECISIVE_TEXT_SIGNALS: ReadonlyArray<readonly [string, string]> = [
  ["entreprise partenaire", "l'annonce parle d'entreprises partenaires, pas d'un poste"],
  ["entreprises partenaires", "l'annonce parle d'entreprises partenaires, pas d'un poste"],
  ["nous vous placons", "l'annonce promet de placer le candidat"],
  ["nous placons nos", "l'annonce promet de placer ses candidats"],
  ["trouvez votre entreprise", "l'annonce propose de trouver une entreprise"],
  ["trouver votre alternance", "l'annonce propose de trouver une alternance"],
  ["frais de formation", "des frais de formation sont mentionnés"],
  ["frais de scolarite", "des frais de scolarité sont mentionnés"],
  ["reste a charge", "un reste à charge est demandé"],
  ["integre notre formation", "l'annonce invite à intégrer une formation"],
  ["rejoignez notre formation", "l'annonce invite à rejoindre une formation"],
  ["candidate a la formation", "l'annonce invite à candidater à une formation"],
];

/**
 * Formulations de cabinet de recrutement. Elles ne sont **pas** un signal
 * d'école : un cabinet est une organisation légitime, et le confondre avec une
 * école serait une erreur que la spécification interdit explicitement.
 */
const AGENCY_SIGNALS = [
  "cabinet de recrutement",
  "notre client",
  "pour le compte de notre client",
  "recruitment agency",
  "on behalf of our client",
  "notre cabinet",
];

const REJECT_THRESHOLD = 70;
const QUARANTINE_THRESHOLD = 40;

const containsToken = (haystack: string, token: string): boolean => haystack.includes(` ${token} `);

const containsPhrase = (haystack: string, phrase: string): boolean => haystack.includes(phrase);

/**
 * Estime le risque qu'une offre vienne d'une école ou d'un organisme de
 * formation plutôt que d'un employeur réel.
 *
 * La règle est prudente à dessein : « formation », « diplôme » et « RNCP »
 * apparaissent dans des alternances parfaitement réelles, donc ils ne comptent
 * pas seuls. Ce qui compte, c'est un **nom d'école**, une **demande de frais**,
 * ou une **promesse de placement** - des choses qu'un employeur n'écrit pas.
 *
 * Un cabinet de recrutement est reconnu comme tel, jamais rangé parmi les
 * écoles.
 */
export const detectSchoolRisk = (input: SchoolDetectionInput): SchoolDetection => {
  const name = normalizeForMatching(input.companyName);
  const text = normalizeForMatching(`${input.title} ${input.description}`);
  const reasons: string[] = [];

  // Un cabinet de recrutement l'emporte : c'est une organisation légitime.
  const agency = AGENCY_SIGNALS.find((signal) => containsPhrase(text, signal));
  if (agency !== undefined) {
    return {
      kind: "RECRUITMENT_AGENCY",
      riskScore: 0,
      excluded: false,
      reasons: [`Cabinet de recrutement : « ${agency} ».`],
    };
  }

  let score = 0;

  const schoolNameToken = SCHOOL_NAME_TOKENS.find((token) => containsToken(name, token));

  /*
   * Un employeur reconnu comme école tranche avant tout le reste : le texte de
   * son annonce, lui, peut ressembler à s'y méprendre à celui d'un employeur.
   */
  const knownSchool = KNOWN_SCHOOL_EMPLOYERS.find((token) => containsToken(name, token));
  if (knownSchool !== undefined) {
    return {
      kind: "SCHOOL",
      riskScore: 100,
      excluded: true,
      reasons: [`Employeur reconnu comme école (liste citée) : « ${knownSchool} ».`, ...reasons],
    };
  }

  // Une formulation qu'un employeur n'écrit jamais suffit à écarter l'offre.
  const decisive = DECISIVE_TEXT_SIGNALS.find(([phrase]) => containsPhrase(text, phrase));
  if (decisive !== undefined) {
    return {
      kind: schoolNameToken === undefined ? "TRAINING_ORGANISATION" : "SCHOOL",
      riskScore: 100,
      excluded: true,
      reasons: [decisive[1]],
    };
  }

  if (schoolNameToken !== undefined) {
    score += 60;
    reasons.push(`Le nom de l'organisation contient « ${schoolNameToken} ».`);
  }

  for (const [phrase, reason] of STRONG_TEXT_SIGNALS) {
    if (containsPhrase(text, phrase)) {
      score += 35;
      reasons.push(reason);
    }
  }

  score = Math.min(score, 100);

  if (score >= REJECT_THRESHOLD) {
    return {
      kind: schoolNameToken === undefined ? "TRAINING_ORGANISATION" : "SCHOOL",
      riskScore: score,
      excluded: true,
      reasons,
    };
  }

  if (score >= QUARANTINE_THRESHOLD) {
    // Un seul signal fort : douteux, mais pas tranché. La quarantaine laisse la
    // décision à un contrôle ultérieur plutôt que de rejeter à tort.
    return { kind: "UNKNOWN", riskScore: score, excluded: false, reasons };
  }

  return {
    kind: "EMPLOYER",
    riskScore: score,
    excluded: false,
    reasons: reasons.length > 0 ? reasons : ["Aucun signal d'école."],
  };
};
