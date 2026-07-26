# Pipeline d'offres

## Responsabilité

Décider du sort d'une offre collectée, et l'assembler si elle est retenue.

## Une décision, une raison

`decideIngestion` prend une offre telle qu'un connecteur l'a rendue et tranche : elle devient une
ligne `Job`, elle part en quarantaine, ou elle est rejetée. La décision est **pure** - pas de base, pas
de réseau - donc vérifiable sur une offre en mémoire.

Les portes s'appliquent dans un ordre pensé pour la trace, la plus fréquente d'abord : classification
(contrat et métier), puis localisation, puis fraîcheur. Une offre écartée l'est pour **une** raison
nommée, et l'étape qui l'a écartée sert de `stage` dans `ProcessingLog`.

## Ce que le modèle de données impose, et qui décide rejet contre quarantaine

Une ligne `Job` ne peut pas exister sans métier, sans contrat, sans département d'Île-de-France et sans
date : les colonnes sont `NOT NULL` et une contrainte de contrôle borne le département. Il en découle
une règle simple :

- **Rejet** quand un de ces éléments manque - l'offre n'est pas stockable. Un poste hors développement,
  une ville hors zone, un département indéterminable, une date absente ou trop vieille : rejetés, et
  tracés dans `ProcessingLog`, dont le `jobId` facultatif existe pour ça.
- **Quarantaine** seulement quand l'offre est complète mais douteuse. Le seul cas aujourd'hui : les
  signaux de contrat se contredisent - titre « alternance », source « Permanent ». L'offre est
  stockable, donc stockée, mais en `QUARANTINED`, hors du flux.

C'est pourquoi une date incertaine est un **rejet**, pas une quarantaine : sans `publishedAt`, il n'y
a pas de ligne `Job` possible. Le modèle est la garantie la plus forte, il l'emporte.

## Ce qui est assemblé, et ce qui ne l'est pas

Le brouillon porte le titre d'origine et son titre normalisé, le métier et le contrat lus par la
classification, la ville et le département de la localisation, le texte et les sections tirés du HTML,
et l'expiration à 72 h après publication - jamais après collecte.

Deux conventions documentées plutôt qu'inventées :

- Le mode de travail par défaut est **sur site** quand la source ne le dit pas. C'est le cas le plus
  courant d'une alternance, et c'est une convention, pas un fait affirmé sur l'offre.
- Le `dataQualityScore` est une **complétude** : la part des champs facultatifs réellement remplis.

La détection d'écoles tourne à l'ingestion : voir plus bas. La déduplication croisée reste à venir et
n'est pas simulée.

## Vérification

Passé sur 293 offres réelles collectées via la découverte Brave chez cinq entreprises Greenhouse :
291 rejetées en classification, 2 en localisation, chacune à la bonne étape et avec sa raison. Aucune
retenue - le gisement d'alternances dev franciliennes est mince à cette date, ce que chaque étape de la
chaîne a confirmé tour à tour.

## L'écriture ferme la boucle, sans rien perdre

`persistDecision` écrit ce que la décision a établi. Une offre retenue ou en quarantaine devient une
ligne `Job` avec sa source ; une offre rejetée n'a pas de ligne `Job` - le modèle l'interdit - mais
laisse une trace dans `ProcessingLog`, le seul endroit prévu pour une offre écartée.

Deux propriétés tenues, vérifiées contre la vraie base :

- **Idempotence.** L'unicité `(entreprise, identifiant de source)` fait qu'une même offre recollectée
  met à jour sa ligne au lieu d'en créer une seconde. `firstSeenAt` n'est écrit qu'à la création,
  `lastSeenAt` suit chaque passage. Toutes les sources d'une offre sont conservées.
- **Le score d'école est mesuré.** La détection d'écoles (dans `@findit/job-classification`) tourne à
  l'ingestion : un risque élevé écarte l'offre à l'étape « école », un risque incertain la met en
  quarantaine, et le score réel est écrit sur la ligne `Job`. Vérifiée sur 462 offres réelles, elle
  n'a produit aucun faux positif.

La réconciliation fine des variantes de nom d'entreprise relève de `CompanyAlias`, pas d'ici : le slug
du nom suffit à retomber sur la même entreprise d'une collecte à l'autre.

## Vérification de l'écriture

Une offre dev fraîche à Paris, fabriquée pour le test et clairement marquée, a parcouru toute la chaîne
contre la base réelle : décidée `ACCEPTED`, écrite en `Job` `PUBLISHED`, ses sections extraites, sa
source enregistrée. Elle **apparaîtrait dans le flux public** (filtre 24 h / alternance / dev).
Recollectée, elle a mis à jour sa ligne sans doublon. Une offre hors périmètre a laissé un rejet dans
`ProcessingLog` sans ligne `Job`. Tout a été supprimé après coup : la base est revenue à ses six offres
de démonstration.

## État

Le décideur d'ingestion et l'écriture en base sont faits. Reste à orchestrer la chaîne dans le worker

- cron toutes les 4 h, file, verrou - et à tenir les compteurs de `ConnectorRun` au fil des décisions.
