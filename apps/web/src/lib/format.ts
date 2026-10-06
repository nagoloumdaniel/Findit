/**
 * Mises en forme partagées du dashboard.
 *
 * Le POURQUOI de quatre décimales pour un coût : un run de l'agent coûte des
 * centimes, pas des euros ; arrondir à deux décimales effacerait la dépense
 * réelle et ferait afficher « 0,00 $ » pour un run qui a bien consommé.
 *
 * Le POURQUOI de `Intl` : le dashboard est en français. `toFixed` rendait
 * « 0.0054 $ » au milieu de nombres séparés à la française ; la virgule doit
 * suivre la même règle que le reste de la page.
 */
const USD_FORMAT = new Intl.NumberFormat("fr-FR", {
  minimumFractionDigits: 4,
  maximumFractionDigits: 4,
});

export const formatUsd = (microUsd: number): string =>
  `${USD_FORMAT.format(microUsd / 1_000_000)} $`;

/** Nombre lisible au format français, quel que soit le fuseau du serveur. */
export const formatCount = (value: number): string => new Intl.NumberFormat("fr-FR").format(value);
