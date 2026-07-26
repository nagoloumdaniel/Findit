/*
 * Données que le modèle de lettre sait afficher. Les formules d'usage
 * (adresse, politesse) appartiennent au modèle de document : elles ne sont ni
 * des faits ni de l'IA. Tout le reste vient des données reçues, rien d'autre.
 */

export type CoverLetterDocumentData = {
  /** Nom du candidat, repris en signature. */
  senderName?: string | undefined;
  /** Lignes de contact affichées sous le nom (e-mail, téléphone, ville). */
  senderContact: string[];
  companyName: string;
  jobTitle: string;
  /** « Paris, le 26 juillet 2026 » — fournie par l'appelant, jamais calculée ici. */
  cityAndDate?: string | undefined;
  subject: string;
  /** Corps de la lettre, sans adresse ni politesse : le modèle les ajoute. */
  paragraphs: string[];
};
