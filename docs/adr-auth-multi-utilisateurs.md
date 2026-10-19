# Décision d'architecture : authentification multi-utilisateurs (item 6.3)

Statut : **proposée, non implémentée**. Ce document tranche la question posée dans
`roadmap.md` (Q-2) afin de préparer l'implémentation, sans la bricoler à l'avance.

## Contexte

Findit est aujourd'hui mono-utilisateur :

- l'espace personnel est protégé par un mot de passe unique et une clé interne
  `x-internal-key` (server-to-server, comparaison à temps constant) ;
- le profil est un singleton (`Profile` id `default`), les favoris et les CV
  importés ne portent pas de propriétaire ;
- le dashboard d'administration n'a aucune authentification.

L'item 6.3 vise des comptes et rôles distincts, avec un contrôle d'accès par
document (section 18 et 19 du cahier des charges).

## Contraintes réelles

- Le produit est centré sur un candidat unique ; le multi-compte sert surtout à
  isoler les données, pas à servir des milliers d'utilisateurs.
- Les documents générés (CV, lettre) et les CV importés sont des données
  personnelles : la règle de moindre privilège s'applique par document, pas
  seulement par route.
- La clé interne `x-internal-key` est un secret de service, pas un identifiant
  d'utilisateur : elle ne doit pas devenir un jeton de session.

## Options

1. **Comptes par session + rôles simples** : une table `User` (id, email,
   `passwordHash`, `role`), des sessions serveur (cookie HttpOnly + `SESSION_SECRET`
   déjà présent), et un `ownerId` ajouté à `Profile`, `Favorite`, `Resume`. Les
   routes lisent l'utilisateur de session et filtrent par `ownerId`.

2. **JWT sans état** : mêmes tables, mais un jeton signé au lieu d'une session
   serveur. Plus simple à déployer sur plusieurs instances, mais révocation plus
   lourde.

3. **OAuth / fournisseur externe** : déléguer l'identité. Trop lourd pour un
   produit mono-candidat à ce stade.

## Recommandation

Adopter l'option **1 (session serveur + rôles simples)** :

- elle réutilise `SESSION_SECRET` déjà configuré ;
- la révocation et la rotation sont triviales ;
- le contrôle d'accès par document se résume à un `ownerId` + un garde, ce qui
  préserve la règle existante (`ProfileKeyGuard`) et s'y superpose sans la casser ;
- le coût est proportionnel au besoin réel (isolation des données), sans
  infrastructure d'identité externe.

Les rôles initiaux : `candidate` (espace personnel) et `operator` (dashboard).
Le rôle est un champ, pas un système de permissions fines à ce stade.

## Conséquences sur le modèle

- `User` (id, email unique, passwordHash, role, createdAt).
- `Profile.ownerId`, `Favorite.ownerId`, `Resume.ownerId` (clés étrangères,
  suppression en cascade).
- Migration du singleton `Profile` vers une création au premier accès.
- Le dashboard gagne un écran de connexion et un garde `operator`.

## Hors périmètre pour l'instant

- OAuth, SSO, fédération d'identité.
- Permissions fines par ressource (le rôle binaire suffit).
- Facturation ou quotas multi-comptes.

## Validation

À valider par le propriétaire avant toute implémentation : le choix de la
session serveur (option 1), la liste des rôles, et la politique de rétention des
comptes. Une fois validé, l'implémentation peut suivre les conventions du dépôt
(migrations additives, gardes Nest, tests).
