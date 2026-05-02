# Axelor MCP — Connecteur Axelor pour Claude Desktop

Ce projet permet à Claude Desktop d'interroger directement votre instance Axelor : rechercher des partenaires, consulter des commandes clients, etc.

---

## Prérequis

Avant de commencer, installer dans cet ordre :

1. **Node.js v24 LTS** → [Télécharger ici](https://nodejs.org/en/download) (choisir « Windows Installer »)
2. **Claude Desktop** → [Télécharger ici](https://claude.ai/download)

---

## Installation

### 1. Télécharger le projet

Cliquer sur le bouton vert **Code** → **Download ZIP**, puis extraire le dossier où vous voulez (par exemple `C:\axelor-mcp`).

Ou via Git :
```bash
git clone <url-du-repo>
```

### 2. Installer les dépendances

Ouvrir un terminal dans le dossier du projet et exécuter :
```bash
npm install
```

### 3. Créer le fichier de configuration

Créer un fichier nommé `.env` à la racine du projet avec ce contenu :

```env
AXELOR_BASE_URL=https://votre-instance.axelor.com
AXELOR_USERNAME=votre_identifiant
AXELOR_PASSWORD=votre_mot_de_passe
```

Remplacer les trois valeurs par vos identifiants Axelor.

---

## Connexion à Claude Desktop

### 1. Ouvrir le fichier de configuration de Claude Desktop

Ce fichier se trouve ici (copier ce chemin dans l'explorateur Windows) :

```
C:\Users\<VotreNom>\AppData\Roaming\Claude\claude_desktop_config.json
```

> Remplacer `<VotreNom>` par votre nom d'utilisateur Windows.

Si le fichier n'existe pas, le créer avec le contenu ci-dessous.

### 2. Ajouter la configuration du serveur MCP

Coller ce bloc dans le fichier, en remplaçant `C:/axelor-mcp` par le chemin réel du dossier :

```json
{
    "mcpServers": {
        "axelor": {
            "command": "node",
            "args": [
                "--env-file=C:/axelor-mcp/.env",
                "C:/axelor-mcp/index.ts"
            ]
        }
    }
}
```

> **Attention :** utiliser des `/` et non des `\` dans les chemins.

### 3. Redémarrer Claude Desktop

Fermer complètement Claude Desktop (clic droit sur l'icône dans la barre des tâches → Quitter), puis le rouvrir.

Un icône de marteau apparaît en bas de la fenêtre de chat — le connecteur est actif.

---

## Outils disponibles

Une fois connecté, Claude peut utiliser les commandes suivantes sur simple demande en langage naturel.

### Partenaires

#### `search_partners` — Rechercher un partenaire
Recherche des clients, fournisseurs, prospects ou contacts par nom.

| Paramètre | Description |
|-----------|-------------|
| `query` | Nom ou référence du partenaire |
| `type` | Optionnel : `customer`, `supplier`, `prospect`, `contact` (défaut : tous) |

> Exemple : *"Recherche le client Alternatives dans Axelor"*

---

#### `get_partner` — Détails d'un partenaire
Retourne toutes les informations d'un partenaire à partir de son ID.

| Paramètre | Description |
|-----------|-------------|
| `id` | ID du partenaire (visible dans les résultats de `search_partners`) |

> Exemple : *"Donne-moi les détails du partenaire ID 42"*

---

### Commandes clients

#### `search_sale_orders` — Rechercher des commandes clients
Recherche des commandes avec filtres possibles sur le client, le numéro, le statut, la facturation et la livraison.

| Paramètre | Description |
|-----------|-------------|
| `clientName` | Nom (partiel) du client |
| `orderSeq` | Numéro de commande (ex : `SO-00042`) |
| `externalReference` | Référence bon de commande client |
| `statusSelect` | Statut : `draft`, `finalized`, `confirmed`, `completed`, `cancelled` |
| `invoicingState` | Facturation : `not_invoiced`, `partially_invoiced`, `invoiced` |
| `deliveryState` | Livraison : `not_delivered`, `partially_delivered`, `delivered` |

> Exemple : *"Montre-moi les commandes confirmées non encore facturées"*

---

#### `get_sale_order` — Détails d'une commande client
Retourne toutes les informations d'une commande à partir de son ID.

| Paramètre | Description |
|-----------|-------------|
| `id` | ID de la commande (visible dans les résultats de `search_sale_orders`) |

> Exemple : *"Donne-moi les détails de la commande ID 123"*
