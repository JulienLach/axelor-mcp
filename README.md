# Axelor MCP — Connecteur Axelor pour Claude Desktop

Ce projet permet à Claude d'interroger directement votre instance Axelor : rechercher des partenaires, consulter et créer des commandes clients, etc.

## Table des matières

- [Développeur](#développeur)
- [Installation chez un client Windows](#installation-sous-windows)
- [Outils disponibles](#outils-disponibles)

---

## Développeur

### Prérequis

1. **Node.js v24 LTS** → [Télécharger ici](https://nodejs.org/en/download)
2. **Claude Code** (CLI)

### Installation

```bash
git clone <url-du-repo> ~/Documents/axelor-mcp
cd ~/Documents/axelor-mcp
npm install
```

Créer un fichier `.env` à la racine :

```env
AXELOR_BASE_URL=https://votre-instance.axelor.com
AXELOR_USERNAME=votre_identifiant
AXELOR_PASSWORD=votre_mot_de_passe
```

Créer un fichier `.mcp.json` à la racine du projet (en adaptant le chemin) :

```json
{
    "mcpServers": {
        "axelor": {
            "command": "node",
            "args": ["--env-file=/chemin/vers/axelor-mcp/.env", "--import=tsx", "/chemin/vers/axelor-mcp/index.ts"]
        }
    }
}
```

Claude Code détecte ce fichier au démarrage et charge automatiquement le serveur MCP.

---

## Installation sous Windows

L'installation est manuelle et se fait en 4 étapes. Il faut intervenir directement sur le poste du client.

### 1. Installer Node.js

Télécharger et installer **Node.js v24 LTS** → [nodejs.org](https://nodejs.org/en/download) (choisir « Windows Installer »).

Vérifier l'installation dans un terminal :

```bash
node --version
```

### 2. Télécharger le projet

Ouvrir un terminal et cloner le dépôt dans `C:\Users\<NomUtilisateur>\Documents\axelor-mcp` :

```bash
git clone <url-du-repo> C:\Users\<NomUtilisateur>\Documents\axelor-mcp
cd C:\Users\<NomUtilisateur>\Documents\axelor-mcp
```

Installer les dépendances :

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

Dans Claude Desktop, ouvrir **Paramètres → Développeur → Modifier la configuration**. Cela ouvre directement le fichier de configuration.

Y ajouter le bloc suivant en remplaçant `<NomUtilisateur>` par le nom de session Windows réel :

```json
{
    "mcpServers": {
        "axelor": {
            "command": "node",
            "args": [
                "--env-file=C:/Users/<NomUtilisateur>/Documents/axelor-mcp/.env",
                "C:/Users/<NomUtilisateur>/Documents/axelor-mcp/index.ts"
            ]
        }
    }
}
```

> **Attention :** utiliser des `/` et non des `\` dans les chemins.

Fermer complètement Claude Desktop (clic droit sur l'icône dans la barre des tâches → Quitter), puis le redémarrer. Le serveur MCP devrait se lancer automatiquement et être prêt à recevoir les commandes.

---

## Outils disponibles

Une fois connecté, vous pouvez faire vos demandes en langage naturel, le MCP va les interpréter. Exemples de ce qu'il peut faire :

**Partenaires**

- `search_partners` — *"Recherche le client Dupont dans Axelor"*
- `get_partner` — *"Montre-moi toutes les infos sur le partenaire Dupont"*

**Produits**

- `search_products` — _"Trouve le produit Prestation de conseil dans le catalogue"_

**Commandes clients**

- `search_sale_orders` — *"Commandes confirmées non facturées du client Dupont depuis janvier 2025"* (filtres : client, statut, facturation, livraison, période de confirmation, pagination)
- `get_sale_order` — *"Donne-moi le détail complet de la commande SO-00042"*
- `create_sale_order` — *"Crée un devis pour le client Dupont avec 2 jours de prestation"*

**Factures**

- `search_invoices` — *"Factures impayées du client Dupont"*, *"Factures émises en janvier 2026"*, *"Avoirs clients du trimestre"* (filtres : client, numéro, statut, type, période, échéance, unpaidOnly)
- `get_invoice` — *"Montre-moi le détail de la facture FAC-00123"*

**Analyse des ventes**

- `analyze_sales` — _"Tendance mensuelle de mon CA sur les 3 derniers mois"_, _"Top clients par CA sur 2025"_, _"Performance par commercial ce trimestre"_ (groupBy : month / client / salesperson / status ; filtres : période, statut, client, commercial)
- `analyze_products` — _"Top 15 produits par CA sur le dernier trimestre"_, _"Répartition mensuelle des ventes par famille de produits"_ (groupBy : product / family / category ; filtres : période, client, topN)

**Opportunités CRM**

- `search_opportunities` — *"Liste mes opportunités ouvertes pour le client Dupont"*
- `get_opportunity` — *"Détails de l'opportunité Structure métallique Tuyauterie & Caux"*
- `create_opportunity` — *"Crée une opportunité de 15 000 € pour le prospect Martin avec 60 % de probabilité"*

**Pistes CRM**

- `search_leads` — *"Montre-moi les pistes chaudes non converties assignées à Julien"*
- `get_lead` — *"Détails de la piste Jean Dupont chez ABC"*
- `create_lead` — *"Crée une piste pour Jean Dupont de la société ABC, email jean@abc.fr"*

**Projets**

- `search_projects` — *"Liste les projets ouverts du client Dupont"*, *"Projets en retard assignés à Marie"* (filtres : client, responsable, statut, isOverdue, isBusinessProject, pagination)
- `analyze_projects` — *"Consommé vs vendu par client sur tous les projets ouverts"*, *"Charge par responsable avec projets en retard"*, *"Répartition par statut des projets commerciaux"* (groupBy : client / assignedTo / status ; filtres : client, responsable, retard, projets commerciaux)

**Feuilles de temps**

- `search_timesheets` — *"Feuilles de temps en attente de validation"*, *"Feuilles de temps de Dupont sur janvier 2026"* (filtres : employé, statut, période)
- `get_timesheet` — *"Montre-moi le détail de la feuille de temps de Dupont avec toutes ses lignes"*
