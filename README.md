# axelor-mcp

Serveur MCP (Model Context Protocol) pour interroger Axelor depuis Claude Desktop.

## Prérequis

- [Node.js](https://nodejs.org/) v20 ou supérieur
- [Claude Desktop](https://claude.ai/download)
- Accès à une instance Axelor

## Installation

```bash
git clone <url-du-repo>
cd axelor-mcp
npm install
```

## Configuration

Créer un fichier `.env` à la racine du projet :

```env
AXELOR_BASE_URL=https://votre-instance.axelor.com
AXELOR_USERNAME=votre_identifiant
AXELOR_PASSWORD=votre_mot_de_passe
```

> Ne pas committer ce fichier — il contient des credentials.

## Connexion à Claude Desktop

Ouvrir le fichier de config Claude Desktop :

```
C:\Users\<VotreNom>\AppData\Roaming\Claude\claude_desktop_config.json
```

Ajouter la configuration suivante dans `mcpServers` :

```json
{
  "mcpServers": {
    "axelor": {
      "command": "node",
      "args": [
        "--env-file=C:/chemin/vers/axelor-mcp/.env",
        "C:/chemin/vers/axelor-mcp/index.ts"
      ]
    }
  }
}
```

Remplacer `C:/chemin/vers/axelor-mcp` par le chemin réel du dossier cloné.

Redémarrer Claude Desktop.

## Outils disponibles

### `search_partners`

Recherche des partenaires par nom.

**Paramètres :**
| Paramètre | Type | Obligatoire | Description |
|-----------|------|-------------|-------------|
| `query` | string | oui | Nom ou référence du partenaire |
| `type` | string | non | Filtre : `all` (défaut), `customer`, `supplier`, `prospect`, `contact` |

**Exemple :**
> "Recherche le client Alternatives dans Axelor"

---

### `get_partner`

Retourne tous les détails d'un partenaire à partir de son ID.

**Paramètres :**
| Paramètre | Type | Obligatoire | Description |
|-----------|------|-------------|-------------|
| `id` | number | oui | ID du partenaire (visible dans les résultats de `search_partners`) |

**Exemple :**
> "Donne-moi les détails du partenaire ID 42"
