/*
 * Libellés affichés. Ils vivent ici plutôt que dans `@findit/shared` : le
 * contrat partagé porte des valeurs, pas leur traduction.
 */
export const roleLabels: Record<string, string> = {
  FRONTEND: "Front-end",
  BACKEND: "Back-end",
  FULLSTACK: "Full-stack",
  MOBILE: "Mobile",
  DATA_ANALYST: "Data Analyst",
  DATA_ENGINEER: "Data Engineer",
};

export const contractLabels: Record<string, string> = {
  ALTERNANCE: "Alternance",
  INTERNSHIP: "Stage",
};

export const workModeLabels: Record<string, string> = {
  ONSITE: "Sur site",
  HYBRID: "Hybride",
  REMOTE: "Télétravail",
};

export const departmentLabels: Record<string, string> = {
  "75": "Paris",
  "77": "Seine-et-Marne",
  "78": "Yvelines",
  "91": "Essonne",
  "92": "Hauts-de-Seine",
  "93": "Seine-Saint-Denis",
  "94": "Val-de-Marne",
  "95": "Val-d'Oise",
};

export const salaryPeriodLabels: Record<string, string> = {
  HOUR: "par heure",
  MONTH: "par mois",
  YEAR: "par an",
};

/*
 * Ancienneté lisible. Le calcul est arrondi vers le bas afin de ne jamais
 * annoncer une offre plus récente qu'elle ne l'est.
 */
export const publishedAgo = (publishedAt: string, now: Date): string => {
  const minutes = Math.floor((now.getTime() - new Date(publishedAt).getTime()) / 60000);

  if (minutes < 1) {
    return "à l'instant";
  }

  if (minutes < 60) {
    return `il y a ${minutes} min`;
  }

  const hours = Math.floor(minutes / 60);

  if (hours < 24) {
    return `il y a ${hours} h`;
  }

  const days = Math.floor(hours / 24);
  return days === 1 ? "hier" : `il y a ${days} jours`;
};

/// Date et heure exactes, en Europe/Paris, quel que soit le fuseau du serveur.
export const exactDateTime = (value: string): string =>
  new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "long",
    timeStyle: "short",
    timeZone: "Europe/Paris",
  }).format(new Date(value));

/// Badge de fiabilité, aligné sur les paliers de la spécification.
export const qualityLabel = (score: number): string => {
  if (score >= 85) {
    return "Source très fiable";
  }

  if (score >= 70) {
    return "Source fiable";
  }

  return "Informations partielles";
};
