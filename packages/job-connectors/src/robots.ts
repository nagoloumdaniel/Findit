/*
 * Lecteur de `robots.txt`.
 *
 * Il existe parce que le registre devient dynamique : Findit a le droit de
 * collecter un domaine qu'il découvre lui-même, mais seulement après avoir lu
 * ce que ce domaine autorise. Ce fichier est donc le garde-fou des sources
 * inconnues, comme le registre l'est des sources écrites à la main.
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
  /** Ligne `Content-Signal`, telle qu'écrite. Voir `parseContentSignal`. */
  readonly contentSignal: string | null;
}

export interface RobotsFile {
  readonly groups: readonly RobotsGroup[];
  readonly sitemaps: readonly string[];
}

/**
 * Découpe un `robots.txt` en groupes.
 *
 * Des `User-agent` consécutifs partagent le groupe qui les suit - c'est le cas
 * réel de Greenhouse et de Workable. Une règle rencontrée après une règle
 * ouvre au contraire un groupe neuf.
 */
export const parseRobots = (text: string): RobotsFile => {
  const groups: RobotsGroup[] = [];
  const sitemaps: string[] = [];

  let agents: string[] = [];
  let allow: string[] = [];
  let disallow: string[] = [];
  let crawlDelay: number | null = null;
  let contentSignal: string | null = null;
  let sawRule = false;

  const closeGroup = (): void => {
    if (agents.length > 0) {
      groups.push({
        userAgents: agents,
        allow,
        disallow,
        crawlDelaySeconds: crawlDelay,
        contentSignal,
      });
    }

    agents = [];
    allow = [];
    disallow = [];
    crawlDelay = null;
    contentSignal = null;
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

      case "content-signal":
        sawRule = true;
        contentSignal = value;
        break;

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
 * l'emporte, et `*` ne sert que si aucun nom ne correspond. C'est ce qui fait
 * que `FinditBot` tombe sous le `Disallow: /` de SmartRecruiters et non sous le
 * `Allow: /v1/companies/` réservé à `LinkedInBot`.
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
  readonly contentSignal: string | null;
}

/**
 * Ce robot a-t-il le droit de demander ce chemin ?
 *
 * `UNKNOWN` quand aucun groupe ne vise ce robot : le fichier ne dit rien de lui.
 * Ce n'est pas un oui - c'est l'appelant qui tranche, et la position du projet
 * est de ne pas collecter ce qui n'est pas explicitement permis.
 */
export const decideRobots = (file: RobotsFile, userAgent: string, path: string): RobotsDecision => {
  const group = groupFor(file, userAgent);

  if (group === null) {
    return {
      verdict: "UNKNOWN",
      detail: `Aucun groupe de ce robots.txt ne vise « ${userAgent} », pas même « * ».`,
      crawlDelayMs: null,
      contentSignal: null,
    };
  }

  const crawlDelayMs =
    group.crawlDelaySeconds === null ? null : Math.round(group.crawlDelaySeconds * 1000);
  const signal = group.contentSignal;

  const allowed = longestMatch(path, group.allow);
  const disallowed = longestMatch(path, group.disallow);

  if (disallowed === -1) {
    return {
      verdict: "ALLOWED",
      detail: "Aucune interdiction ne couvre ce chemin.",
      crawlDelayMs,
      contentSignal: signal,
    };
  }

  /*
   * À égalité de longueur, l'autorisation l'emporte : la norme veut qu'un
   * `Allow` aussi précis qu'un `Disallow` débloque le chemin.
   */
  if (allowed >= disallowed) {
    return {
      verdict: "ALLOWED",
      detail: `Une autorisation aussi précise que l'interdiction couvre ce chemin.`,
      crawlDelayMs,
      contentSignal: signal,
    };
  }

  return {
    verdict: "DISALLOWED",
    detail: `Le fichier interdit ce chemin à « ${userAgent} ».`,
    crawlDelayMs,
    contentSignal: signal,
  };
};

/**
 * Lit une ligne `Content-Signal` en couples clé/valeur.
 *
 * `search=yes,ai-train=no,use=reference` chez Lever, `search=yes, ai-input=yes,
 * ai-train=no` chez Workable : les deux formes existent, avec et sans espace.
 * Une clé absente n'est ni un oui ni un non - la valeur rendue est `undefined`,
 * et le projet exige une décision explicite plutôt qu'un silence interprété.
 */
export const parseContentSignal = (signal: string | null): ReadonlyMap<string, string> => {
  const values = new Map<string, string>();

  if (signal === null) {
    return values;
  }

  for (const part of signal.split(",")) {
    const [key, value] = part.split("=").map((piece) => piece.trim().toLowerCase());
    if (key !== undefined && key !== "" && value !== undefined && value !== "") {
      values.set(key, value);
    }
  }

  return values;
};
