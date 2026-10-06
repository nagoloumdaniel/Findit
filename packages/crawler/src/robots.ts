/*
 * Lecteur de `robots.txt`, copié de packages/job-connectors/src/robots.ts.
 *
 * Pourquoi une copie et pas une dépendance : `@findit/job-connectors` tire
 * Prisma et la base de données derrière lui, alors que le crawler doit rester
 * une brique légère et autonome. La logique est identique au caractère près ;
 * seule la lecture de `Content-Signal` a été retirée, parce que le crawler ne
 * l'interprète pas, c'est l'affaire des connecteurs.
 *
 * Il ne devine rien. Un fichier illisible n'est pas une permission, et une
 * absence de règle n'est pas un oui implicite : c'est l'appelant qui décide de
 * ce qu'il fait d'un `UNKNOWN`.
 */

export interface RobotsGroup {
  readonly userAgents: readonly string[];
  readonly allow: readonly string[];
  readonly disallow: readonly string[];
  readonly crawlDelaySeconds: number | null;
}

export interface RobotsFile {
  readonly groups: readonly RobotsGroup[];
  readonly sitemaps: readonly string[];
}

/**
 * Découpe un `robots.txt` en groupes.
 *
 * Des `User-agent` consécutifs partagent le groupe qui les suit, c'est le cas
 * réel de Greenhouse et de Workable. Une règle rencontrée après une règle ouvre
 * au contraire un groupe neuf.
 */
export const parseRobots = (text: string): RobotsFile => {
  const groups: RobotsGroup[] = [];
  const sitemaps: string[] = [];

  let agents: string[] = [];
  let allow: string[] = [];
  let disallow: string[] = [];
  let crawlDelay: number | null = null;
  let sawRule = false;

  const closeGroup = (): void => {
    if (agents.length > 0) {
      groups.push({
        userAgents: agents,
        allow,
        disallow,
        crawlDelaySeconds: crawlDelay,
      });
    }

    agents = [];
    allow = [];
    disallow = [];
    crawlDelay = null;
    sawRule = false;
  };

  for (const rawLine of text.split(/\r?\n/)) {
    // Tout ce qui suit un « # » est un commentaire, y compris en fin de ligne.
    const line = rawLine.split("#")[0]?.trim() ?? "";
    if (line === "") {
      continue;
    }

    const separator = line.indexOf(":");
    if (separator === -1) {
      continue;
    }

    const field = line.slice(0, separator).trim().toLowerCase();
    const value = line.slice(separator + 1).trim();

    switch (field) {
      case "user-agent":
        if (sawRule) {
          closeGroup();
        }
        agents.push(value.toLowerCase());
        break;

      case "allow":
        sawRule = true;
        if (value !== "") {
          allow.push(value);
        }
        break;

      case "disallow":
        sawRule = true;
        // « Disallow: » vide n'interdit rien : c'est une permission générale,
        // et c'est exactement ce que Workable écrit.
        if (value !== "") {
          disallow.push(value);
        }
        break;

      case "crawl-delay": {
        sawRule = true;
        const parsed = Number(value);
        if (Number.isFinite(parsed) && parsed >= 0) {
          crawlDelay = parsed;
        }
        break;
      }

      case "sitemap":
        sitemaps.push(value);
        break;

      default:
        break;
    }
  }

  closeGroup();

  return { groups, sitemaps };
};

/**
 * Choisit le groupe qui s'applique à un robot.
 *
 * La règle de la norme : le groupe dont le `User-agent` est le plus spécifique
 * l'emporte, et `*` ne sert que si aucun nom ne correspond.
 */
export const groupFor = (file: RobotsFile, userAgent: string): RobotsGroup | null => {
  const needle = userAgent.toLowerCase();
  let best: RobotsGroup | null = null;
  let bestLength = -1;

  for (const group of file.groups) {
    for (const agent of group.userAgents) {
      if (agent === "*") {
        if (bestLength < 0) {
          best = group;
          bestLength = 0;
        }
        continue;
      }

      if (needle.includes(agent) && agent.length > bestLength) {
        best = group;
        bestLength = agent.length;
      }
    }
  }

  return best;
};

/**
 * Un motif de `robots.txt` couvre-t-il ce chemin ?
 *
 * `*` vaut n'importe quelle suite, `$` ancre la fin. Le reste est un préfixe,
 * ce qui est la règle de la norme et non une approximation.
 */
const matchesPattern = (path: string, pattern: string): boolean => {
  const anchored = pattern.endsWith("$");
  const body = anchored ? pattern.slice(0, -1) : pattern;

  const escaped = body.replace(/[.+?^${}()|[\]\\]/gu, "\\$&").replace(/\*/gu, ".*");
  const expression = new RegExp(`^${escaped}${anchored ? "$" : ""}`, "u");

  return expression.test(path);
};

const longestMatch = (path: string, patterns: readonly string[]): number =>
  patterns.reduce(
    (longest, pattern) =>
      matchesPattern(path, pattern) ? Math.max(longest, pattern.length) : longest,
    -1,
  );

export type RobotsVerdict = "ALLOWED" | "DISALLOWED" | "UNKNOWN";

export interface RobotsDecision {
  readonly verdict: RobotsVerdict;
  readonly detail: string;
  /** Cadence imposée par la source, en millisecondes. `null` si rien n'est annoncé. */
  readonly crawlDelayMs: number | null;
}

/**
 * Ce robot a-t-il le droit de demander ce chemin ?
 *
 * `UNKNOWN` quand aucun groupe ne vise ce robot : le fichier ne dit rien de lui.
 * Ce n'est pas un oui, c'est l'appelant qui tranche. Le crawler, lui, le traite
 * comme permis : la norme veut que `robots.txt` ne fasse que restreindre, et le
 * silence ne restreint pas.
 */
export const decideRobots = (file: RobotsFile, userAgent: string, path: string): RobotsDecision => {
  const group = groupFor(file, userAgent);

  if (group === null) {
    return {
      verdict: "UNKNOWN",
      detail: `Aucun groupe de ce robots.txt ne vise « ${userAgent} », pas même « * ».`,
      crawlDelayMs: null,
    };
  }

  const crawlDelayMs =
    group.crawlDelaySeconds === null ? null : Math.round(group.crawlDelaySeconds * 1000);

  const allowed = longestMatch(path, group.allow);
  const disallowed = longestMatch(path, group.disallow);

  if (disallowed === -1) {
    return {
      verdict: "ALLOWED",
      detail: "Aucune interdiction ne couvre ce chemin.",
      crawlDelayMs,
    };
  }

  /*
   * À égalité de longueur, l'autorisation l'emporte : la norme veut qu'un
   * `Allow` aussi précis qu'un `Disallow` débloque le chemin.
   */
  if (allowed >= disallowed) {
    return {
      verdict: "ALLOWED",
      detail: "Une autorisation aussi précise que l'interdiction couvre ce chemin.",
      crawlDelayMs,
    };
  }

  return {
    verdict: "DISALLOWED",
    detail: `Le fichier interdit ce chemin à « ${userAgent} ».`,
    crawlDelayMs,
  };
};
