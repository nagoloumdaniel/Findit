/*
 * Relais vers le gestionnaire unique de l'API.
 *
 * Couvre `/api/matching/history/:id`, un segment de plus que ce que le relais
 * `api/matching/[...chemin].ts` atteint sur Vercel.
 */
export { default } from "../../[...chemin].js";
