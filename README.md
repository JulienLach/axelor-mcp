# Axelor MCP - Connecteur Axelor pour Claude

Ce serveur MCP connecte Claude à Axelor Open Suite. Vous posez vos questions en langage naturel, et Claude interroge l'ERP pour rechercher les données, les croiser et les analyser : chiffre d'affaires, marges, facturation, pipeline commercial, avancement des projets, temps passé, anomalies techniques…

Il couvre les principaux modules d'Axelor (ventes, facturation, comptabilité, CRM, projets, temps, RH) et peut aussi créer des enregistrements, toujours après confirmation.

## Table des matières

- [Fonctionnement](#fonctionnement)
- [Installation Windows](#installation-windows)
- [Mise à jour](#mise-à-jour)
- [Outils disponibles](#outils-disponibles)

---

## Fonctionnement

Claude lance le serveur MCP comme un sous-processus Node.js et dialogue avec lui en JSON-RPC sur stdin/stdout, sans port réseau. Quand Claude appelle un outil, le serveur valide les arguments, interroge l'API REST d'Axelor avec les identifiants du fichier `.env`, puis renvoie le résultat à Claude.

![Architecture du serveur MCP Axelor](assets/Axelor%20MCP%20-%20Architecture.png)

---

## Installation Windows

### 1. Installer Node.js et Git

Télécharger et installer **Node.js v24 LTS** → [nodejs.org](https://nodejs.org/en/download) (choisir « Windows Installer »).

Télécharger et installer **Git** → [git-scm.com](https://git-scm.com/download/win).

Vérifier les installations dans un terminal :

```bash
node --version
git --version
```

### 2. Télécharger le projet

Ouvrir un terminal et cloner le dépôt dans `C:\Users\<NomUtilisateur>\Documents\axelor-mcp` :

```bash
git clone https://github.com/JulienLach/axelor-mcp C:\Users\<NomUtilisateur>\Documents\axelor-mcp
cd C:\Users\<NomUtilisateur>\Documents\axelor-mcp
```

Dans le terminal, installer les dépendances puis compiler le projet :

```bash
npm install
npm run build
```

### 3. Créer le fichier de configuration

Créer un fichier `.env` à la racine du projet :

```bash
nano .env
```

```env
AXELOR_BASE_URL=https://instance-client.axelor.com
AXELOR_USERNAME=identifiant_client
AXELOR_PASSWORD=mot_de_passe_client
```

### 4. Connecter à Claude Desktop

Dans Claude Desktop, ouvrir les paramètres (menu ☰ en haut à gauche → **Fichier → Paramètres**), puis l'onglet **Développeur** et cliquer sur **Modifier la config**. Cela ouvre le fichier de configuration `claude_desktop_config.json` (situé dans `%APPDATA%\Claude\`).

Y ajouter le bloc suivant en remplaçant `<NomUtilisateur>` par le nom de votre utilisateur Windows :

```json
{
    "mcpServers": {
        "axelor": {
            "command": "node",
            "args": [
                "--env-file=C:/Users/<NomUtilisateur>/Documents/axelor-mcp/.env",
                "C:/Users/<NomUtilisateur>/Documents/axelor-mcp/dist/index.js"
            ]
        }
    }
}
```

Si le fichier contient déjà des réglages (par exemple `"preferences"`), ne pas le remplacer : ajouter seulement la clé `"mcpServers"` à côté, sans oublier la virgule entre les deux. Un JSON invalide empêche le serveur de se charger, sans message d'erreur.

Fermer complètement Claude Desktop (clic droit sur l'icône dans la barre des tâches → quitter), puis le redémarrer. Le serveur MCP Axelor se lance automatiquement : pour le vérifier, cliquer sur le bouton **+** de la zone de message → **Connecteurs**, « axelor » doit apparaître dans la liste.

**En cas de problème :**

- Les journaux du serveur se trouvent dans `%APPDATA%\Claude\logs\mcp-server-axelor.log`.
- Si Claude Desktop a été installé depuis le Microsoft Store, « Modifier la config » peut ouvrir un fichier différent de celui que l'application lit réellement. Ajouter alors la configuration dans `%LOCALAPPDATA%\Packages\Claude_pzs8sxrjxfjjc\LocalCache\Roaming\Claude\claude_desktop_config.json`.

---

## Mise à jour

Claude exécute la version compilée du projet (`dist/index.js`). Pour récupérer une nouvelle version, il faut donc télécharger les modifications **puis** recompiler.

Ouvrir un terminal dans le dossier du projet :

```bash
cd C:\Users\<NomUtilisateur>\Documents\axelor-mcp
git pull origin main
npm install
npm run build
```

- `git pull origin main` récupère la dernière version du code depuis GitHub.
- `npm install` met à jour les dépendances si elles ont changé.
- `npm run build` recompile le projet dans le dossier `dist/`.

Le fichier `.env` n'est pas versionné : il est conservé tel quel lors de la mise à jour.

Redémarrer ensuite Claude pour charger la nouvelle version :

- **Claude Desktop** : fermer complètement l'application (clic droit sur l'icône dans la barre des tâches → quitter), puis la relancer.
- **Claude Code** : quitter la session en cours (`/exit`), puis relancer `claude`. Le serveur MCP étant démarré à l'ouverture de la session, une session déjà ouverte continue d'utiliser l'ancienne version.

---

## Outils disponibles

Une fois connecté, vous pouvez faire vos demandes en langage naturel, le MCP va les interpréter. Exemples :

> Les outils de création (`create_*`) affichent d'abord un aperçu : rien n'est créé dans Axelor tant que vous n'avez pas confirmé.

**Partenaires**

- `search_partners` - _"Recherche le client Dupont dans Axelor"_
- `get_partner` - _"Montre-moi toutes les infos sur le partenaire Dupont"_

**Produits**

- `search_products` - _"Trouve le produit Prestation de conseil dans le catalogue"_

**Commandes clients**

- `search_sale_orders` - _"Commandes confirmées non facturées du client Dupont depuis janvier 2025"_, _"Commandes confirmées pas encore livrées"_ (filtres : client, numéro, référence client, statut, facturation, livraison, période de confirmation, pagination)
- `get_sale_order` - _"Donne-moi le détail complet de la commande SO-00042"_
- `create_sale_order` - _"Crée un devis pour le client Dupont avec 2 jours de prestation"_

**Factures**

- `search_invoices` - _"Factures impayées du client Dupont"_, _"Factures émises en janvier 2026"_, _"Avoirs clients du trimestre"_ (filtres : client, numéro, statut, type, période, échéance, unpaidOnly)
- `get_invoice` - _"Montre-moi le détail de la facture FAC-00123"_
- `analyze_invoices` - _"CA facturé net par équipe ce mois-ci"_, _"Tendance mensuelle de la facturation sur l'exercice"_ (groupBy : month / client / team / status ; factures - avoirs ; filtres : période, statut, client, équipe, client/fournisseur)

**Écritures comptables**

- `search_move_lines` - _"Les impayés du mois en cours"_, _"Lignes non lettrées du client Dupont sur le compte 411000"_ (lecture seule ; filtres : partenaire, compte, journal, période, unpaidOnly - défaut : mois en cours, non soldé)

**Analyse des ventes**

- `analyze_sales` - _"Tendance mensuelle de mon CA sur les 3 derniers mois"_, _"Top clients par CA sur 2025"_, _"Performance par commercial ce trimestre"_, _"Devis et commandes par équipe ce mois-ci"_ (groupBy : month / client / salesperson / team / status ; filtres : période, statut, client, commercial, équipe)
- `analyze_products` - _"Top 15 produits par CA sur le dernier trimestre"_, _"Ventes par famille de produits sur le premier semestre 2026"_ (groupBy : product / family / category ; période obligatoire ; filtres : client, topN)

**Opportunités CRM**

- `search_opportunities` - _"Liste les opportunités du client Dupont"_, _"Opportunités suivies par Marie"_ (filtres : nom, client, responsable, archivé)
- `get_opportunity` - _"Détails de l'opportunité Structure métallique Tuyauterie & Caux"_
- `create_opportunity` - _"Crée une opportunité de 15 000 € pour le prospect Martin avec 60 % de probabilité"_
- `analyze_opportunities` - _"État du pipeline par étape de vente"_, _"Pipeline pondéré par commercial pour les closings du trimestre"_, _"Quelles sources apportent le plus d'opportunités ?"_ (groupBy : status / salesperson / source / month ; montant total et pondéré par la probabilité ; filtres : période de closing prévue, client, commercial)

**Pistes CRM**

- `search_leads` - _"Montre-moi les pistes chaudes non converties assignées à Julien"_
- `get_lead` - _"Détails de la piste Jean Dupont chez ABC"_
- `create_lead` - _"Crée une piste pour Jean Dupont de la société ABC, email jean@abc.fr"_

**Projets**

- `search_projects` - _"Liste les projets ouverts du client Dupont"_, _"Projets en retard assignés à Marie"_ (filtres : client, responsable, statut, isOverdue, isBusinessProject, pagination)
- `analyze_projects` - _"Consommé vs vendu par client sur les projets commerciaux"_, _"Charge par responsable avec projets en retard"_, _"Répartition par statut des projets commerciaux"_ (groupBy : client / assignedTo / status ; filtres : client, responsable, retard, projets commerciaux)
- `get_project_tasks_summary` - _"Fais-moi la synthèse des tâches de l'affaire Refonte site web"_, _"Quelles tâches sont sans responsable sur ce projet ?"_ (répartition par statut et par responsable, tâches en retard, avancement global, heures estimées vs consommées ; possibilité d'exclure les statuts terminés)

**Feuilles de temps**

- `search_timesheets` - _"Feuilles de temps en attente de validation"_, _"Feuilles de temps de Dupont sur janvier 2026"_ (filtres : employé, statut, période)
- `get_timesheet` - _"Montre-moi la feuille de temps de Dupont de la semaine dernière"_ (pour le détail des heures saisies : `search_timesheet_lines`)
- `summary_timesheet_by_project` - _"Temps passé par projet cette semaine"_, _"Heures imputées par employé en mars 2026"_, _"Récap du temps passé par projet sur le projet X en février"_ (groupBy : project / employee ; filtres : période obligatoire, employé, projet, statut de feuille - défaut : hors feuilles refusées et annulées)
- `search_timesheet_lines` - _"Détail des heures saisies par Dupont la semaine dernière"_, _"Lignes de temps à facturer non facturées sur le projet X"_ (date, employé, projet, tâche, activité, heures, commentaire, facturation ; filtres : employé, projet, période, à facturer, facturé, statut de feuille)
- `analyze_unbilled_time` - _"Quel est l'en-cours de temps non facturé par client ?"_, _"En-cours par équipe à fin septembre"_ (temps à facturer pas encore facturé, en heures et valorisé HT ; groupBy : project / client / team / employee ; filtres : période, client, projet, employé, équipe)

**Postes à pourvoir (RH)**

- `search_job_positions` - _"Liste les postes ouverts"_, _"Postes en attente dans le département Commercial"_, _"Offres publiées chez Axelor SAS"_ (filtres : intitulé, statut, société, département, type de contrat, archivé)
- `get_job_position` - _"Détails complets du poste ID 42"_
- `create_job_position` - _"Crée un poste de Développeur Java, expérience 2-5 ans, salaire 45 000 €, à pourvoir le 1er juin"_

**Anomalies / Debug**

- `search_tracebacks` - _"Montre-moi les erreurs bloquantes de la semaine"_, _"Anomalies sur le module de facturation depuis lundi"_ (filtres : période, catégorie non_bloquant/bloquant/fonctionnel, origine, exception, utilisateur, archivé)
- `get_traceback` - _"Analyse technique de cette anomalie"_ - chaîne d'exceptions, frames applicatifs isolés (bruit framework filtré), premier point d'entrée probable du bug ; option `showFullTrace` pour la stack brute complète
- `analyze_tracebacks` - _"Quelles sont les erreurs les plus fréquentes ce mois-ci ?"_, _"Y a-t-il une régression sur le module de vente ?"_ - top exceptions par fréquence, top modules/origines touchés, tendance par jour sur 14 jours (⚠ erreurs bloquantes mises en évidence)

**Dashboards**

- `dashboard_guidelines` (prompt) - guide de bonnes pratiques à lancer avant de demander un dashboard : tools à utiliser pour chaque indicateur, périodes explicites, montants HT, aucun chiffre inventé, note de méthodologie. Dans Claude Desktop, il se lance depuis le bouton « + » de la zone de message, parmi les options du connecteur Axelor. Paramètre optionnel : le dashboard souhaité, par exemple _"CA et facturation par équipe sur le mois"_.
