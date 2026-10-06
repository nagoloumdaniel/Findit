# Couche IA

## Responsabilité

Encapsuler le modèle IA, valider ses sorties et garder son usage étroit. L'IA
remplit du texte et produit des analyses structurées courtes ; elle ne définit
pas les modèles de CV ou de lettre, et ne rend pas le PDF.

## Fournisseur

**DeepSeek API** (unique, décision du propriétaire). Le client parle à
l'endpoint Anthropic-compatible `https://api.deepseek.com/anthropic/v1/messages`
avec l'en-tête `x-api-key`. La clé de plateforme est obligatoire.

## API

- `createDeepSeekModel({ apiKey, model, fetch?, maxTokens? })` →
  `{ generateStructured, generateText }`.
- `generateStructured({ schema, prompt, system? })` envoie le schéma Zod au
  modèle **et** revalide sa sortie. Une sortie hors schéma **lève**
  (`AiOutputError`) plutôt que de laisser passer un texte fabriqué.
- `generateText({ prompt, system? })` rend du texte libre.
- API injoignable ou en erreur → `AiUnavailableError`.
- Clé absente → erreur explicite au moment de créer le client.
