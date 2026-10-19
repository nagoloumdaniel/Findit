# Politique de confidentialité des documents générés

Ce document décrit, de façon factuelle et vérifiable, le traitement des données
personnelles lié à l'import de CV et à la génération de documents (CV et lettre)
dans Findit. Il reflète le comportement réel du code, sans promesse non tenue.

## 1. Données traitées

- **Profil** : identité (nom, coordonnées), parcours (expériences, formation,
  projets, certifications), compétences, langues, préférences de recherche.
- **CV importé** : le fichier est lu pour en extraire le texte, puis structuré en
  faits. **Le fichier binaire n'est pas conservé** : seuls le texte extrait et les
  faits structurés sont stockés (table `Resume`).
- **Documents générés** : le CV et la lettre sont produits à la volée, à partir
  des seuls faits du profil et de l'offre. Ils ne sont pas archivés côté serveur.

## 2. Transmission au fournisseur IA

La génération du résumé et de la lettre appelle un modèle (DeepSeek). Seul le
strict nécessaire est transmis :

- les faits du profil utiles à la rédaction (compétences, expériences, formation) ;
- les faits de l'offre (titre, entreprise, exigences, missions).

Le coût du modèle est journalisé (`ModelCall` : modèle, tokens, coût), jamais le
contenu transmis. Aucune clé, aucun secret, aucun document complet ne part.

## 3. Garde-fou anti-invention

Aucune génération ne peut inventer une compétence, une entreprise, une école ou
une date absente du profil :

- le résumé et la lettre sont contraints par consigne de ne citer que des faits
  du profil, et refusés sinon (relance ciblée, puis échec) ;
- les dates importées sont ramenées à ce que la source écrit réellement.

## 4. Durée de conservation et suppression

- Les CV importés sont conservés `RESUME_RETENTION_HOURS` (défaut 720 h, soit
  30 jours), puis purgés automatiquement à la lecture.
- La suppression manuelle est possible : `DELETE /api/resume/:id`.
- Les documents générés sont téléchargés par l'utilisateur et ne sont pas
  conservés côté serveur.

## 5. Accès

L'espace est mono-utilisateur et protégé : les routes du profil, des documents,
du CV et des favoris exigent une clé interne (`x-internal-key`) et, côté site, un
accès à l'espace personnel.

## 6. Limite

Ce document décrit le fonctionnement technique. Il ne constitue pas un avis
juridique : une mise en conformité formelle (RGPD, mentions légales, registre des
traitements) nécessite une validation juridique professionnelle.
