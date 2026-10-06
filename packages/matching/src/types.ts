/**
 * Types d'entrée et de sortie du matching CV contre offre.
 *
 * Le CV est une vue structurée, pas le fichier brut : un autre agent IA a déjà
 * extrait les faits depuis le PDF/DOCX/TXT (cahier des charges, section 4.11).
 * Ici on ne fait que confronter ces faits à une offre, on ne réextrait rien.
 */

/** Faits structurés d'un CV, extraits en amont. Forme libre mais documentée. */
export interface StructuredCv {
  /** Identité : nom, intitulé actuel, contact, résumé. Texte libre. */
  readonly identity: string;
  /** Expériences professionnelles, une entrée par poste. Texte libre. */
  readonly experiences: readonly string[];
  /** Projets personnels ou académiques. Texte libre. */
  readonly projects: readonly string[];
  /** Compétences techniques et fonctionnelles. Liste simple de chaînes. */
  readonly skills: readonly string[];
  /** Langues parlées, ex. "anglais courant". */
  readonly languages: readonly string[];
  /** Certifications et diplômes. Texte libre. */
  readonly certifications: readonly string[];
}

/** Offre d'emploi allégée, telle qu'elle sort du pipeline d'ingestion. */
export interface JobOfferLite {
  /** Intitulé du poste. */
  readonly title: string;
  /** Description complète de l'offre. */
  readonly description: string;
  /** Technologies ou compétences requises. Liste simple de chaînes. */
  readonly requiredSkills: readonly string[];
  /** Type de contrat : CDI, CDD, alternance, stage... */
  readonly contract: string;
  /** Localisation : ville, région, télétravail... */
  readonly location: string;
}

/**
 * Résultat du matching.
 *
 * Le score est indicatif : il n'est jamais une décision d'employeur. Le champ
 * `recommendation` porte ce rappel, sans exception.
 */
export interface MatchResult {
  /** Score de correspondance, entre 0 et 100. Indicatif. */
  readonly score: number;
  /** Appréciation courte de la pertinence globale, en français. */
  readonly relevance: string;
  /** Compétences du CV couvertes par l'offre. */
  readonly matchedSkills: readonly string[];
  /** Compétences exigées par l'offre et absentes du CV. */
  readonly missingSkills: readonly string[];
  /** Points forts du profil face à l'offre. */
  readonly strengths: readonly string[];
  /** Points faibles ou écarts face à l'offre. */
  readonly weaknesses: readonly string[];
  /** Conseil de suite en français, rappel du caractère indicatif inclus. */
  readonly recommendation: string;
}
