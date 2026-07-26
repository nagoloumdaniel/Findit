# Classification des offres

## Responsabilité

Valider contrat, métier, localisation et risques avant publication.

## Deux voix, pas une

Le contrat est lu deux fois : dans le titre, et dans le libellé que la source donne à côté. Lever le
porte dans `categories.commitment`, et le relevé du 2026-07-17 justifie de s'en servir - sur les
**dix alternances réelles** trouvées chez Qonto, BlaBlaCar et Malt, **les dix** portent
« Apprenticeship » ou « FR Apprentice ». Le titre et le champ concordent à chaque fois.

Les deux voix décident ensemble :

| Ce qui est lu                                | Confiance | Sort            |
| -------------------------------------------- | --------- | --------------- |
| Le titre et la source disent le même contrat | 95        | accepté         |
| Le titre seul le dit                         | 80        | accepté         |
| La source seule le dit, le titre se tait     | 70        | accepté         |
| Les deux se contredisent                     | 40        | **quarantaine** |

La confiance de l'offre est celle de son **maillon le plus faible** : une certitude sur le métier ne
rachète pas un doute sur le contrat. Une quarantaine n'est possible que parce que le contrat et le
métier sont connus - l'offre est stockable. Une offre illisible est rejetée, pas mise de côté.

Chaque décision cite ce qui l'a produite. Aucune n'est à croire sur parole.

## Le métier se lit dans le titre, jamais dans la description

Une offre de marketing dont la description cite « notre stack React » n'est pas une offre front-end.

L'ordre des catégories décide : la plus précise est essayée la première, sinon la plus large l'avale.
« Senior Product Engineer - iOS/Swift » est un poste mobile avant d'être de l'ingénierie logicielle.

`OTHER_DEVELOPER` n'est pas un fourre-tout : il accueille un titre qui dit « développeur » sans dire
quelle spécialité, et sa confiance tombe à 70 pour le dire. Une offre qui ne nomme **aucun** métier du
périmètre est rejetée, pas rangée là.

Deux pièges relevés sur des titres réels :

- « **Internal** Control Apprentice » n'est pas un stage. Chercher « intern » sans borne de mot y
  verrait « Internal » et rangerait une alternance dans les stages.
- « Carpool Pricing **Analyst** Apprentice » n'est pas un data analyst. Seul « data analyst » compte.

## Ce que la vérification a établi, et qui compte plus que le code

Passé sur **462 offres réelles** de six boards - Vercel, Doctolib, Spotify, Qonto, BlaBlaCar, Malt :

```
462 REJECTED
  0 ACCEPTED
```

Ce n'est pas un défaut. La contre-preuve le montre :

```
contrats lus : ALTERNANCE 12, INTERNSHIP 17            → le lecteur de contrat fonctionne
métiers lus  : 62 postes de développement, 8 catégories → le lecteur de métier fonctionne
offres ayant à la fois un contrat du périmètre et un métier dev : 0
```

Les deux lecteurs trouvent ce qu'ils cherchent. **L'intersection est vide dans la réalité** : les 12
alternances de ces boards sont comptables, juridiques, RH, marketing ou contenu, et les 62 postes de
développement sont tous en `Permanent` ou `Full-time`.

Le même titre réel, avec le métier remplacé par un métier de développement, est accepté :

```
« Alternance - Développeur Back-end - Tech & Product (x/f/m) »
→ ACCEPTED / ALTERNANCE / BACKEND / confiance 90
```

**Conséquence pour le projet : les sources autorisées aujourd'hui ne publient aucune alternance de
développement.** La chaîne fonctionne ; c'est le gisement qui manque. Il faudra d'autres sources -
c'est l'objet de la phase 16.

## État

Le contrat et le métier sont faits, par règles et sans IA. La détection d'écoles suit.
