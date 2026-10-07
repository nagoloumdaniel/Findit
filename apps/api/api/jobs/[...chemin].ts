/*
 * Relais vers le gestionnaire unique de l'API.
 *
 * Le POURQUOI de ce fichier : le routage de Vercel dans le dossier `api/` ne
 * laisse passer qu'un seul segment après `/api` — mesuré le 2026-10-07, avec les
 * deux formes de catch-all : `/api/jobs` répondait 200, `/api/jobs/stats`
 * renvoyait un 404 sans corps, donc émis par la plateforme et non par Nest. Un
 * relais par préfixe rétablit la profondeur manquante sans dupliquer le code :
 * tout retombe sur le même gestionnaire, qui injecte la requête dans Fastify.
 *
 * À supprimer le jour où Vercel route `[...chemin]` sur plusieurs segments : ce
 * fichier est un contournement, pas une architecture.
 */
export { default } from "../[...chemin].js";
