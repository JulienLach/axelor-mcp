# Axelor MCP — Connecteur Axelor pour Claude Desktop

Ce projet permet à Claude d'interroger directement votre instance Axelor : rechercher des partenaires, consulter et créer des commandes clients, etc.

## Table des matières

- [Developer](#developer)
- [Installation chez un client Windows](#installation-chez-un-client-windows)
- [Outils disponibles](#outils-disponibles)

---

## Developer

### Prérequis

1. **Node.js v24 LTS** → [Télécharger ici](https://nodejs.org/en/download)
2. **Claude Code** (CLI)

### Installation

```bash
git clone <url-du-repo> C:\Users\<NomUtilisateur>\Documents\axelor-mcp
cd C:\Users\<NomUtilisateur>\Documents\axelor-mcp
npm install
```

Créer un fichier `.env` à la racine :

```env
AXELOR_BASE_URL=https://votre-instance.axelor.com
AXELOR_USERNAME=votre_identifiant
AXELOR_PASSWORD=votre_mot_de_passe
```

Le serveur MCP est automatiquement configuré via `.mcp.json` — Claude Code le détecte au démarrage.

---

## Installation chez un client Windows

L'installation est manuelle et se fait en 4 étapes. Il faut intervenir directement sur le poste du client.

### 1. Installer Node.js

Télécharger et installer **Node.js v24 LTS** → [nodejs.org](https://nodejs.org/en/download) (choisir « Windows Installer »).

Vérifier l'installation dans un terminal :
```bash
node --version
```

### 2. Déposer le projet

Copier le dossier du projet sur le poste, par exemple dans `C:\axelor-mcp`.

Ouvrir un terminal dans ce dossier et installer les dépendances :
```bash
npm install
```

### 3. Créer le fichier de configuration

Créer un fichier `.env` à la racine du projet :

```env
AXELOR_BASE_URL=https://instance-client.axelor.com
AXELOR_USERNAME=identifiant_client
AXELOR_PASSWORD=mot_de_passe_client
```

### 4. Connecter à Claude Desktop

Ouvrir ce fichier (le créer s'il n'existe pas) :

```
C:\Users\<NomUtilisateur>\AppData\Roaming\Claude\claude_desktop_config.json
```

Y ajouter le bloc suivant en remplaçant `C:/axelor-mcp` par le chemin réel :

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

Fermer complètement Claude Desktop (clic droit sur l'icône dans la barre des tâches → Quitter), puis le rouvrir. Une icône de marteau apparaît en bas de la fenêtre — le connecteur est actif.

---

## Outils disponibles

Une fois connecté, Claude comprend les demandes en langage naturel. Exemples de ce qu'il peut faire :

**Partenaires**
- `search_partners` — *"Recherche le client Dupont dans Axelor"*
- `get_partner` — *"Donne-moi les détails du partenaire ID 42"*

**Produits**
- `search_products` — *"Trouve le produit Prestation de conseil dans le catalogue"*

**Commandes clients**
- `search_sale_orders` — *"Montre-moi les commandes confirmées non facturées du client Dupont confirmées depuis le 2025-01-01"* (filtres : client, statut, facturation, livraison, période de confirmation, pagination)
- `get_sale_order` — *"Détails de la commande ID 123"*
- `create_sale_order` — *"Crée un devis pour le client Dupont avec 2 jours de prestation"*

**Factures**
- `search_invoices` — *"Factures impayées du client Dupont"*, *"Factures émises en janvier 2026"*, *"Avoirs clients du trimestre"* (filtres : client, numéro, statut, type, période, échéance, unpaidOnly)
- `get_invoice` — *"Détails de la facture ID 456"*

**Analyse des ventes**
- `analyze_sales` — *"Tendance mensuelle de mon CA sur les 3 derniers mois"*, *"Top clients par CA sur 2025"*, *"Performance par commercial ce trimestre"* (groupBy : month / client / salesperson / status ; filtres : période, statut, client, commercial)
- `analyze_products` — *"Top 15 produits par CA sur le dernier trimestre"*, *"Répartition mensuelle des ventes par famille de produits"* (groupBy : product / family / category ; filtres : période, client, topN)

**Opportunités CRM**
- `search_opportunities` — *"Liste mes opportunités ouvertes pour le client Dupont"*
- `get_opportunity` — *"Détails de l'opportunité ID 56"*
- `create_opportunity` — *"Crée une opportunité de 15 000 € pour le prospect Martin avec 60 % de probabilité"*

**Pistes CRM**
- `search_leads` — *"Montre-moi les pistes chaudes non converties assignées à Julie"*
- `get_lead` — *"Détails de la piste ID 78"*
- `create_lead` — *"Crée une piste pour Jean Dupont de la société ABC, email jean@abc.fr"*
