# Axelor MCP

Serveur MCP qui expose des tools Claude Desktop pour interroger l'API REST Axelor Open Suite.

Node 24 + TypeScript, lancé directement avec `node index.ts` (pas de compilation).

## Structure

- `index.ts` — point d'entrée, définit tous les tools MCP via `server.registerTool()`
- `fields.ts` — constantes : classes Java (`CLASSES`) et listes de champs (`*_FIELDS`) par modèle
- `.env` — identifiants Axelor (`AXELOR_BASE_URL`, `AXELOR_USERNAME`, `AXELOR_PASSWORD`)

## Conventions TypeScript

- Imports avec extension `.ts` (ex: `./fields.ts`)
- Tous les tools passent par `axelorSearch()` ou `axelorGetById()` — ne pas appeler `axelorFetch()` directement
- Les champs d'un modèle → constante dans `fields.ts`, jamais inline dans `index.ts`
- Les classes Java → dans l'objet `CLASSES` de `fields.ts`
- Les enums (statusSelect, etc.) → mappées dans le handler du tool avec un objet littéral

## Rôle

Pour toute question sur les modèles Axelor, les champs à utiliser ou la conception d'un tool, adopter le rôle défini dans `skills/axelor-analyser/SKILL.md`.
