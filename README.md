# Gendarmerie Nationale RP — Intranet v3

## Variables d'environnement (Railway)

| Variable | Description |
|---|---|
| `DISCORD_CLIENT_ID` | Application ID Discord |
| `DISCORD_CLIENT_SECRET` | Client Secret Discord |
| `REDIRECT_URI` | `https://TON-APP.railway.app/auth/callback` |
| `SESSION_SECRET` | Chaîne aléatoire longue |
| `GUILD_ID` | ID du serveur Discord |
| `DISCORD_TOKEN` | Token du bot (lecture des membres) |

## Règles d'accès

| Rôle | Accès |
|---|---|
| Gendarmerie Nationale | Accès complet selon grade |
| Préfecture | Mandats uniquement (émission : PA, PR, PG) |
| I.G.G.N. | Accès espace disciplinaire dédié |
| Autres / unités spéciales | Accès refusé |

## Permissions par grade

| Action | Grade minimum |
|---|---|
| Créer un casier | Sous-Officier Subalterne (MDC, GND, ELG) |
| Rédiger un rapport | Sous-Officier Subalterne |
| Émettre un mandat | Parquet ou Magistrature |
| Publier un ordre de service | Officier (CNE et +) |
| Espace G.A. | GA1 et GA2 uniquement |
| Espace I.G.G.N. | Rôle I.G.G.N. uniquement |

> Les unités spéciales ne sont pas reconnues sur ce système.
