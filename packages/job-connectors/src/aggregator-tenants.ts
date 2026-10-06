import { LEVER_CONNECTOR_NAME } from "./lever.js";

/**
 * Locataires d'ATS qui sont en réalité des agrégateurs d'offres.
 *
 * Le POURQUOI : un locataire d'ATS est censé être un employeur — son flux ne
 * contient que ses propres offres. Certains publient celles des autres. Mesuré
 * sur une collecte de 10 sources fraîchement découvertes par l'agent :
 * `lever/jobgether` a rendu **3 501 des 4 251 offres** à lui seul. L'enregistrer
 * comme une entreprise revient à confondre un job board avec un employeur : le
 * registre le recollecte à chaque cycle, et paie le tri de milliers d'offres qui
 * ne sont pas les siennes.
 *
 * La liste est volontairement courte et citée : elle ne devine pas, elle
 * constate. Un agrégateur non listé reste un trou connu — le signal général
 * serait le volume du flux, ou le nom d'entreprise porté par les offres.
 */
const AGGREGATOR_TENANTS: ReadonlyMap<string, ReadonlySet<string>> = new Map([
  [LEVER_CONNECTOR_NAME, new Set(["jobgether"])],
]);

/** Vrai quand ce locataire publie les offres d'autres employeurs. */
export const isAggregatorTenant = (connectorName: string, atsIdentifier: string): boolean =>
  AGGREGATOR_TENANTS.get(connectorName)?.has(atsIdentifier.trim().toLowerCase()) ?? false;
