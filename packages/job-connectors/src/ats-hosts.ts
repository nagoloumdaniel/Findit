import { GREENHOUSE_CONNECTOR_NAME } from "./greenhouse.js";

/**
 * Hôte canonique d'un connecteur, et les variantes de board qu'il ramène.
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
 * La table est indexée par hôte, pas par connecteur : seules les variantes
 * réellement observées sont ramenées au canonique. Un hôte inconnu n'est jamais
 * réécrit. Un motif large (`*.greenhouse.io`) fusionnerait aussi des boards que
 * rien ne prouve identiques — et une variante oubliée ne coûte qu'un doublon
 * visible en base, alors qu'une fusion mal fondée est irréversible.
 *
 * Variantes relevées le 2026-10-07 : les deux seuls hôtes de board Greenhouse
 * présents dans `CompanySource` (base réelle) et dans le code
 * (`discovery.ATS_HOSTS`). Ni `boards.eu.greenhouse.io` ni un hôte d'entreprise
 * `<entreprise>.greenhouse.io` n'y figurent : ils restent donc rendus tels quels.
 *
 * Un connecteur absent de cette table garde l'hôte par lequel il a été trouvé :
 * Workday, par exemple, a un hôte différent par entreprise — le canoniser
 * fusionnerait les boards de deux sociétés distinctes.
 */
const CANONICAL_HOST_BY_VARIANT: ReadonlyMap<string, ReadonlyMap<string, string>> = new Map([
  [
    GREENHOUSE_CONNECTOR_NAME,
    new Map([
      ["boards.greenhouse.io", "boards.greenhouse.io"],
      ["job-boards.greenhouse.io", "boards.greenhouse.io"],
    ]),
  ],
]);

/**
 * Hôte à retenir pour ce connecteur : la variante connue ramenée au canonique,
 * sinon `host` inchangé.
 */
export const canonicalAtsHost = (connectorName: string, host: string): string =>
  CANONICAL_HOST_BY_VARIANT.get(connectorName)?.get(host) ?? host;
