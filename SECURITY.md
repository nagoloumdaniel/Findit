# Politique de sécurité

## Signaler une vulnérabilité

**N'ouvrez pas d'issue publique** pour une faille de sécurité.

Utilisez le signalement privé de GitHub : onglet **Security** du dépôt, puis **Report a vulnerability**
(<https://github.com/nagoloumdaniel/Findit/security/advisories/new>).

Merci d'indiquer : la zone concernée (web, API, worker), les étapes de reproduction, l'impact estimé et,
si possible, une piste de correction. Ne joignez jamais de données personnelles réelles ni de secret.

Projet personnel : pas de délai de réponse garanti, mais les signalements sont traités avec sérieux.

## Périmètre

Le code de ce dépôt et les instances hébergées par l'auteur (`finditfr.vercel.app`, `finditfr-api.vercel.app`).
Hors périmètre : les services tiers (Vercel, Neon, Railway, DeepSeek, Brave, Apify, France Travail) et les
sites sources collectés. Pas de test destructif, de déni de service ni de force brute sur les instances en ligne.

## Secrets

Aucun secret ne doit être versionné : les clés vivent dans `.env` (ignoré par Git) et un hook local bloque
leur commit (`pnpm setup:hooks`). Si vous trouvez un secret exposé dans l'historique, signalez-le en privé.

## Points connus

Des durcissements sont identifiés (routes `/api/agent/*` et `/api/matching/*` publiques, limitation de débit
sur l'authentification). Voir « Limites connues » dans le [README](README.md).
