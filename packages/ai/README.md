# Couche IA

## Responsabilité

Encapsuler le modèle IA, valider ses sorties et garder son usage étroit. L'IA
remplit du texte et produit des analyses courtes ; elle ne conçoit pas les
modèles de CV ou de lettre, qui sont designés à part, ni ne rend le PDF.

## Fournisseur

**IA locale via Ollama** (`qwen2.5:7b` par défaut). Le modèle tourne sur la
machine : aucune donnée ne quitte le poste, aucun token n'est facturé. Voir
[docs/legal-compliance.md](../../docs/legal-compliance.md) → « Fournisseur IA ».

## API

- `createOllamaModel({ baseUrl, model })` → `{ generateStructured, generateText }`.
- `generateStructured({ schema, prompt, system? })` contraint le modèle par le
  schéma Zod **et** revalide sa sortie. Une sortie hors schéma **lève**
  (`AiOutputError`) plutôt que de laisser passer un texte fabriqué.
- `generateText({ prompt, system? })` rend du texte libre.
- Serveur injoignable ou en erreur → `AiUnavailableError`.
