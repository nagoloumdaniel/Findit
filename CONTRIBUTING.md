# Contribuer à Findit

Merci de votre intérêt. Projet personnel : les contributions sont bienvenues, la relecture peut prendre du temps.

## Avant de commencer

- Ouvrez une issue pour tout changement non trivial, afin d'en discuter avant d'écrire du code.
- Lisez le [code de conduite](CODE_OF_CONDUCT.md). Failles de sécurité : voir [SECURITY.md](SECURITY.md).
- Ne versionnez jamais de secret, de CV réel ni de donnée personnelle.

## Mise en place

Prérequis : Node.js `>= 24.18 < 25`, pnpm 11.13.1 (Corepack), une base PostgreSQL de test. Voir « Démarrage » dans le [README](README.md).

```bash
pnpm install
pnpm setup:hooks    # hook anti-secret local
```

## Branches et commits

- Ne travaillez jamais sur `main`. Branches : `feat/<slug>`, `fix/<slug>`, `refactor/<slug>`, `test/<slug>`, `docs/<slug>`.
- Messages de commit en anglais, au format [Conventional Commits](https://www.conventionalcommits.org/) : `feat(web): add job filters`.
- Pas de `force-push` sur une branche partagée.

## Porte de qualité

Avant d'ouvrir une pull request, ces commandes doivent passer (la CI les rejoue) :

```bash
pnpm format:check
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

- Un bug corrigé s'accompagne d'un test de non-régression.
- Les sources de collecte passent par le registre de conformité : n'ajoutez pas de source sans statut d'accès documenté
  dans [docs/legal-compliance.md](docs/legal-compliance.md). Aucun contournement de CAPTCHA, de connexion ou d'anti-bot.
- Interface : états de chargement, d'erreur et vide, responsive, navigation au clavier.

## Pull request

Décrivez le changement, les tests exécutés et leurs résultats, et les limites connues. Une PR reste ouverte jusqu'à relecture.
