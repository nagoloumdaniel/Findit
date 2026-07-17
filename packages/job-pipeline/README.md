# Pipeline d'offres

## Responsabilité

Décider du sort d'une offre collectée, et l'assembler si elle est retenue.

## Une décision, une raison

`decideIngestion` prend une offre telle qu'un connecteur l'a rendue et tranche : elle devient une
ligne `Job`, elle part en quarantaine, ou elle est rejetée. La décision est **pure** — pas de base, pas
de réseau — donc vérifiable sur une offre en mémoire.

Les portes s'appliquent dans un ordre pensé pour la trace, la plus fréquente d'abord : classification
(contrat et métier), puis localisation, puis fraîcheur. Une offre écartée l'est pour **une** raison
nommée, et l'étape qui l'a écartée sert de `stage` dans `ProcessingLog`.

## Ce que le modèle de données impose, et qui décide rejet contre quarantaine

Une ligne `Job` ne peut pas exister sans métier, sans contrat, sans département d'Île-de-France et sans
date : les colonnes sont `NOT NULL` et une contrainte de contrôle borne le département. Il en découle
une règle simple :

- **Rejet** quand un de ces éléments manque — l'offre n'est pas stockable. Un poste hors développement,
  une ville hors zone, un département indéterminable, une date absente ou trop vieille : rejetés, et
  tracés dans `ProcessingLog`, dont le `jobId` facultatif existe pour ça.
- **Quarantaine** seulement quand l'offre est complète mais douteuse. Le seul cas aujourd'hui : les
  signaux de contrat se contredisent — titre « alternance », source « Permanent ». L'offre est
  stockable, donc stockée, mais en `QUARANTINED`, hors du flux.

C'est pourquoi une date incertaine est un **rejet**, pas une quarantaine : sans `publishedAt`, il n'y
a pas de ligne `Job` possible. Le modèle est la garantie la plus forte, il l'emporte.

## Ce qui est assemblé, et ce qui ne l'est pas

Le brouillon porte le titre d'origine et son titre normalisé, le métier et le contrat lus par la
classification, la ville et le département de la localisation, le texte et les sections tirés du HTML,
et l'expiration à 72 h après publication — jamais après collecte.

Deux conventions documentées plutôt qu'inventées :

- Le mode de travail par défaut est **sur site** quand la source ne le dit pas. C'est le cas le plus
  courant d'une alternance, et c'est une convention, pas un fait affirmé sur l'offre.
- Le `dataQualityScore` est une **complétude** : la part des champs facultatifs réellement remplis.

Ce qui n'est pas encore fait et n'est pas simulé : la détection d'écoles et la déduplication. Le
brouillon ne porte donc pas de score d'école, et l'écriture en base reste à venir.

## Vérification

Passé sur 293 offres réelles collectées via la découverte Brave chez cinq entreprises Greenhouse :
291 rejetées en classification, 2 en localisation, chacune à la bonne étape et avec sa raison. Aucune
retenue — le gisement d'alternances dev franciliennes est mince à cette date, ce que chaque étape de la
chaîne a confirmé tour à tour.

## État

Le décideur d'ingestion est fait. L'écriture en base — `Job`, `JobSource`, `ProcessingLog`, compteurs
de `ConnectorRun` — et l'orchestration dans le worker suivent.
