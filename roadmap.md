# Roadmap - Web Intelligence Agent

> Pivot du 2026-10-06 : ce document remplace la roadmap « Findit » (scrapers figés + espace candidat). Le produit devient un agent IA autonome de collecte web. Le cahier des charges est [CAHIER_DES_CHARGES.md](CAHIER_DES_CHARGES.md).

## 1. Décisions tranchées (2026-10-06)

| Décision              | Choix                                                                                                                                        |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Espace privé candidat | Supprimé sauf matching/scoring de CV (profil, lettres, candidatures, PDF, `/espace` supprimés ; CV + matching + scoring conservés, agent IA) |
| LLM                   | DeepSeek API uniquement (plus d'Ollama local)                                                                                                |
| Périmètre de départ   | MVP V1 (voir section 3)                                                                                                                      |
| Offres d'écoles       | Exclues (écoles, organismes de formation, termes « école »)                                                                                  |
| ORM                   | Prisma (conservé, pas de migration vers Drizzle)                                                                                             |

## 2. Ce que le pivot change

**Conservé et réutilisé comme outils de l'agent** : le monorepo (Next.js + NestJS + TypeScript + PostgreSQL/Prisma + Redis/BullMQ + Docker), le scheduler du worker, la recherche web (Brave), la découverte, la lecture de `robots.txt`, le registre de conformité et la garde de budget, la classification (dont la détection d'écoles), la déduplication, le pipeline d'ingestion, les notifications Telegram, le dashboard web.

**Supprimé** : l'espace privé candidat (voir décision), et les connecteurs fixes ATS/job boards deviennent des « outils d'extraction spécialisée » que l'agent peut invoquer, plutôt que des scrapers montés en dur.

## 3. MVP V1 (périmètre de départ)

Scheduler + Search + Crawl + Extract + LLM classification + Deduplication + PostgreSQL + Dashboard, sur 10 à 20 sources.

| Phase | Contenu                                                                                                                                                                                                               | État    |
| ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| 0     | Suppression de l'espace privé candidat + réécriture des docs                                                                                                                                                          | à faire |
| 1     | Socle : schéma de données remanié (`sources`, `crawl_jobs`, `crawl_pages`, `search_queries`, `extractions`, `agent_runs`, `agent_actions`, `agent_errors`, `agent_memory`, `notifications`, `users`), dashboard shell | à faire |
| 2     | Agent Search + Discovery (génération de requêtes, scoring des sources)                                                                                                                                                | à faire |
| 3     | Crawl générique (Playwright + Cheerio, profondeur/pagination/déjà-visité, robots.txt)                                                                                                                                 | à faire |
| 4     | Extract + Analyze via DeepSeek (HTML → JSON structuré, classification, exclusion des écoles) + matching/scoring de CV (section 4.11 du cahier des charges)                                                            | à faire |
| 5     | Validate + Deduplicate (score de validation, similarité sémantique)                                                                                                                                                   | à faire |
| 6     | Store + Publish + Scheduler + Memory + Report (journal et erreurs)                                                                                                                                                    | à faire |
| 7     | Dashboard admin (Sources, Jobs, Crawls, Agent, Logs, Configuration, coûts) + notifications                                                                                                                            | à faire |

## 4. V2 (différé)

Agent autonome, retry intelligent, memory avancée, scoring (relevance/freshness/source/completeness), notifications, analytics.

## 5. V3 (différé)

Multi-agents, recherche sémantique, auto-discovery, apprentissage des sources, crawl adaptatif.

## 6. Questions ouvertes

- Q-1 : hébergement (worker, API, web) — où faire tourner le cron en continu ?
- Q-2 : authentification (Better Auth vs autre) et multi-utilisateurs — périmètre exact du MVP ?
- Q-3 : sources de départ du MVP (les 10-20 sources) et leur mode d'accès (pages carrière, API officielle, moteur de recherche) ?
