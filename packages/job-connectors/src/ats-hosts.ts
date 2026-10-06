import { GREENHOUSE_CONNECTOR_NAME } from "./greenhouse.js";

/**
 * Hôte canonique d'un connecteur.
 *
 * Le POURQUOI : le registre est unique par `(entreprise, domaine)`. Or Greenhouse
 * publie sur deux hôtes — `boards.greenhouse.io` et `job-boards.greenhouse.io` —
 * selon l'URL d'où l'entreprise a été découverte. Mesuré en base : `doctolib`
 * portait deux `CompanySource`, une par hôte, donc la même entreprise était
 * collectée deux fois par cycle. Les connecteurs, eux, construisent leur requête
 * depuis le jeton d'entreprise (`boards-api.greenhouse.io/...`) : l'hôte ne leur
 * sert à rien, il n'identifie que la ligne du registre. On le ramène donc à une
 * seule valeur par connecteur, et l'upsert retrouve la même ligne.
 *
 * Un connecteur absent de cette table garde l'hôte par lequel il a été trouvé :
 * Workday, par exemple, a un hôte différent par entreprise.
 */
const CANONICAL_HOST_BY_CONNECTOR: ReadonlyMap<string, string> = new Map([
  [GREENHOUSE_CONNECTOR_NAME, "boards.greenhouse.io"],
]);

/** Hôte à retenir pour ce connecteur, `host` si aucun hôte canonique n'est connu. */
export const canonicalAtsHost = (connectorName: string, host: string): string =>
  CANONICAL_HOST_BY_CONNECTOR.get(connectorName) ?? host;
