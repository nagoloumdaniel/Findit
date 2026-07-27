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
