# Connecteurs d'offres

## Responsabilité

Accéder uniquement aux sources autorisées et produire des offres brutes traçables.

## Le droit de collecter ne vient pas d'ici

Un connecteur ne décide pas s'il a le droit de s'exécuter. La décision appartient au registre
[docs/legal-compliance.md](../../docs/legal-compliance.md), reporté dans la table `Connector` par
`pnpm registry:sync`. `runConnector` lit ce registre et refuse l'exécution si le `SourceAccessStatus`
n'autorise pas la collecte, si le connecteur n'est pas `ACTIVE`, ou si la vérification des conditions
d'utilisation remonte à plus de 90 jours.

Le registre est lu **à chaque exécution**, jamais mis en cache. Fermer une source en base suffit donc
à l'arrêter à la collecte suivante, sans toucher au code ni redéployer.

Le garde-fou est structurel, et non déclaratif. `collect` exige un `CollectionPermit`, et un permis
n'est créé qu'après le contrôle. Le paquet n'exporte que le _type_ du permis, jamais sa classe, et le
permis porte un champ privé : hors du paquet, il ne peut être ni construit ni imité. Appeler un
connecteur sans passer le contrôle ne compile pas.

## Le connecteur ne fait pas ses requêtes lui-même

`runConnector` passe au connecteur un `fetchJson` qui est son seul accès réseau. Ce client annonce le
user-agent de Findit et tient la cadence déclarée par la source — `Crawl-delay: 1` chez Lever devient
`minRequestIntervalMs: 1000`. Les requêtes sont mises à la file, jamais parallélisées, y compris si le
connecteur les lance en même temps. Un connecteur n'a donc aucun moyen de dépasser la limite annoncée
ni de masquer son identité.

## Entrées/sorties

Entrée : un `JobSourceConnector`, la ligne de registre qui le concerne, et l'entreprise à collecter.
Sortie : des `RawJob` accompagnés du nombre de requêtes émises et des bornes de l'exécution, de quoi
alimenter `ConnectorRun`.

## Sources écrites

### Greenhouse

`GET https://boards-api.greenhouse.io/v1/boards/{token}/jobs?content=true`, en `PUBLIC_FEED`. Le
chemin est hors du `/embed/` interdit par `robots.txt`. Aucune limite n'étant annoncée, le connecteur
s'en tient à une requête par seconde.

Deux constats tirés de la réponse réelle, et non de la documentation :

- L'API rend tout le tableau en une seule réponse. `meta.total` vaut le nombre d'entrées de `jobs`, et
  aucun paramètre de page n'est proposé : un appel par entreprise suffit.
- `content` arrive **entièrement échappé** — la charge utile ne contient aucun `<`, seulement `&lt;`,
  `&gt;`, `&quot;`, `&#39;` et `&amp;`. Le connecteur le décode, `&amp;` en dernier pour qu'un `&lt;`
  littéral du texte d'origine ne devienne pas une balise.

Une offre est datée par `first_published`, jamais par `updated_at` : une offre remaniée hier n'est pas
une offre publiée hier. Une date absente ou illisible laisse `publishedAt` à `null` plutôt que de
prendre l'heure courante — une offre sans date fiable ne doit pas pouvoir se faire passer pour
fraîche. Un changement de structure lève une erreur au lieu de rendre une liste vide.

### Lever

`GET https://api.lever.co/v0/postings/{company}?mode=json`, en `PUBLIC_FEED`. `robots.txt` annonce
`Crawl-delay: 1` : le connecteur déclare `minRequestIntervalMs: 1000`, et l'exécuteur attend
réellement entre deux pages.

Lever ne ressemble à Greenhouse sur presque rien, et chaque écart vient d'un relevé sur l'API réelle :

- La réponse est un **tableau nu** : ni enveloppe, ni total.
- `description` est du HTML déjà lisible, contrairement à Greenhouse. Rien à décoder.
- Le titre s'appelle `text`, et `createdAt` est un nombre de millisecondes.
- **Le texte de l'offre est éclaté en trois.** `description` ne porte que l'introduction ; les
  prérequis vivent dans `lists`, et la clôture dans `additional`. Le connecteur recolle les trois
  dans l'ordre rendu par la source — s'en tenir à `description` perdrait ce qui est demandé au
  candidat. L'intitulé d'une section est du texte : il est échappé, jamais réinjecté comme balisage.

Les pages sont demandées explicitement, `limit=100` et `skip` croissant, jusqu'à une page incomplète.
Sans `limit`, l'API rend tout — mais rien ne l'annonce et aucun total n'est fourni, donc rien ne
permettrait de repérer une réponse tronquée. Au-delà de 5000 offres pour une entreprise, la collecte
lève une erreur plutôt que de rendre une liste amputée en silence. Une entreprise inconnue répond
`404` et remonte comme telle.

## Trace d'une exécution

`runRecordedConnector` est le point d'entrée branché sur la base. Il lit le registre, ouvre une ligne
`ConnectorRun`, exécute, puis la ferme avec ce que la collecte a réellement fait — pages demandées,
offres trouvées, erreurs. La ligne est ouverte **avant** la collecte : un processus tué laisse une
exécution `RUNNING`, ce qui la rend repérable au lieu de la faire disparaître.

Un refus n'ouvre aucune exécution : ce n'est pas une collecte, c'est une collecte qui n'a pas eu lieu.
Il est consigné en `ConnectorError` sans `runId` — ce que le `runId` facultatif du schéma permet
exactement. Une exécution ratée, elle, conserve le nombre de pages déjà demandées : elle a bel et bien
touché la source, et déclarer zéro serait faux.

Le compte des offres retenues, rejetées ou mises en quarantaine reste à zéro : ces décisions
appartiennent à la phase 4, qui n'existe pas encore.

## État

Le socle, Greenhouse, Lever et le registre en base sont en place.
