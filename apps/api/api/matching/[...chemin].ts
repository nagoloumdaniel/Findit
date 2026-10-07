/*
 * Relais vers le gestionnaire unique de l'API.
 *
 * Vercel ne route qu'un segment après `/api` (mesuré le 2026-10-07). Ce relais
 * couvre `/api/matching/score` et `/api/matching/history` ; le détail d'un
 * matching, plus profond, a son propre relais.
 */
export { default } from "../[...chemin].js";
