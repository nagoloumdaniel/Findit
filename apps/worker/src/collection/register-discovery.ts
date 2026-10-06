import type { PrismaClient } from "@findit/database";
import {
  collectDiscoveries,
  isAggregatorTenant,
  registerDiscoveredSource,
} from "@findit/job-connectors";

import { toDiscoveredSource } from "./run-cycle.js";

/**
 * Enregistre une URL découverte par l'agent auprès du registre.
 *
 * Le POURQUOI : l'agent trouvait des entreprises sur des ATS et n'en faisait
 * rien. Mesuré, aucun run d'agent n'avait créé de `CompanySource`, alors que le
 * cycle natif en tire un flux complet par simple reconnaissance d'URL — l'agent
 * payait donc un crawl et une extraction pour des offres que son connecteur
 * saurait obtenir mieux.
 *
 * Seules les entreprises des ATS à jeton sont enregistrables (Greenhouse, Lever,
 * Workday : voir `TOKEN_CONNECTOR_ATS`). Workable, dont le connecteur collecte
 * par requête et non par entreprise, n'a rien à faire au registre ; un hôte
 * inconnu relève du registre dynamique, qui exige de lire son `robots.txt`.
 *
 * Rend une phrase à journaliser — les sources **nouvelles** seulement, car
 * relire une entreprise déjà connue n'apprend rien — ou `null` quand l'URL
 * n'apporte rien au registre.
 */
export const registerDiscoveryFromUrl = async (
  prisma: PrismaClient,
  url: string,
): Promise<string | null> => {
  let host: string;
  try {
    host = new URL(url).host;
  } catch {
    return null;
  }

  const discoveries = collectDiscoveries([{ url, title: url, description: "", host }]);
  const created: string[] = [];
  const aggregators: string[] = [];

  for (const known of discoveries.known) {
    const source = toDiscoveredSource(known);
    if (source === null) {
      continue;
    }

    /*
     * Un locataire d'ATS qui publie les offres des autres n'est pas un
     * employeur : l'enregistrer ferait payer à chaque cycle le tri de milliers
     * d'offres qui ne sont pas les siennes (mesuré : 3 501 offres sur 4 251 pour
     * `lever/jobgether`).
     */
    if (isAggregatorTenant(source.connectorName, source.atsIdentifier)) {
      aggregators.push(`${source.connectorName}/${source.atsIdentifier}`);
      continue;
    }

    try {
      const outcome = await registerDiscoveredSource(prisma, source);
      if (outcome.registered && outcome.created) {
        created.push(`${source.connectorName}/${source.atsIdentifier}`);
      }
    } catch {
      // Une découverte non enregistrée ne vaut pas de faire échouer le run :
      // l'appelant consigne, et la collecte du tour continue.
      continue;
    }
  }

  const notes: string[] = [];
  if (created.length > 0) {
    notes.push(`enregistrée · ${created.join(", ")}`);
  }
  if (aggregators.length > 0) {
    notes.push(`agrégateur ignoré · ${aggregators.join(", ")}`);
  }

  return notes.length === 0 ? null : notes.join(" · ");
};
