/*
 * Libellés affichés. Ils vivent ici plutôt que dans `@findit/shared` : le
 * contrat partagé porte des valeurs, pas leur traduction.
 */
export const roleLabels: Record<string, string> = {
  FRONTEND: "Front-end",
  BACKEND: "Back-end",
  FULLSTACK: "Full-stack",
  SOFTWARE_ENGINEERING: "Software Engineering",
  OTHER_DEVELOPER: "Autre développement",
  MOBILE: "Mobile",
  DATA_ANALYST: "Data Analyst",
  DATA_ENGINEER: "Data Engineer",
  OTHER: "Tous domaines",
};

export const contractLabels: Record<string, string> = {
  ALTERNANCE: "Alternance",
  INTERNSHIP: "Stage",
  CDI: "CDI",
  CDD: "CDD",
  INTERIM: "Intérim",
  STUDENT_JOB: "Job étudiant",
};

export const workModeLabels: Record<string, string> = {
  ONSITE: "Sur site",
  HYBRID: "Hybride",
  REMOTE: "Télétravail",
};

/*
 * Départements français, code → nom. Toute la France est couverte ; un code
 * absent de la table s'affiche tel quel (le nom n'est pas inventé).
 */
export const departmentLabels: Record<string, string> = {
  "01": "Ain",
  "02": "Aisne",
  "03": "Allier",
  "04": "Alpes-de-Haute-Provence",
  "05": "Hautes-Alpes",
  "06": "Alpes-Maritimes",
  "07": "Ardèche",
  "08": "Ardennes",
  "09": "Ariège",
  "10": "Aube",
  "11": "Aude",
  "12": "Aveyron",
  "13": "Bouches-du-Rhône",
  "14": "Calvados",
  "15": "Cantal",
  "16": "Charente",
  "17": "Charente-Maritime",
  "18": "Cher",
  "19": "Corrèze",
  "2A": "Corse-du-Sud",
  "2B": "Haute-Corse",
  "21": "Côte-d'Or",
  "22": "Côtes-d'Armor",
  "23": "Creuse",
  "24": "Dordogne",
  "25": "Doubs",
  "26": "Drôme",
  "27": "Eure",
  "28": "Eure-et-Loir",
  "29": "Finistère",
  "30": "Gard",
  "31": "Haute-Garonne",
  "32": "Gers",
  "33": "Gironde",
  "34": "Hérault",
  "35": "Ille-et-Vilaine",
  "36": "Indre",
  "37": "Indre-et-Loire",
  "38": "Isère",
  "39": "Jura",
  "40": "Landes",
  "41": "Loir-et-Cher",
  "42": "Loire",
  "43": "Haute-Loire",
  "44": "Loire-Atlantique",
  "45": "Loiret",
  "46": "Lot",
  "47": "Lot-et-Garonne",
  "48": "Lozère",
  "49": "Maine-et-Loire",
  "50": "Manche",
  "51": "Marne",
  "52": "Haute-Marne",
  "53": "Mayenne",
  "54": "Meurthe-et-Moselle",
  "55": "Meuse",
  "56": "Morbihan",
  "57": "Moselle",
  "58": "Nièvre",
  "59": "Nord",
  "60": "Oise",
  "61": "Orne",
  "62": "Pas-de-Calais",
  "63": "Puy-de-Dôme",
  "64": "Pyrénées-Atlantiques",
  "65": "Hautes-Pyrénées",
  "66": "Pyrénées-Orientales",
  "67": "Bas-Rhin",
  "68": "Haut-Rhin",
  "69": "Rhône",
  "70": "Haute-Saône",
  "71": "Saône-et-Loire",
  "72": "Sarthe",
  "73": "Savoie",
  "74": "Haute-Savoie",
  "75": "Paris",
  "76": "Seine-Maritime",
  "77": "Seine-et-Marne",
  "78": "Yvelines",
  "79": "Deux-Sèvres",
  "80": "Somme",
  "81": "Tarn",
  "82": "Tarn-et-Garonne",
  "83": "Var",
  "84": "Vaucluse",
  "85": "Vendée",
  "86": "Vienne",
  "87": "Haute-Vienne",
  "88": "Vosges",
  "89": "Yonne",
  "90": "Territoire de Belfort",
  "91": "Essonne",
  "92": "Hauts-de-Seine",
  "93": "Seine-Saint-Denis",
  "94": "Val-de-Marne",
  "95": "Val-d'Oise",
  "971": "Guadeloupe",
  "972": "Martinique",
  "973": "Guyane",
  "974": "La Réunion",
  "976": "Mayotte",
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
