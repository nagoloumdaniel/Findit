/*
 * Libellés de métier pour les notifications. Ils vivent ici plutôt que dans
 * `@findit/shared` : le contrat partagé porte des valeurs, pas leur traduction.
 */
const ROLE_LABELS: Record<string, string> = {
  FRONTEND: "Front-end",
  BACKEND: "Back-end",
  FULLSTACK: "Full-stack",
  SOFTWARE_ENGINEERING: "Software Engineering",
  OTHER_DEVELOPER: "Développement",
  MOBILE: "Mobile",
  DATA_ANALYST: "Data Analyst",
  DATA_ENGINEER: "Data Engineer",
};

export const roleLabelOf = (role: string): string => ROLE_LABELS[role] ?? role;
