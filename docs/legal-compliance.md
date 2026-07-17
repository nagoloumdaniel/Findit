# Conformité des sources

Ce document décide quels connecteurs ont le droit de s'exécuter. Il précède le code : un connecteur dont la source n'est pas documentée ici reste désactivé.

## Règles absolues

Aucun code du projet ne doit :

- contourner un CAPTCHA ;
- contourner une page de connexion ;
- utiliser des proxys rotatifs pour échapper à un blocage ;
- falsifier le user-agent ou masquer l'identité du robot ;
- réutiliser des cookies ou des identifiants obtenus autrement que par un accès autorisé ;
- dépasser volontairement une limite de requêtes annoncée ;
- ignorer une interdiction explicite de `robots.txt` ou des conditions d'utilisation.

Lorsqu'une source n'est pas accessible légalement, son connecteur est désactivé et la collecte continue avec les autres.

Findit s'identifie toujours. Le user-agent annoncé est :

```text
FinditBot/0.1 (+https://github.com/Nagoloum/Findit)
```

## Statuts d'accès

Le champ `SourceAccessStatus` en base porte l'un de ces statuts.

| Statut                         | Signification                                                             |
| ------------------------------ | ------------------------------------------------------------------------- |
| `OFFICIAL_API`                 | API officielle et documentée, ouverte à cet usage.                        |
| `PUBLIC_FEED`                  | Flux public documenté, sans authentification.                             |
| `AUTHORIZED_CRAWL`             | Collecte autorisée explicitement par la source.                           |
| `SEARCH_ENGINE_DISCOVERY_ONLY` | Découverte via un moteur de recherche autorisé ; pas de collecte directe. |
| `MANUAL_IMPORT`                | Import manuel uniquement.                                                 |
| `DISABLED_PENDING_PERMISSION`  | Aucun accès légal disponible. Connecteur désactivé.                       |
| `PROHIBITED`                   | Accès interdit. Aucun connecteur ne sera écrit.                           |

## Registre des sources

Chaque ligne est vérifiée avant d'être écrite ici. La colonne « vérifié le » date le dernier contrôle réel de `robots.txt` et de la réponse HTTP.

### Greenhouse

| Élément               | Valeur                                                        |
| --------------------- | ------------------------------------------------------------- |
| Statut                | `PUBLIC_FEED`                                                 |
| Accès                 | `GET https://boards-api.greenhouse.io/v1/boards/{token}/jobs` |
| Authentification      | Aucune                                                        |
| `robots.txt`          | `User-agent: *` puis `Disallow: /embed/`                      |
| Chemin utilisé        | `/v1/boards/…` — hors du chemin interdit                      |
| Limite annoncée       | Aucune dans `robots.txt`                                      |
| Cadence appliquée     | 1 requête/seconde, par prudence                               |
| Données conservées    | Offre brute, empreinte du contenu, provenance                 |
| Durée de conservation | 72 h pour l'offre ; l'instantané suit la même échéance        |
| Vérifié le            | 2026-07-17                                                    |

`Disallow: /embed/` ne couvre pas le chemin des offres. La collecte y est donc permise.

### Lever

| Élément               | Valeur                                                     |
| --------------------- | ---------------------------------------------------------- |
| Statut                | `PUBLIC_FEED`                                              |
| Accès                 | `GET https://api.lever.co/v0/postings/{company}?mode=json` |
| Authentification      | Aucune                                                     |
| `robots.txt`          | `User-agent: *`, `Allow: /`, **`Crawl-delay: 1`**          |
| Limite annoncée       | **1 seconde entre deux requêtes, imposée par la source**   |
| Cadence appliquée     | 1 requête/seconde au maximum, jamais dépassée              |
| Données conservées    | Offre brute, empreinte du contenu, provenance              |
| Durée de conservation | 72 h                                                       |
| Vérifié le            | 2026-07-17                                                 |

Le `Crawl-delay` est une contrainte de la source, pas un réglage de confort. Le connecteur doit l'appliquer même si le débit en souffre.

### Ashby

| Élément          | Valeur                                                             |
| ---------------- | ------------------------------------------------------------------ |
| Statut           | `DISABLED_PENDING_PERMISSION`                                      |
| Accès            | `GET https://api.ashbyhq.com/posting-api/job-board/{name}`         |
| Authentification | Aucune                                                             |
| `robots.txt`     | **Renvoie `Unauthorized` — ce n'est pas un fichier robots valide** |
| Vérifié le       | 2026-07-17                                                         |

L'API répond `200` en JSON sans authentification, mais l'absence de `robots.txt` lisible ne vaut pas autorisation. Tant que les conditions d'utilisation n'ont pas été lues et que la position de l'éditeur n'est pas établie, le connecteur reste désactivé. Une réponse `200` n'est pas une permission.

### SmartRecruiters, Teamtailor, Recruitee, Workday

| Élément    | Valeur                        |
| ---------- | ----------------------------- |
| Statut     | `DISABLED_PENDING_PERMISSION` |
| Vérifié le | Pas encore vérifié            |

Aucun accès n'a été contrôlé. Ces connecteurs ne seront pas écrits avant que leur ligne de ce tableau soit remplie à partir d'une vérification réelle.

### LinkedIn, Indeed, Glassdoor, Welcome to the Jungle

| Élément    | Valeur                        |
| ---------- | ----------------------------- |
| Statut     | `DISABLED_PENDING_PERMISSION` |
| Vérifié le | 2026-07-17                    |

Aucune de ces plateformes n'expose d'accès public autorisé pour cet usage. Leurs conditions d'utilisation restreignent la collecte automatisée. Aucun connecteur ne sera activé sans l'un des éléments suivants :

- une API officielle avec une clé obtenue régulièrement ;
- un partenariat écrit ;
- un flux explicitement ouvert à cet usage.

En attendant, la seule voie envisageable est `SEARCH_ENGINE_DISCOVERY_ONLY` : une API de moteur de recherche autorisée peut signaler l'existence d'une offre, et Findit remonte alors à la page carrière officielle de l'entreprise pour la collecter à la source. Le résultat du moteur ne suffit jamais à publier une offre.

## Démarche pour ouvrir une source

1. Lire les conditions d'utilisation et `robots.txt`, et dater la lecture.
2. Établir le régime d'accès et le consigner ici.
3. Demander une autorisation écrite si le régime l'exige.
4. Créer la ligne `Connector` avec le `SourceAccessStatus` correspondant.
5. N'activer le connecteur que si le statut le permet.

## Revue

Les conditions d'une source changent sans préavis. Chaque ligne porte une date de vérification, et `Connector.termsCheckedAt` porte la même information en base. Une source dont la vérification date de plus de trois mois doit être recontrôlée avant d'être considérée comme autorisée.
