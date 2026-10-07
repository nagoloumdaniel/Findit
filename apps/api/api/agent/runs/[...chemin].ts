/*
 * Relais vers le gestionnaire unique de l'API.
 *
 * Couvre `/api/agent/runs/:id`, qui a un segment de plus que ce que le relais
 * `api/agent/[...chemin].ts` sait atteindre sur Vercel.
 */
export { default } from "../../[...chemin].js";
