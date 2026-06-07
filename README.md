# 🎖️ Gendarmerie Nationale RP — Intranet Web v2

## Variables d'environnement Railway

| Variable | Obligatoire | Description |
|---|---|---|
| `DISCORD_CLIENT_ID` | ✅ | Application ID de ton app Discord |
| `DISCORD_CLIENT_SECRET` | ✅ | Client Secret de ton app Discord |
| `REDIRECT_URI` | ✅ | `https://TON-APP.railway.app/auth/callback` |
| `SESSION_SECRET` | ✅ | Chaîne aléatoire longue (ex: 64 caractères) |
| `GUILD_ID` | ✅ | ID de ton serveur Discord |
| `DISCORD_TOKEN` | ✅ | Token de ton bot Discord (pour vérifier les rôles) |

---

## Pages & Accès

| Page | URL | Accès |
|---|---|---|
| Connexion | `/` | Public |
| Tableau de bord | `/tableau-de-bord` | Rôle Gendarmerie Nationale |
| Casiers B3 | `/casiers` | Rôle Gendarmerie Nationale |
| Fichiers [S] | `/fichiers-s` | Rôle Gendarmerie Nationale |
| Mandats | `/mandats` | Tous (émission : Parquet + Magistrature) |
| Rapports de patrouille | `/rapports` | Rôle Gendarmerie Nationale |
| Espace G.A. | `/espace-ga` | GA1 et GA2 uniquement |
| Ordres de service | `/ordres-service` | Tous (publication : Officiers) |

---

## Grades reconnus

**Officiers supérieurs** — COL, LCL, CEN  
**Officiers subalternes** — CNE, LTN, SLT, ELO  
**Sous-officiers supérieurs** — MAJ, ADC, ADJ  
**Sous-officiers subalternes** — MDC, GND, ELG  
**Militaires du rang** — MDL, BRC, BRI, GA1, GA2  
**Réserve** — RSVT  
**Ministère Public** — PG, PR, PA (peuvent émettre des mandats)  
**Magistrature** — PT, JI, JLD, JAP (peuvent émettre des mandats)  
**Auxiliaires de justice** — AG, ACO  
**Représentant** — RS  

---

## Déploiement Railway

1. Push sur GitHub
2. Railway → New Project → Deploy from GitHub
3. Ajouter les variables ci-dessus
4. Dans ton **Application Discord** (developer portal) → OAuth2 → ajouter le Redirect URI

### Permissions bot requises
`Read Guild Members` (pour vérifier les rôles via l'API)

### Intents requis (Developer Portal → Bot)
- ✅ Server Members Intent
