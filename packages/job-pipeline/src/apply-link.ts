/**
 * Choix du lien de candidature d'une offre.
 *
 * Une offre vue sur un job board renvoie souvent vers la page de l'ATS de
 * l'employeur : c'est là qu'on postule. Quand l'offre est connue de plusieurs
 * sources, le lien retenu est celui de l'employeur, jamais celui d'un
 * intermédiaire - et, à défaut, celui de la source la mieux classée.
 */

/**
 * Hôtes de job boards : des intermédiaires, pas des employeurs. La liste est
 * volontairement courte et explicite ; un hôte absent est traité comme un site
 * d'employeur, ce qui est le bon défaut (un faux « employeur » reste un lien
 * valide, un faux « job board » ferait perdre le lien direct).
 */
const JOB_BOARD_HOSTS: readonly string[] = [
  "welcometothejungle.com",
  "linkedin.com",
  "indeed.com",
  "indeed.fr",
  "glassdoor.com",
  "glassdoor.fr",
  "hellowork.com",
  "jobijoba.com",
  "free-work.com",
  "cadremploi.fr",
  "monster.fr",
  "talent.io",
];

const hostOf = (url: string): string | null => {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" || parsed.protocol === "http:"
      ? parsed.hostname.toLowerCase()
      : null;
  } catch {
    return null;
  }
};

/** Vrai pour une page d'un job board connu, sous-domaines compris. */
export const isJobBoardUrl = (url: string): boolean => {
  const host = hostOf(url);
  if (host === null) {
    return false;
  }

  return JOB_BOARD_HOSTS.some((board) => host === board || host.endsWith(`.${board}`));
};

export interface ApplyCandidate {
  readonly url: string;
  /** Rang de la source qui a donné ce lien : le plus élevé l'emporte. */
  readonly priority: number;
}

/**
 * Rend le meilleur lien de candidature parmi ceux qu'on connaît, ou `null` si
 * aucun n'est une URL web valide. Un lien d'employeur l'emporte toujours sur un
 * lien de job board ; à égalité de nature, la source de rang le plus élevé, puis
 * la première rencontrée.
 */
export const chooseApplyUrl = (candidates: readonly ApplyCandidate[]): string | null => {
  const valid = candidates.filter((candidate) => hostOf(candidate.url) !== null);
  const employer = valid.filter((candidate) => !isJobBoardUrl(candidate.url));
  const pool = employer.length > 0 ? employer : valid;

  let best: ApplyCandidate | null = null;
  for (const candidate of pool) {
    if (best === null || candidate.priority > best.priority) {
      best = candidate;
    }
  }

  return best?.url ?? null;
};
