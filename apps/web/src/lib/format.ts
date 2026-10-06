/**
 * Mises en forme partagées du dashboard.
 *
 * Le POURQUOI de quatre décimales pour un coût : un run de l'agent coûte des
 * centimes, pas des euros ; arrondir à deux décimales effacerait la dépense
 * réelle et ferait afficher « 0,00 $ » pour un run qui a bien consommé.
 */
export const formatUsd = (microUsd: number): string => `${(microUsd / 1_000_000).toFixed(4)} $`;

/** Nombre lisible au format français, quel que soit le fuseau du serveur. */
export const formatCount = (value: number): string => new Intl.NumberFormat("fr-FR").format(value);
