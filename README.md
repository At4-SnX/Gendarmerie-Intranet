# 🎖️ Gendarmerie Nationale RP — Intranet Web

Site web intranet sécurisé avec authentification Discord OAuth2.
Seuls les membres ayant le rôle **Gendarmerie Nationale** (ID: `1508154312595869726`) peuvent accéder au contenu.

---

## Fonctionnalités

- 🔐 **Connexion Discord OAuth2** — Authentification via compte Discord
- 📂 **Casiers judiciaires B3** — Créer, consulter, rechercher, supprimer
- 🔍 **Avis de recherche** — Publier et clore des avis avec niveau de danger
- 📋 **Ordres de service** — Publier des ordres avec priorité
- 📊 **Tableau de bord** — Vue d'ensemble des statistiques

---

## 🚀 Déploiement sur Railway

### Étape 1 — Application Discord

1. Va sur [discord.com/developers/applications](https://discord.com/developers/applications)
2. Crée (ou utilise) ton application → onglet **OAuth2 > General**
3. Dans **Redirects**, ajoute : `https://TON-DOMAINE.railway.app/auth/callback`
4. Note l'**Application ID** (= `DISCORD_CLIENT_ID`) et le **Client Secret** (= `DISCORD_CLIENT_SECRET`)
5. Le bot doit être dans le serveur avec la permission `Read Guild Members`

### Étape 2 — Deploy Railway

1. Push ce dossier sur un repo GitHub
2. [railway.app](https://railway.app) → **New Project** → **Deploy from GitHub**
3. Sélectionne ton repo

### Étape 3 — Variables d'environnement

Dans Railway → ton projet → **Variables** → ajoute :

| Variable | Valeur | Description |
|---|---|---|
| `DISCORD_CLIENT_ID` | `ton_app_id` | Application ID Discord |
| `DISCORD_CLIENT_SECRET` | `ton_secret` | Client Secret Discord |
| `REDIRECT_URI` | `https://TON-APP.railway.app/auth/callback` | URL de callback OAuth2 |
| `SESSION_SECRET` | `une_chaine_aleatoire_longue` | Clé de chiffrement des sessions |
| `GUILD_ID` | `id_de_ton_serveur_discord` | ID du serveur Discord |
| `DISCORD_TOKEN` | `token_de_ton_bot` | Token bot pour vérifier les rôles |

> Le rôle vérifié est hardcodé : `1508154312595869726` (Gendarmerie Nationale)

### Étape 4 — Domaine Railway

Dans Railway → ton projet → **Settings** → **Networking** → génère un domaine public.
Mets ce domaine dans `REDIRECT_URI` et dans les **Redirects** de l'application Discord.

---

## Structure des fichiers

```
gendarmerie-web/
├── server.js          ← Serveur Express principal
├── package.json
├── Procfile           ← Pour Railway
├── public/
│   └── css/
│       └── style.css  ← Styles (thème bleu militaire)
└── gend_web.db        ← Base de données SQLite (auto-créée)
```

---

## Base de données

SQLite via `better-sqlite3`. Fichier `gend_web.db` créé automatiquement.

**Tables :**
- `casiers` — Casiers judiciaires B3
- `avis_recherche` — Avis de recherche actifs/clos
- `ordres_service` — Ordres de service

> ⚠️ Sur Railway, le filesystem est éphémère entre redémarrages.
> Pour une DB persistante, configure un **Volume Railway** monté sur `/app`.
