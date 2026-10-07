/*
 * Relais vers le gestionnaire unique de l'API.
 *
 * Vercel ne route qu'un segment après `/api` (mesuré le 2026-10-07 : `/api/jobs`
 * répondait, `/api/jobs/stats` non). Ce relais couvre les routes de l'agent
 * (`/api/agent/runs`, `/stats`, `/analytics`, `/sources`) ; `/api/agent/runs/:id`,
 * plus profond, a son propre relais.
 */
export { default } from "../[...chemin].js";
