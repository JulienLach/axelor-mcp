# Contribuer

Les contributions sont les bienvenues, notamment pour ajouter de nouveaux tools MCP couvrant d'autres modules Axelor.

## Conventions

- Un tool = une action claire (search, get, create, analyze)
- Les champs d'un modèle vont dans `fields.ts`, jamais inline dans `index.ts`
- Tester avec au moins un exemple de prompt en langage naturel

## Skill `axelor-analyser` (Claude Code)

Le dépôt fournit un skill Claude Code, `axelor-analyser` (`.claude/skills/axelor-analyser/SKILL.md`), qui fait de Claude un Tech Lead Axelor : modèles AOS et classes Java, champs à mettre dans `fields.ts`, imbrications entre modèles, critères de recherche de l'API REST, valeurs des enums et patterns des tools `analyze_*`.

- Il est chargé automatiquement quand on ouvre le projet dans Claude Code. On peut aussi l'appeler explicitement avec `/axelor-analyser`.
- Il n'est **pas** disponible dans Claude Desktop : il sert à développer le MCP, pas à l'utiliser.
- Avant d'ajouter un champ encore jamais utilisé, exporter la liste des champs du modèle depuis l'application Axelor (CSV `Nom;Type;Libellé;Relation;Mappé avec`) et la fournir à Claude : les champs varient selon la version d'AOS et les modules installés.
- Le skill documente les pièges déjà rencontrés (filtre `archived` nullable, nom renvoyé par une relation vers `Partner`…). Le mettre à jour quand on en découvre un nouveau.
