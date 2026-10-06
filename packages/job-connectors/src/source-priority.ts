/**
 * Rang de confiance d'une source, écrit dans `JobSource.priority`. Quand une même
 * offre est vue par plusieurs sources, la mieux classée est la canonique : celle
 * que le public voit et vers laquelle il est renvoyé.
 *
 * Une source officielle - l'ATS de l'entreprise, l'API de l'État - prime
 * toujours sur un job board, qui ne fait que relayer l'offre de l'employeur.
 */
export const SOURCE_PRIORITY_OFFICIAL = 100;

/** Un job board relaie des offres dont la source de vérité est ailleurs. */
export const SOURCE_PRIORITY_JOB_BOARD = 40;
