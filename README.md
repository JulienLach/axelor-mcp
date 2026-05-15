# Axelor MCP - Connecteur Axelor pour Claude Desktop

Ce projet permet à Claude d'interroger directement votre instance Axelor : rechercher des partenaires, consulter et créer des commandes clients, etc.

## Aperçu

![Serveur MCP Axelor dans Claude Desktop](docs/axelor-mcp-claude-desktop.png)

![Exemple de création de piste CRM via Claude](docs/axelor-mcp-claude-desktop-2.png)

## Table des matières

- [Développeur](#développeur)
- [Installation Windows](#installation-windows)
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

Créer un fichier `.mcp.json` à la racine du projet en adaptant le chemin vers `index.ts` :

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

## Installation Windows

L'installation manuelle et se fait en 4 étapes.

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

Dans le terminal, installer les dépendances :

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

Y ajouter le bloc suivant en remplaçant `<NomUtilisateur>` par le nom de votre utilisateur Windows :

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

Fermer complètement Claude Desktop (clic droit sur l'icône dans la barre des tâches → quitter), puis le redémarrer. Le serveur MCP Axelor devrait se lancer automatiquement.

---

## Outils disponibles

Une fois connecté, vous pouvez faire vos demandes en langage naturel, le MCP va les interpréter. Exemples de ce qu'il peut faire :

**Partenaires**

- `search_partners` — _"Recherche le client Dupont dans Axelor"_
- `get_partner` — _"Montre-moi toutes les infos sur le partenaire Dupont"_

**Produits**

- `search_products` — _"Trouve le produit Prestation de conseil dans le catalogue"_

**Commandes clients**

- `search_sale_orders` — _"Commandes confirmées non facturées du client Dupont depuis janvier 2025"_ (filtres : client, statut, facturation, livraison, période de confirmation, pagination)
- `get_sale_order` — _"Donne-moi le détail complet de la commande SO-00042"_
- `create_sale_order` — _"Crée un devis pour le client Dupont avec 2 jours de prestation"_

**Factures**

- `search_invoices` — _"Factures impayées du client Dupont"_, _"Factures émises en janvier 2026"_, _"Avoirs clients du trimestre"_ (filtres : client, numéro, statut, type, période, échéance, unpaidOnly)
- `get_invoice` — _"Montre-moi le détail de la facture FAC-00123"_

**Analyse des ventes**

- `analyze_sales` — _"Tendance mensuelle de mon CA sur les 3 derniers mois"_, _"Top clients par CA sur 2025"_, _"Performance par commercial ce trimestre"_ (groupBy : month / client / salesperson / status ; filtres : période, statut, client, commercial)
- `analyze_products` — _"Top 15 produits par CA sur le dernier trimestre"_, _"Répartition mensuelle des ventes par famille de produits"_ (groupBy : product / family / category ; filtres : période, client, topN)

**Opportunités CRM**

- `search_opportunities` — _"Liste mes opportunités ouvertes pour le client Dupont"_
- `get_opportunity` — _"Détails de l'opportunité Structure métallique Tuyauterie & Caux"_
- `create_opportunity` — _"Crée une opportunité de 15 000 € pour le prospect Martin avec 60 % de probabilité"_

**Pistes CRM**

- `search_leads` — _"Montre-moi les pistes chaudes non converties assignées à Julien"_
- `get_lead` — _"Détails de la piste Jean Dupont chez ABC"_
- `create_lead` — _"Crée une piste pour Jean Dupont de la société ABC, email jean@abc.fr"_

**Projets**

- `search_projects` — _"Liste les projets ouverts du client Dupont"_, _"Projets en retard assignés à Marie"_ (filtres : client, responsable, statut, isOverdue, isBusinessProject, pagination)
- `analyze_projects` — _"Consommé vs vendu par client sur tous les projets ouverts"_, _"Charge par responsable avec projets en retard"_, _"Répartition par statut des projets commerciaux"_ (groupBy : client / assignedTo / status ; filtres : client, responsable, retard, projets commerciaux)

**Feuilles de temps**

- `search_timesheets` — _"Feuilles de temps en attente de validation"_, _"Feuilles de temps de Dupont sur janvier 2026"_ (filtres : employé, statut, période)
- `get_timesheet` — _"Montre-moi le détail de la feuille de temps de Dupont avec toutes ses lignes"_
- `summary_timesheet_by_project` — _"Temps passé sur mes projets cette semaine"_, _"Heures imputées par employé en mars 2026"_, _"Récap du temps passé par projet sur le projet X en février"_ (groupBy : project / employee ; filtres : période obligatoire, employé, projet)
