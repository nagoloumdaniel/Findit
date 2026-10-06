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
- ignorer une interdiction explicite de `robots.txt` ou des conditions d'utilisation, sauf la dérogation écrite du propriétaire pour les job boards (section « Décision du propriétaire du 2026-10-05 »), qui ne lève aucune des interdictions ci-dessus.

Lorsqu'une source n'est pas accessible légalement, son connecteur est désactivé et la collecte continue avec les autres.

Findit s'identifie toujours. Le user-agent annoncé est :

```text
FinditBot/0.1 (+https://github.com/Nagoloum/Findit)
```

## Statuts d'accès

Le champ `SourceAccessStatus` en base porte l'un de ces statuts.

| Statut                         | Signification                                                                  |
| ------------------------------ | ------------------------------------------------------------------------------ |
| `OFFICIAL_API`                 | API officielle et documentée, ouverte à cet usage.                             |
| `PUBLIC_FEED`                  | Flux public documenté, sans authentification.                                  |
| `AUTHORIZED_CRAWL`             | Collecte autorisée explicitement par la source.                                |
| `SEARCH_ENGINE_DISCOVERY_ONLY` | Découverte via un moteur de recherche autorisé ; pas de collecte directe.      |
| `MANUAL_IMPORT`                | Import manuel uniquement.                                                      |
| `DISABLED_PENDING_PERMISSION`  | Aucun accès légal disponible. Connecteur désactivé.                            |
| `PROHIBITED`                   | Accès interdit. Aucun connecteur ne sera écrit.                                |
| `OWNER_ACCEPTED_SCRAPING`      | Accès toléré, non autorisé : le propriétaire assume le risque (voir plus bas). |

## Registre des sources

Chaque ligne est vérifiée avant d'être écrite ici. La colonne « vérifié le » date le dernier contrôle réel de `robots.txt` et de la réponse HTTP.

### Greenhouse

| Élément               | Valeur                                                        |
| --------------------- | ------------------------------------------------------------- |
| Statut                | `PUBLIC_FEED`                                                 |
| Accès                 | `GET https://boards-api.greenhouse.io/v1/boards/{token}/jobs` |
| Authentification      | Aucune                                                        |
| `robots.txt`          | `User-agent: *` puis `Disallow: /embed/`                      |
| Chemin utilisé        | `/v1/boards/…` - hors du chemin interdit                      |
| Limite annoncée       | Aucune dans `robots.txt`                                      |
| Cadence appliquée     | 1 requête/seconde, par prudence                               |
| Données conservées    | Offre brute, empreinte du contenu, provenance                 |
| Durée de conservation | 72 h pour l'offre ; l'instantané suit la même échéance        |
| Vérifié le            | 2026-07-17                                                    |

`Disallow: /embed/` ne couvre pas le chemin des offres. La collecte y est donc permise.

### Lever

| Élément                        | Valeur                                                                |
| ------------------------------ | --------------------------------------------------------------------- |
| Statut                         | `PUBLIC_FEED`                                                         |
| Accès                          | `GET https://api.lever.co/v0/postings/{company}?mode=json`            |
| Authentification               | Aucune                                                                |
| `robots.txt` (`api.lever.co`)  | `User-agent: *`, `Allow: /`, **`Crawl-delay: 1`**                     |
| `robots.txt` (`jobs.lever.co`) | `User-agent: *`, `Allow: /`, `Crawl-delay: 1`, plus un content signal |
| Content signal                 | **`search=yes,ai-train=no,use=reference`**                            |
| Limite annoncée                | **1 seconde entre deux requêtes, imposée par la source**              |
| Cadence appliquée              | 1 requête/seconde au maximum, jamais dépassée                         |
| Données conservées             | Offre brute, empreinte du contenu, provenance                         |
| Durée de conservation          | 72 h                                                                  |
| Vérifié le                     | 2026-07-17                                                            |

Le `Crawl-delay` est une contrainte de la source, pas un réglage de confort. Le connecteur doit l'appliquer même si le débit en souffre.

Lever déclare aussi un **content signal**, qui dit à quoi son contenu a le droit de servir. Il ne
porte pas sur l'accès mais sur l'usage, et il engage tout le projet, pas seulement le connecteur :

- `search=yes` - construire un index de recherche et rendre des résultats est **autorisé**. C'est
  exactement l'usage de la liste publique de Findit.
- `ai-train=no` - entraîner ou affiner un modèle sur ce contenu est **interdit**. Aucune offre venant
  de Lever ne doit servir à entraîner un modèle, ni partir chez un fournisseur d'IA qui s'autorise à
  entraîner sur ce qu'il reçoit. La phase 6 devra choisir son fournisseur en conséquence, et le
  vérifier dans ses conditions plutôt que le supposer.
- `ai-input` n'est pas déclaré. Lever ne l'accorde ni ne le refuse. En l'absence de position, envoyer
  une offre à un modèle pour l'analyser demande une décision explicite, pas un silence interprété
  comme un oui.

Les bots d'IA nommément désignés - `GPTBot`, `ClaudeBot`, `CCBot`, `Google-Extended`,
`Applebot-Extended`, `Bytespider`, `meta-externalagent` - sont interdits sur `jobs.lever.co`.
`FinditBot` n'en fait pas partie et relève de `User-agent: *`, qui l'autorise.

### Ashby

| Élément          | Valeur                                                             |
| ---------------- | ------------------------------------------------------------------ |
| Statut           | `DISABLED_PENDING_PERMISSION`                                      |
| Accès            | `GET https://api.ashbyhq.com/posting-api/job-board/{name}`         |
| Authentification | Aucune                                                             |
| `robots.txt`     | **Renvoie `Unauthorized` - ce n'est pas un fichier robots valide** |
| Vérifié le       | 2026-07-17                                                         |

L'API répond `200` en JSON sans authentification, mais l'absence de `robots.txt` lisible ne vaut pas autorisation. Tant que les conditions d'utilisation n'ont pas été lues et que la position de l'éditeur n'est pas établie, le connecteur reste désactivé. Une réponse `200` n'est pas une permission.

### SmartRecruiters

| Élément               | Valeur                                                                                        |
| --------------------- | --------------------------------------------------------------------------------------------- |
| Statut                | `DISABLED_PENDING_PERMISSION`                                                                 |
| Accès envisagé        | `GET https://api.smartrecruiters.com/v1/companies/{id}/postings`                              |
| `robots.txt` (`api.`) | **`User-agent: LinkedInBot` → `Allow: /v1/companies/`, puis `User-agent: *` → `Disallow: /`** |
| `robots.txt` (`www.`) | `User-agent: *`, aucun `Disallow: /`, mais 73 entreprises nommément interdites                |
| Vérifié le            | 2026-07-17                                                                                    |

**L'API n'est ouverte qu'à LinkedIn.** `FinditBot` relève de `User-agent: *`, et ce groupe interdit
tout le chemin. L'API répondrait `200` sans authentification - mais une réponse n'est pas une
permission, et se faire passer pour `LinkedInBot` tomberait sous l'interdiction absolue de falsifier
le user-agent. Le connecteur reste désactivé.

Les pages carrières publiques de `www.smartrecruiters.com` sont, elles, permises - sauf pour les 73
entreprises que le fichier nomme. Cette voie reste ouverte si elle est un jour empruntée : elle
imposerait de relire ce `robots.txt` à chaque collecte, la liste des interdits étant propre à chaque
entreprise.

### Workable

| Élément                 | Valeur                                                                                                |
| ----------------------- | ----------------------------------------------------------------------------------------------------- |
| Statut                  | `PUBLIC_FEED` - **activable**                                                                         |
| Accès                   | `GET https://jobs.workable.com/api/v1/jobs?query=…&location=…`                                        |
| Authentification        | Aucune                                                                                                |
| `robots.txt` (`apply.`) | `User-agent: *`, **`Disallow:` vide - rien n'est interdit**                                           |
| `robots.txt` (`jobs.`)  | `User-agent: *`, `Allow: /search/*`, interdits sur `/search…` et `/profile*` ; `/api/` n'est pas visé |
| Content signal          | **`search=yes, ai-input=yes, ai-train=no`**                                                           |
| Limite annoncée         | Aucun `Crawl-delay`                                                                                   |
| Cadence à appliquer     | 1 requête/seconde, par prudence                                                                       |
| Vérifié le              | 2026-07-17                                                                                            |

Workable est la première source à **accorder explicitement `ai-input`**. Envoyer une de ses offres à
un modèle pour l'analyser est donc permis, ce que Lever ne dit ni ne refuse. `ai-train=no` reste
identique à Lever : aucune offre Workable ne doit servir à entraîner un modèle.

L'API `jobs.workable.com/api/v1/jobs` cherche à travers tout le réseau Workable, pas une entreprise à
la fois, et rend une localisation **structurée** - `{ city, subregion, countryName }`, où `subregion`
vaut « Île-de-France ». Aucun des autres ATS vérifiés ne donne cette information.

### France Travail

| Élément             | Valeur                                                                                                   |
| ------------------- | -------------------------------------------------------------------------------------------------------- |
| Statut              | `OFFICIAL_API` - **activable**                                                                           |
| Accès               | `GET https://api.francetravail.io/partenaire/offresdemploi/v2/offres/search`                             |
| Authentification    | OAuth2 « client credentials » (`entreprise.francetravail.fr`), inscription gratuite sur francetravail.io |
| Limite annoncée     | 10 requêtes/seconde par clé                                                                              |
| Cadence à appliquer | 1 requête/seconde - largement suffisant, loin du plafond                                                 |
| Vérifié le          | 2026-07-26                                                                                               |

C'est l'API officielle de l'État, conçue exactement pour cet usage : le régime d'accès le plus
clair du registre. L'accès exige un compte partenaire (gratuit) et ses identifiants ; sans eux, le
connecteur n'est pas monté dans le cycle. Le filtre serveur porte l'alternance (`natureContrat`),
la région (`region=11`) et la fraîcheur (`publieeDepuis=3`). Les identifiants restent côté
serveur - jamais dans le navigateur, un log ou la base. Forme confirmée à la première collecte
réelle le 2026-07-26 : 2 offres fraîches d'alternance développeur en Île-de-France, acceptées et
publiées. Beaucoup d'offres n'ont pas d'employeur structuré (dépôts anonymes ou partenaires) :
elles portent le libellé « Inconnu » - l'absence est nommée, jamais un nom extrait de la prose.

### Workday

| Élément             | Valeur                                                                                                                  |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Statut              | `AUTHORIZED_CRAWL` - **activable, locataire par locataire**                                                             |
| Accès               | `POST https://{hôte}.myworkdayjobs.com/wday/cxs/{locataire}/{site}/jobs` puis `GET …/job/{chemin}`                      |
| Authentification    | Aucune - c'est le flux que la page carrière publique charge elle-même                                                   |
| `robots.txt`        | **Un par locataire.** Relevé sur `workday.wd5.myworkdayjobs.com` : `User-agent: *` avec `Allow:` sur les sites carrière |
| Limite annoncée     | Aucun `Crawl-delay` sur les locataires relevés                                                                          |
| Cadence à appliquer | 1 requête/seconde ; un `Crawl-delay` plus long vaut refus                                                               |
| Vérifié le          | 2026-07-26                                                                                                              |

La particularité : chaque entreprise vit sur son propre sous-domaine, avec son propre
`robots.txt`. La vérification d'un locataire ne vaut donc **rien** pour les autres - c'est le cas
prévu par le registre dynamique. Le connecteur relit le `robots.txt` du locataire **avant chaque
collecte** et exige `ALLOWED` sur le site carrière et sur le flux ; `UNKNOWN`, un fichier muet ou
un `Crawl-delay` intenable valent refus. Constaté en réel le 2026-07-26 : Thales (`Disallow` sur
son site) est refusé, Workday (`Allow`) est collecté - les deux chemins fonctionnent.

Le détail d'une offre porte une date absolue (`startDate`), une description et l'URL officielle ;
le libellé relatif « Posted N Days Ago » de la liste ne sert qu'à écarter le vieux sans requête,
jamais à fabriquer une date.

### SAP SuccessFactors

| Élément    | Valeur                        |
| ---------- | ----------------------------- |
| Statut     | `DISABLED_PENDING_PERMISSION` |
| Vérifié le | 2026-07-26                    |

Vérifié et resté fermé : aucun flux JSON public stable n'existe, chaque locataire diffère
(`jobs.sap.com` n'interdit que la candidature et `/services/`, mais rien ne garantit la même
chose ailleurs). Un connecteur exigerait une vérification par locataire ET un lecteur HTML par
variante de site - la voie n'est pas empruntée à ce jour.

### Teamtailor, Recruitee

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

#### Décision du propriétaire du 2026-10-05

Le propriétaire a ordonné la collecte de LinkedIn, Welcome to the Jungle, HelloWork, Glassdoor, Indeed et des autres job boards (roadmap, phases 21 et 22). Cette décision remplace le refus ci-dessus pour ces sites.

**Ce qui est en place (TASK-301)** : le régime `OWNER_ACCEPTED_SCRAPING` existe en base (migration `20261005100000_owner_accepted_scraping`, appliquée sur la base en ligne le 2026-10-05) et la politique d'accès le range parmi les régimes qui permettent une collecte. `PROHIBITED`, `DISABLED_PENDING_PERMISSION`, `SEARCH_ENGINE_DISCOVERY_ONLY` et `MANUAL_IMPORT` restent refusés. Le délai de revérification des conditions (90 jours) s'applique à ce régime comme aux autres.

**Ce qui n'est pas encore ouvert** : aucun site n'est passé à ce régime. Chaque job board reste en `DISABLED_PENDING_PERMISSION` jusqu'à sa propre brique (phase 22), qui écrit sa ligne de registre avec l'acteur épinglé, la date de vérification et les conditions lues (TASK-302). Un régime sans ligne datée ne fait tourner aucun connecteur.

**Ce que la décision reconnaît** : les conditions d'utilisation de ces plateformes interdisent la collecte automatisée. Le risque est civil (blocage d'IP, d'accès ou de compte) et il est assumé par le propriétaire. L'accès n'est jamais présenté comme `PUBLIC_FEED` ou `AUTHORIZED_CRAWL`.

**Ce qui reste interdit, y compris pour ces sites** : compte ou login, cookies, CAPTCHA contourné, modules de furtivité dans le code Findit, acteur tiers qui annonce un contournement d'anti-bot, offre sans URL d'origine. La dérogation ne couvre pas les sites carrières d'entreprises : leur `robots.txt` reste respecté.

**Publication** : pour une offre issue d'un job board, l'affichage public se limite au titre, à l'entreprise, au lieu, à la date, à un extrait court et au lien d'origine ; la description complète sert au seul matching privé. [PROPOSITION, à confirmer par le propriétaire]

## Le registre dynamique

Décidé le 2026-07-17. **Findit a le droit de collecter un domaine qu'il découvre lui-même**, sans
qu'il ait été inscrit à la main - mais seulement après avoir lu ce que ce domaine autorise.

C'est un assouplissement réel de la règle précédente, où une source sans ligne écrite d'avance ne
pouvait pas s'exécuter. Il n'affaiblit pas le principe, il le déplace : le contrôle passe d'une liste
tenue à la main à une lecture faite à chaque découverte. Ce qui ne change pas : **rien ne se collecte
sans permission constatée**.

Les conditions sont cumulatives. Un domaine découvert n'est collectable que si :

1. son `robots.txt` a été lu et **autorise explicitement** le chemin visé pour `FinditBot` ;
2. le verdict est `ALLOWED`. Un `UNKNOWN` - aucun groupe ne vise `FinditBot`, pas même `*` - **n'est
   pas un oui** : le domaine est laissé de côté ;
3. un `robots.txt` illisible, absent ou répondant autre chose qu'un fichier vaut refus, comme pour
   Ashby ;
4. le `Crawl-delay` annoncé est appliqué ; à défaut, une requête par seconde ;
5. la décision est **écrite en base** avec sa date, sa preuve et son verdict, et relue comme n'importe
   quelle autre ligne du registre. Une source découverte n'a pas moins de traçabilité qu'une source
   écrite à la main - elle en a autant.

Le lecteur de `robots.txt` est vérifié contre les cinq fichiers réels de ce document. Le cas décisif
est SmartRecruiters : son groupe `LinkedInBot` ne doit **jamais** s'appliquer à `FinditBot`, qui tombe
sous le `Disallow: /` de `User-agent: *`.

### Le scan des sites carrières

Décidé le 2026-07-27 (ordre du propriétaire : chercher aussi sur les sites carrières de son
annuaire). `pnpm careers:scan` visite le site carrière des entreprises du registre qui n'ont pas
encore de source collectable, sous les mêmes règles que tout le reste : `robots.txt` du domaine lu
d'abord, verdict `ALLOWED` exigé pour le chemin visé (silence, absence ou refus = on ne visite
pas), identité FinditBot annoncée, une requête par seconde, une seule lecture par site.

La page n'est PAS une source d'offres : elle n'est lue que pour y trouver un lien Greenhouse,
Lever ou Workday, qui devient une source collectable rattachée à l'entreprise. Le texte de la
page n'est jamais conservé. Premier passage réel le 2026-07-27 : 392 sites visés, 188 lus, 137
refusés par leur robots.txt - et respectés -, 26 sources enregistrées.

Ce que le registre dynamique ne permet toujours pas :

- collecter une source dont le `robots.txt` interdit le chemin, même si elle répond `200` ;
- se présenter sous un autre nom que `FinditBot` pour obtenir un groupe plus permissif ;
- interpréter un silence comme une autorisation, ni dans `robots.txt`, ni dans un content signal.

## Apify et acteurs tiers

Vérifié le **2026-10-06** (TASK-302), à partir des textes publiés par Apify et des fiches de chaque acteur lues par l'outil `fetch-actor-details`. Aucun acteur n'a été lancé : ce que dit une fiche est une déclaration de son auteur, pas une preuve de comportement. La preuve vient du run réel borné (TASK-306), qui doit constater l'absence de compte exigé et de proxy imposé avant d'ouvrir une source.

### Conditions d'Apify

| Document                                                                          | Version lue               | Ce qu'il impose à Findit                                                                                                                                                                                                                                                                                       |
| --------------------------------------------------------------------------------- | ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Conditions générales (`docs.apify.com/legal/general-terms-and-conditions`)        | En vigueur le 2026-07-09  | 6.2 : ne traiter que des données auxquelles on est autorisé à accéder. 5.8 : l'utilisateur est seul responsable de la légalité des données. 11.1 : indemnisation d'Apify si le service sert à extraire des données de « sources non autorisées ». 5.4 : aucune responsabilité d'Apify pour les services tiers. |
| Politique d'utilisation acceptable (`docs.apify.com/legal/acceptable-use-policy`) | Mise à jour le 2026-02-20 | 2.1 : interdit toute activité contraire aux droits de tiers ; pas de clause spécifique au scraping.                                                                                                                                                                                                            |

**Conséquence à connaître** : la décision du 2026-10-05 sur les job boards porte sur les conditions de LinkedIn, Indeed et des autres. Elle ne dit rien du contrat avec Apify, et ce contrat est plus dur que le risque civil évoqué plus haut : en cas de plainte d'une plateforme, Apify peut suspendre le compte et réclamer une indemnisation (clause 11.1). Le risque porte sur le compte Apify du propriétaire, pas seulement sur Findit. Atténuation : un compte Apify dédié, sans lien avec d'autres projets, et un budget plafonné. **Confirmé par le propriétaire le 2026-10-06** : le risque de suspension du compte et d'indemnisation (clause 11.1) est connu et assumé, avec un compte Apify dédié à Findit.

### Acteurs candidats

Statut : `CANDIDAT` (lu, pas encore retenu), `RESERVE` (une déclaration de la fiche touche un garde-fou, retenu seulement si le run réel la dément), `ECARTE`. Le choix final est la tâche TASK-303.

| Acteur                                                                   | Source                | Statut   | Modifié le | Ce que la fiche déclare                                                                                                                                  |
| ------------------------------------------------------------------------ | --------------------- | -------- | ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `bebity/welcome-to-the-jungle-jobs-scraper`                              | Welcome to the Jungle | CANDIDAT | 2026-09-14 | Lit « le moteur de recherche du site », sans login. Aucun champ proxy ni cookie. Filtres `postedWithinDays`, `city`, `contractType`, plafond `maxItems`. |
| `shahidirfan/Jungle-Job-Scraper`                                         | Welcome to the Jungle | RESERVE  | 2026-09-25 | Annonce une « rotation automatique de jetons de recherche » : à surveiller. Aucun champ proxy. Secours possible.                                         |
| `solidcode/hellowork-scraper`                                            | HelloWork             | CANDIDAT | 2026-08-08 | Filtres `contractType` (dont ALTERNANCE) et `datePosted` (3 jours). Aucun champ proxy, aucune mention de furtivité.                                      |
| `shahidirfan/HelloWork-Jobs-Scraper`                                     | HelloWork             | RESERVE  | 2026-10-03 | Se décrit comme « stealthy » ; proxy optionnel, désactivé par défaut. Retenu seulement si proxy gardé éteint et aucun blocage contourné.                 |
| `curious_coder/linkedin-jobs-scraper`                                    | LinkedIn              | CANDIDAT | 2026-09-23 | Lit la page publique de recherche d'offres, sans compte (l'acteur avec compte est un autre acteur, exclu). Ne pas activer `splitByLocation`.             |
| `cheap_scraper/linkedin-job-scraper`                                     | LinkedIn              | CANDIDAT | 2026-08-26 | Secours. Minimum de 150 résultats facturés par run en paiement au résultat : plancher de coût à prévoir.                                                 |
| `valig/glassdoor-jobs-scraper`                                           | Glassdoor             | CANDIDAT | 2026-09-26 | Fiche muette sur le compte et les proxys : à constater au run réel. Filtre `daysOld`, plafond `limit`.                                                   |
| `cheap_scraper/glassdoor-jobs-scraper-remove-duplicate-jobs`             | Glassdoor             | CANDIDAT | 2026-07-18 | Secours. Frais de démarrage de 0,05 $ par run. Fiche muette sur le compte et les proxys.                                                                 |
| `curious_coder/indeed-scraper`                                           | Indeed                | CANDIDAT | 2026-09-05 | Pages publiques par sous-domaine pays (`fr`). Filtre `postedWithinDays` (1, 3, 7, 14), plafond `count`. Aucun champ proxy.                               |
| `valig/indeed-jobs-scraper`                                              | Indeed                | RESERVE  | 2026-09-26 | La fiche cite l'usage de proxys. Secours seulement, proxy à constater éteint.                                                                            |
| `memo23/apify-glassdoor-reviews-scraper`, `memo23/glassdoor-scraper-ppr` | Glassdoor             | ECARTE   | 2026-10-06 | Annoncent de « survivre au mur anti-bot » et de contourner un plafond : contredit RM-011.                                                                |
| `stealth_mode/hellowork-jobs-search-scraper`                             | HelloWork             | ECARTE   | 2026-10-06 | Nom et positionnement fondés sur la furtivité.                                                                                                           |

Limite de cette vérification : les auteurs des acteurs peuvent changer leur code sans préavis. L'identifiant est épinglé dans le registre, mais la version d'un acteur du Store n'est pas figée de notre côté ; la date « Modifié le » est donc relevée à chaque revérification (délai de 90 jours, comme les autres sources).

### Choix retenus (TASK-303)

Décidé le **2026-10-06**. Un acteur par source, un secours, entrée bornée. L'identifiant est épinglé ici ; la ligne `Connector` correspondante n'est écrite qu'à la brique du site (phase 22), avec le régime `OWNER_ACCEPTED_SCRAPING` et la date du premier run réel. Un premier run réel a eu lieu le 2026-10-06 (Welcome to the Jungle, 0,016 $ puis deux fois 0,004 $ ; constats dans la roadmap, TASK-306). Welcome to the Jungle est la première source passée au régime `OWNER_ACCEPTED_SCRAPING` (ligne de registre du 2026-10-06, TASK-306), pour une preuve réelle bornée : elle n'est montée dans aucun cycle, seul l'outil `pnpm board:proof` l'exécute.

| Source                | Acteur retenu                               | Secours                                                                   | Entrée prévue (filtres côté acteur, plafond imposé)                                                                                                              |
| --------------------- | ------------------------------------------- | ------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Welcome to the Jungle | `bebity/welcome-to-the-jungle-jobs-scraper` | `shahidirfan/Jungle-Job-Scraper` (réservé)                                | `action=get-jobs`, `contractType=[APPRENTICESHIP, INTERNSHIP]`, `postedWithinDays=3`, `countryCode=FR`, Paris + rayon 50 km, `maxItems=100`                      |
| HelloWork             | `solidcode/hellowork-scraper`               | `shahidirfan/HelloWork-Jobs-Scraper` (réservé, proxy éteint)              | `searchQueries=[développeur]`, `location=Île-de-France`, `contractType=[ALTERNANCE, STAGE]`, `datePosted=3d`, `maxResults=100`                                   |
| LinkedIn              | `curious_coder/linkedin-jobs-scraper`       | `cheap_scraper/linkedin-job-scraper` (plancher de 150 résultats facturés) | `keywords=alternance développeur`, `location=Île-de-France, France`, `datePosted=pastWeek`, `scrapeCompany=false`, `splitByLocation=false`, `limitPerSource=100` |
| Glassdoor             | `valig/glassdoor-jobs-scraper`              | `cheap_scraper/glassdoor-jobs-scraper-remove-duplicate-jobs`              | `keywords=alternance développeur`, `location=Paris, France`, `daysOld=3`, `sortBy=date_desc`, `limit=100`                                                        |
| Indeed                | `curious_coder/indeed-scraper`              | `valig/indeed-jobs-scraper` (réservé)                                     | `country=fr`, `query=alternance développeur`, `location=Île-de-France`, `postedWithinDays=3`, `count=100`                                                        |

Écarts entre le filtre voulu et ce que l'acteur sait faire (à traiter par notre propre filtre, jamais en croyant l'acteur) :

- **LinkedIn** n'offre que 24 h, 7 jours ou 30 jours : la fenêtre de 3 jours est rétablie à l'ingestion à partir de `postedAt`.
- **Stage et alternance** : WTTJ et HelloWork filtrent le contrat côté acteur ; LinkedIn, Glassdoor et Indeed passent par les mots-clés, donc la classification contrat de Findit tranche (une offre « alternance » mal étiquetée est rejetée au tri existant).
- **Île-de-France** : seules WTTJ (rayon autour de Paris) et HelloWork (région) la filtrent bien ; les autres sont refiltrées par la localisation Île-de-France du pipeline.

Correspondance vers `RawJob` (champs réels du schéma de sortie, lus le 2026-10-06) :

| Source                | `sourceJobId` | `url`         | `companyName`                | `locationLabel`                        | `publishedAt`                                      | Lien de candidature        | Points d'attention                                                                           |
| --------------------- | ------------- | ------------- | ---------------------------- | -------------------------------------- | -------------------------------------------------- | -------------------------- | -------------------------------------------------------------------------------------------- |
| Welcome to the Jungle | `objectID`    | `publicUrl`   | `organization.name`          | `office.city`                          | `published_at`                                     | `apply_url` (nul possible) | Contrat dans `contract_type`, ATS de l'employeur dans `ats`.                                 |
| HelloWork             | `jobId`       | `jobUrl`      | `company` (**nul possible**) | `location`                             | `datePosted`                                       | aucun                      | Employeur nul : même règle que France Travail (« Inconnu »), jamais un nom tiré de la prose. |
| LinkedIn              | `id`          | `link`        | `companyName`                | `location`                             | `postedAt`                                         | `applyUrl`                 | Aucune donnée de recruteur à stocker (`jobPoster*` ignorés).                                 |
| Glassdoor             | `id`          | `url`         | `employer.name`              | `location.name`                        | **dérivée** de `ageInDays` (précision d'un jour)   | aucun                      | Pas de date absolue ni de type de contrat : la date n'est jamais plus précise que la source. |
| Indeed                | `id`          | `viewJobLink` | `companyDetails` ou source   | `jobLocationCity`, `formattedLocation` | `pubDate` (nombre ; unité à constater au run réel) | `originalApplyUrl`         | Lien d'origine de l'employeur disponible : sert à la fusion avec l'ATS natif (TASK-307).     |

**Ce que cela impose au code** : `RawJob` n'a pas de champ de lien de candidature. Il faut l'ajouter (optionnel, additif) à TASK-304 pour que TASK-307 puisse fusionner une offre de job board avec celle de l'ATS de l'entreprise.

**Coût** (tarif « FREE » des fiches, 100 résultats par source et par run, détails inclus pour WTTJ) :

| Source                | Estimation par run |
| --------------------- | ------------------ |
| Welcome to the Jungle | 0,08 $             |
| HelloWork             | 0,095 $            |
| LinkedIn              | 0,20 $             |
| Glassdoor             | 0,041 $            |
| Indeed                | 0,010 $            |
| **Les cinq**          | **environ 0,43 $** |

**Cadence décidée par le propriétaire le 2026-10-06** : une collecte par jour pour tout ce qui est scrapé (job boards et sites carrières), les ATS natifs restant à 4 heures. À 4 heures, les cinq sources auraient coûté environ 77 $ par mois ; à une collecte par jour, environ 13 $ à 100 résultats par source.

**Plan réel : gratuit, 5 $ de crédit par mois** (confirmé par le propriétaire le 2026-10-06). Même à une collecte par jour, 100 résultats par source dépassent le crédit (13 $ contre 5 $). Les plafonds de résultats par source sont donc réduits tant que le plan est gratuit :

| Source                | Résultats par jour | Coût par run (pire cas) |
| --------------------- | ------------------ | ----------------------- |
| Welcome to the Jungle | 30                 | 0,024 $                 |
| HelloWork             | 40                 | 0,038 $                 |
| LinkedIn              | 20                 | 0,040 $                 |
| Glassdoor             | 60                 | 0,025 $                 |
| Indeed                | 100                | 0,010 $                 |
| **Les cinq**          | **250**            | **0,138 $**             |

Soit environ 4,1 $ pour 30 jours, sous le plafond mensuel de 4,5 $ (5 $ moins 10 % de marge, le mois de facturation d'Apify étant inconnu). Ces plafonds remplacent `maxItems` de l'entrée prévue ci-dessus tant que le plan est gratuit ; un plan Starter (19 $ par mois, remise Bronze sur les acteurs) permettrait de revenir aux 100 résultats. La garde de budget (`SCRAPING_BUDGET_MONTHLY_USD`, `SCRAPING_BUDGET_CYCLE_USD`) refuse tout run dont le pire coût dépasse ce qui reste : elle protège le crédit même si un plafond de résultats est mal réglé. Les acteurs au paiement à l'événement portent leur propre calcul : le coût de plateforme semble inclus dans le prix du résultat, à constater dans la console Apify au premier run.

## ScrapeGraphAI (API cloud)

Vérifié le **2026-10-06** : la clé fournie par le propriétaire répond à l'appel gratuit `GET /credits` (plan « Free », 500 crédits, 0 utilisé) et les conditions de service ont été lues (mises à jour le 2026-06-04). Aucune extraction n'a été lancée. L'API v2 est `https://v2-api.scrapegraphai.com/api`, authentifiée par l'en-tête `SGAI-APIKEY`, avec les appels `scrape`, `extract` (schéma JSON en sortie), `search` et `crawl`. Ordre du propriétaire (2026-10-06) : privilégier `search`, `crawl` et `extract`. La clé vit dans `.env` sous `SCRAPEGRAPH_API_KEY`, jamais dans un fichier suivi.

| Document                                          | Version lue                | Ce qu'il impose à Findit                                                                                                                                                                                                                  |
| ------------------------------------------------- | -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Conditions de service (`scrapegraphai.com/terms`) | Mises à jour le 2026-06-04 | L'utilisateur garantit avoir les droits sur les sites soumis et répond du respect de leurs conditions et de leur `robots.txt`. Interdit de contourner connexions, paywalls, CAPTCHAs et limites de débit. Indemnisation de ScrapeGraphAI. |

Ce que cela change :

- **Sites carrières dont `robots.txt` autorise `FinditBot`** : conformes aux conditions de ScrapeGraphAI. C'est l'usage par défaut du fournisseur cloud.
- **Job boards** : lire un job board par ScrapeGraphAI contredit sa clause sur le respect des conditions des sites cibles, avec le même type de conséquence que la clause 11.1 d'Apify (suspension de la clé, indemnisation). La décision du propriétaire du 2026-10-06 sur ce risque porte sur Apify, pas sur ScrapeGraphAI : **aucun job board n'est lu par ScrapeGraphAI tant que le propriétaire ne l'a pas confirmé pour ce fournisseur**.
- **Plan gratuit : données réutilisables par ScrapeGraphAI** (recherche, entraînement de modèles). Règle : seules des pages publiques d'offres et des consignes génériques partent vers l'API ; **jamais** un CV, un profil, une lettre, une candidature ni aucune donnée personnelle du propriétaire. Ces données restent traitées par Ollama en local.
- **Plafond en crédits** : 500 crédits au total sur le plan gratuit, coût par appel non mesuré. Avant chaque cycle, `GET /credits` (gratuit) donne le solde ; un plafond en crédits, distinct du plafond en dollars d'Apify, sera posé à la brique TASK-502 après mesure sur un premier appel.
- Limites du plan gratuit constatées : un seul job de `crawl` et un seul `monitor`.

## Moteurs de recherche

### Brave Search

| Élément           | Valeur                                                               |
| ----------------- | -------------------------------------------------------------------- |
| Statut            | `SEARCH_ENGINE_DISCOVERY_ONLY`                                       |
| Accès             | `GET https://api.search.brave.com/res/v1/web/search`, avec clé       |
| Authentification  | En-tête `X-Subscription-Token`, clé serveur                          |
| Plan              | Free : 50 requêtes/seconde, illimité par mois, carte non débitée     |
| Cadence appliquée | 1 requête/seconde (le plafond de 50/s est un maximum, pas une cible) |
| **Conservation**  | **Interdite. Résultats transitoires uniquement.**                    |
| Vérifié le        | 2026-07-17 (CGU lues, API testée avec la clé)                        |

La contrainte porteuse est la conservation. Les CGU disent :

> « store, cache, or create a database of Search Results, in whole or in part, other than transient
> storage required for operation »

**Les résultats de Brave ne sont jamais écrits en base.** Ils vivent en mémoire le temps d'en extraire
une URL, puis sont jetés. Cela tombe exactement sur le régime déjà retenu,
`SEARCH_ENGINE_DISCOVERY_ONLY` : le moteur **signale** qu'une offre existe, Findit remonte à la source
officielle pour la collecter - et c'est cette offre-là, venue de la source, qui est stockée, pas le
résultat de Brave.

Conséquence sur le modèle de données : la table `WebSearchResult` prévue au §26 de l'extension **ne
doit pas contenir les résultats de Brave**. Elle ne peut porter que ce qui est à nous - le texte de la
requête, un décompte, un horodatage - jamais les titres, extraits ou classements rendus par Brave.

Les CGU rappellent aussi que Brave n'accorde aucun droit sur les pages tierces : « Customers who
access URLs displayed in the Brave Search API must ensure their access to those webpages complies with
the copyright terms of the page publishers. » C'est précisément ce que le lecteur de `robots.txt`
vérifie avant toute collecte d'une page découverte.

**Un résultat de moteur ne suffit jamais à publier une offre.** C'est ce qui garde LinkedIn, Indeed,
Glassdoor et Welcome to the Jungle hors de portée : le test réel du 2026-07-17 montre qu'une requête
naïve les remonte en tête - ils peuvent apparaître dans les résultats, mais ne seront pas récupérés
pour autant. Les requêtes utiles visent les sites carrières et les ATS ouverts (`site:`,
`inurl:careers`), pas les agrégateurs fermés.

## Fournisseur IA

| Élément            | Valeur                                                                                         |
| ------------------ | ---------------------------------------------------------------------------------------------- |
| Fournisseur retenu | **IA locale via Ollama**, modèle `qwen2.5:7b`                                                  |
| Accès              | Serveur local `http://localhost:11434`, API HTTP Ollama                                        |
| Réseau             | **Aucun appel sortant.** Le modèle tourne sur la machine ; ni offre ni CV ne quitte le poste   |
| Coût               | Nul. Aucun token facturé, aucune clé à gérer                                                   |
| Matériel           | RTX 2060 6 Go + 32 Go RAM ; modèle 7B quantifié, accéléré GPU                                  |
| Vérifié le         | 2026-07-17 (Ollama installé et serveur testé ; génération réelle validée à la première brique) |

Décision tranchée le 2026-07-17. Un premier choix (Anthropic, API distante) a été retenu puis écarté
le même jour au profit d'une **IA locale**, pour deux raisons : ne pas payer de tokens à chaque offre,
et surtout **ne rien envoyer en ligne**. Le modèle tourne sur la machine ; aucune offre, aucun CV,
aucune donnée ne quitte le poste.

Conséquence sur la conformité : la question `ai-train`/`ai-input` de Lever **disparaît**. Ces signaux
encadrent ce qu'un tiers a le droit de faire d'un contenu qu'on lui **envoie** ; ici on n'envoie rien.
`ai-train=no` est respecté trivialement - aucun contenu ne part vers un modèle tiers, donc rien ne peut
servir à en entraîner un. La sous-décision `ai-input` (envoyer une offre à un modèle) n'a plus d'objet
tant que l'IA reste locale ; elle ne renaîtrait que si un fournisseur distant était réintroduit.

Le rôle de l'IA reste volontairement étroit, pour le coût comme pour la robustesse : les modèles de CV
et de lettre sont **pré-conçus et designés à part** ; l'IA ne fait que remplir le texte et produire des
analyses courtes. Le rendu PDF est déterministe, sans IA.

Deux règles tiennent quelle que soit la suite :

- **Rien ne sort du poste.** Le serveur Ollama n'est jamais exposé au navigateur ni au réseau public.
- **Rien n'est inventé.** Une sortie du modèle qui ne valide pas son schéma attendu lève une erreur
  explicite plutôt que de laisser passer un texte fabriqué.

## Démarche pour ouvrir une source

1. Lire les conditions d'utilisation et `robots.txt`, et dater la lecture.
2. Établir le régime d'accès et le consigner ici.
3. Demander une autorisation écrite si le régime l'exige.
4. Créer la ligne `Connector` avec le `SourceAccessStatus` correspondant.
5. N'activer le connecteur que si le statut le permet.

## Revue

Les conditions d'une source changent sans préavis. Chaque ligne porte une date de vérification, et `Connector.termsCheckedAt` porte la même information en base. Une source dont la vérification date de plus de trois mois doit être recontrôlée avant d'être considérée comme autorisée.
