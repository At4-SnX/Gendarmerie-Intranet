'use strict';
 
const express  = require('express');
const session  = require('express-session');
const fetch    = require('node-fetch');
const Database = require('better-sqlite3');
const path     = require('path');
 
const app  = express();
const PORT = process.env.PORT || 3000;
 
// ─── CONFIG ──────────────────────────────────────────────────────────────────
const CFG = {
  CLIENT_ID:      process.env.DISCORD_CLIENT_ID     || '',
  CLIENT_SECRET:  process.env.DISCORD_CLIENT_SECRET || '',
  REDIRECT_URI:   process.env.REDIRECT_URI          || `http://localhost:${PORT}/auth/callback`,
  SESSION_SECRET: process.env.SESSION_SECRET        || 'gend_secret_2024',
  GUILD_ID:       process.env.GUILD_ID              || '',
  BOT_TOKEN:      process.env.DISCORD_TOKEN         || '',
};
 
// ─── HIÉRARCHIE DES GRADES ───────────────────────────────────────────────────
const GRADES = {
  // Officiers supérieurs
  '1508156668549140571': { sigle: 'COL', nom: 'Colonel',               rang: 'OF-5',   cat: 'off_sup'   },
  '1508156770298892318': { sigle: 'LCL', nom: 'Lieutenant-Colonel',    rang: 'OF-4',   cat: 'off_sup'   },
  '1508156770382774434': { sigle: 'CEN', nom: "Chef d'Escadron",        rang: 'OF-3',   cat: 'off_sup'   },
  // Officiers subalternes
  '1508156773335564438': { sigle: 'CNE', nom: 'Capitaine',             rang: 'OF-2',   cat: 'off_sub'   },
  '1508156773993943050': { sigle: 'LTN', nom: 'Lieutenant',            rang: 'OF-1',   cat: 'off_sub'   },
  '1508156774346129588': { sigle: 'SLT', nom: 'Sous-Lieutenant',       rang: 'OF-1',   cat: 'off_sub'   },
  '1508156774715494510': { sigle: 'ELO', nom: 'Élève-Officier',        rang: 'OF(D)',  cat: 'off_sub'   },
  // Sous-officiers supérieurs
  '1508156776279707851': { sigle: 'MAJ', nom: 'Major',                 rang: 'OR-9',   cat: 'sof_sup'   },
  '1508156776317452428': { sigle: 'ADC', nom: 'Adjudant-Chef',         rang: 'OR-9',   cat: 'sof_sup'   },
  '1508156777085141072': { sigle: 'ADJ', nom: 'Adjudant',              rang: 'OR-8',   cat: 'sof_sup'   },
  // Sous-officiers subalternes
  '1508159155511361726': { sigle: 'MDC', nom: 'Maréchal-Des-Logis-Chef', rang: 'OR-6', cat: 'sof_sub'  },
  '1508159156107083907': { sigle: 'GND', nom: 'Gendarme',              rang: 'OR-5',   cat: 'sof_sub'   },
  '1508159157679689828': { sigle: 'ELG', nom: 'Élève-Gendarme',        rang: 'OR-4',   cat: 'sof_sub'   },
  // Militaires du rang
  '1508159156966658059': { sigle: 'MDL', nom: 'Maréchal-Des-Logis',    rang: 'OR-5',   cat: 'rang'      },
  '1508159158891970671': { sigle: 'BRC', nom: 'Brigadier-Chef',        rang: 'OR-4',   cat: 'rang'      },
  '1508159159328182434': { sigle: 'BRI', nom: 'Brigadier',             rang: 'OR-3',   cat: 'rang'      },
  '1508161154692677803': { sigle: 'GA1', nom: 'Gendarme-Adjoint 1ʳᵉ Classe', rang: 'OR-2', cat: 'rang' },
  '1508161155263365212': { sigle: 'GA2', nom: 'Gendarme-Adjoint 2ᵉ Classe',  rang: 'OR-1', cat: 'rang' },
  // Réserve
  '1508168770684850478': { sigle: 'RSVT', nom: 'Réserviste',           rang: 'RSV',    cat: 'reserve'   },
  // Ministère public
  '1512922090297233549': { sigle: 'PR',   nom: 'Procureur de la République', rang: 'MP', cat: 'parquet' },
  '1512922420254605322': { sigle: 'PA',   nom: 'Procureur Adjoint',    rang: 'MP',     cat: 'parquet'   },
  '1512922507487875072': { sigle: 'PG',   nom: 'Procureur Général',    rang: 'MP',     cat: 'parquet'   },
  // Magistrature
  '1512923423800692736': { sigle: 'PT',   nom: 'Président du Tribunal', rang: 'MAG',   cat: 'magistrat' },
  '1512922694495244318': { sigle: 'JI',   nom: "Juge d'Instruction",   rang: 'MAG',    cat: 'magistrat' },
  '1512922835348095148': { sigle: 'JLD',  nom: 'Juge des Libertés et de la Détention', rang: 'MAG', cat: 'magistrat' },
  '1512922637225955378': { sigle: 'JAP',  nom: "Juge d'Application des Peines", rang: 'MAG', cat: 'magistrat' },
  // Auxiliaires de justice
  '1512923786129965077': { sigle: 'AG',   nom: 'Avocat Général',       rang: 'AUX',    cat: 'auxiliaire' },
  '1512923784850706532': { sigle: 'ACO',  nom: "Avocat Commis d'Office", rang: 'AUX',  cat: 'auxiliaire' },
  // Représentant
  '1512953207238955191': { sigle: 'RS',   nom: 'Représentant Serveur', rang: 'REP',    cat: 'representant' },
};
 
const ROLE_GEND_ID = '1508283902672896055'; // Rôle Gendarmerie Nationale
 
// Catégories ayant accès autorisé
const CATS_AUTORISES = ['off_sup','off_sub','sof_sup','sof_sub','rang','reserve','parquet','magistrat','auxiliaire','representant'];
 
// Catégories pouvant émettre des mandats
const CATS_PARQUET = ['parquet','magistrat'];
 
// Catégories espace GA
const ROLES_GA = ['1508161154692677803','1508161155263365212'];
 
function getGradeFromRoles(roles) {
  // On retourne le grade le plus élevé (premier trouvé dans la liste ordonnée)
  const ordre = Object.keys(GRADES);
  for (const id of ordre) {
    if (roles.includes(id)) return { id, ...GRADES[id] };
  }
  return null;
}
 
function isParquet(roles) {
  return roles.some(r => GRADES[r]?.cat && CATS_PARQUET.includes(GRADES[r].cat));
}
function isOfficier(roles) {
  return roles.some(r => ['off_sup','off_sub'].includes(GRADES[r]?.cat));
}
 
// ─── BASE DE DONNÉES ─────────────────────────────────────────────────────────
const db = new Database('./gend_intranet.db');
db.pragma('journal_mode = WAL');
db.exec(`
  CREATE TABLE IF NOT EXISTS casiers (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    nom_prenom   TEXT NOT NULL,
    age_rp       INTEGER NOT NULL,
    faits        TEXT NOT NULL,
    type_peine   TEXT NOT NULL,
    amende       TEXT,
    amende_payee INTEGER DEFAULT 0,
    duree_gav    TEXT,
    duree_prison TEXT,
    photo_url    TEXT,
    created_by   TEXT,
    created_at   TEXT DEFAULT (datetime('now'))
  );
 
  CREATE TABLE IF NOT EXISTS fichiers_s (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    nom_prenom  TEXT NOT NULL,
    age_rp      INTEGER,
    motif       TEXT NOT NULL,
    niveau      TEXT NOT NULL DEFAULT 'S1',
    description TEXT NOT NULL,
    photo_url   TEXT,
    created_by  TEXT,
    actif       INTEGER DEFAULT 1,
    created_at  TEXT DEFAULT (datetime('now'))
  );
 
  CREATE TABLE IF NOT EXISTS mandats (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    type_mandat TEXT NOT NULL,
    cible       TEXT NOT NULL,
    motif       TEXT NOT NULL,
    details     TEXT,
    emis_par    TEXT,
    grade_emis  TEXT,
    statut      TEXT NOT NULL DEFAULT 'actif',
    created_at  TEXT DEFAULT (datetime('now'))
  );
 
  CREATE TABLE IF NOT EXISTS rapports_patrouille (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    titre       TEXT NOT NULL,
    zone        TEXT NOT NULL,
    contenu     TEXT NOT NULL,
    incidents   TEXT,
    agents      TEXT,
    created_by  TEXT,
    grade_by    TEXT,
    created_at  TEXT DEFAULT (datetime('now'))
  );
 
  CREATE TABLE IF NOT EXISTS espace_ga (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    type_msg    TEXT NOT NULL DEFAULT 'message',
    objet       TEXT NOT NULL,
    contenu     TEXT NOT NULL,
    created_by  TEXT,
    created_at  TEXT DEFAULT (datetime('now'))
  );
 
  CREATE TABLE IF NOT EXISTS ordres_service (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    titre       TEXT NOT NULL,
    contenu     TEXT NOT NULL,
    priorite    TEXT NOT NULL DEFAULT 'normale',
    created_by  TEXT,
    grade_by    TEXT,
    created_at  TEXT DEFAULT (datetime('now'))
  );
`);
 
const Q = {
  // Casiers
  listCasiers:   db.prepare(`SELECT * FROM casiers ORDER BY created_at DESC LIMIT 50`),
  getCasier:     db.prepare(`SELECT * FROM casiers WHERE id=?`),
  searchCasier:  db.prepare(`SELECT * FROM casiers WHERE nom_prenom LIKE ? ORDER BY created_at DESC`),
  insertCasier:  db.prepare(`INSERT INTO casiers (nom_prenom,age_rp,faits,type_peine,amende,amende_payee,duree_gav,duree_prison,photo_url,created_by) VALUES (?,?,?,?,?,?,?,?,?,?)`),
  deleteCasier:  db.prepare(`DELETE FROM casiers WHERE id=?`),
 
  // Fichiers S
  listFichiersS:  db.prepare(`SELECT * FROM fichiers_s WHERE actif=1 ORDER BY niveau ASC, created_at DESC`),
  insertFichierS: db.prepare(`INSERT INTO fichiers_s (nom_prenom,age_rp,motif,niveau,description,photo_url,created_by) VALUES (?,?,?,?,?,?,?)`),
  closeFichierS:  db.prepare(`UPDATE fichiers_s SET actif=0 WHERE id=?`),
 
  // Mandats
  listMandats:   db.prepare(`SELECT * FROM mandats ORDER BY created_at DESC LIMIT 50`),
  getMandatsActifs: db.prepare(`SELECT * FROM mandats WHERE statut='actif' ORDER BY created_at DESC`),
  insertMandat:  db.prepare(`INSERT INTO mandats (type_mandat,cible,motif,details,emis_par,grade_emis) VALUES (?,?,?,?,?,?)`),
  cloturerMandat: db.prepare(`UPDATE mandats SET statut='clôturé' WHERE id=?`),
 
  // Rapports
  listRapports:  db.prepare(`SELECT * FROM rapports_patrouille ORDER BY created_at DESC LIMIT 30`),
  getMyRapports: db.prepare(`SELECT * FROM rapports_patrouille WHERE created_by=? ORDER BY created_at DESC`),
  insertRapport: db.prepare(`INSERT INTO rapports_patrouille (titre,zone,contenu,incidents,agents,created_by,grade_by) VALUES (?,?,?,?,?,?,?)`),
 
  // Espace GA
  listGA:        db.prepare(`SELECT * FROM espace_ga ORDER BY created_at DESC LIMIT 40`),
  insertGA:      db.prepare(`INSERT INTO espace_ga (type_msg,objet,contenu,created_by) VALUES (?,?,?,?)`),
 
  // Ordres de service
  listOrdres:    db.prepare(`SELECT * FROM ordres_service ORDER BY created_at DESC LIMIT 20`),
  insertOrdre:   db.prepare(`INSERT INTO ordres_service (titre,contenu,priorite,created_by,grade_by) VALUES (?,?,?,?,?)`),
};
 
// ─── MIDDLEWARE ───────────────────────────────────────────────────────────────
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({
  secret: CFG.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 1000 * 60 * 60 * 8 },
}));
app.use((req, res, next) => { res.locals.user = req.session.user || null; next(); });
 
// ─── GUARD ───────────────────────────────────────────────────────────────────
async function requireAuth(req, res, next) {
  if (!req.session.user) return res.redirect('/');
  try {
    const r = await fetch(
      `https://discord.com/api/v10/guilds/${CFG.GUILD_ID}/members/${req.session.user.id}`,
      { headers: { Authorization: `Bot ${CFG.BOT_TOKEN}` } }
    );
    if (!r.ok) { req.session.destroy(); return res.redirect('/?err=guild'); }
    const member = await r.json();
    const roles  = member.roles || [];
    if (!roles.includes(ROLE_GEND_ID)) return res.redirect('/acces-refuse');
    // Mettre à jour le pseudo visuel du serveur
    req.session.user.nick       = member.nick || member.user?.global_name || req.session.user.username;
    req.session.user.roles      = roles;
    req.session.user.grade      = getGradeFromRoles(roles);
    req.session.user.isParquet  = isParquet(roles);
    req.session.user.isOfficier = isOfficier(roles);
    req.session.user.isGA       = roles.some(r => ROLES_GA.includes(r));
    next();
  } catch (e) {
    console.error('Auth error:', e.message);
    res.redirect('/?err=check');
  }
}
 
// ─── HELPERS ─────────────────────────────────────────────────────────────────
function nowFR() {
  return new Date().toLocaleString('fr-FR', { timeZone: 'Europe/Paris', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}
function fmtDate(str) {
  if (!str) return 'N/A';
  return new Date(str.includes('T') ? str : str + 'Z')
    .toLocaleString('fr-FR', { timeZone: 'Europe/Paris', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}
function peineLabel(c) {
  if (c.type_peine === 'amende')  return `<span class="badge amende">AMENDE — ${c.amende || 'N/R'}</span>`;
  if (c.type_peine === 'gav')     return `<span class="badge gav">G.A.V. — ${c.duree_gav || 'N/R'}</span>`;
  if (c.type_peine === 'prison')  return `<span class="badge prison">PRISON — ${c.duree_prison || 'N/R'}</span>`;
  return c.type_peine;
}
function niveauLabel(n) {
  const m = { S1:'■ S1 — Surveillance', S2:'■■ S2 — Dangereux', S3:'■■■ S3 — Très dangereux', S4:'◆ S4 — CRITIQUE' };
  return m[n] || n;
}
function prioriteLabel(p) {
  const m = { basse:'BASSE', normale:'NORMALE', haute:'HAUTE', urgente:'URGENTE' };
  return m[p] || p;
}
function mandatLabel(t) {
  const m = {
    'arrestation':    '⊞ MANDAT D\'ARRESTATION',
    'perquisition':   '⊞ MANDAT DE PERQUISITION',
    'recherche':      '⊞ MANDAT DE RECHERCHE',
    'depot':          '⊞ MANDAT DE DÉPÔT',
    'citation':       '⊞ CITATION À COMPARAÎTRE',
    'saisie':         '⊞ MANDAT DE SAISIE',
  };
  return m[t] || t.toUpperCase();
}
 
// ─── LAYOUT ──────────────────────────────────────────────────────────────────
function layout(title, body, user) {
  const grade = user?.grade;
  const gradeStr = grade ? `${grade.sigle} — ${grade.nom}` : 'Personnel autorisé';
  const nick  = user?.nick || user?.username || '';
  const avatar = user ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=64` : '';
 
  const nav = user ? `
  <nav class="sidebar">
    <div class="sb-header">
      <div class="sb-logo">GENDARMERIE NATIONALE</div>
      <div class="sb-sub">◆ INTRANET SÉCURISÉ ◆</div>
    </div>
    <div class="sb-user">
      <img src="${avatar}" class="sb-avatar" onerror="this.src='data:image/svg+xml,<svg/>'">
      <div class="sb-user-info">
        <div class="sb-nick">${nick}</div>
        <div class="sb-grade">${grade ? `[${grade.rang}] ${grade.sigle} — ${grade.nom}` : '—'}</div>
      </div>
    </div>
    <div class="sb-sep">§ NAVIGATION</div>
    <a href="/tableau-de-bord" class="sb-link">▸ Tableau de bord</a>
    <a href="/casiers" class="sb-link">▸ Casiers judiciaires [B3]</a>
    <a href="/fichiers-s" class="sb-link">▸ Fichiers [S]</a>
    <a href="/mandats" class="sb-link">▸ Mandats de justice</a>
    <a href="/rapports" class="sb-link">▸ Rapports de patrouille</a>
    <a href="/ordres-service" class="sb-link">▸ Ordres de service</a>
    ${user.isGA ? `<a href="/espace-ga" class="sb-link">▸ Espace G.A.</a>` : ''}
    <div class="sb-sep">§ COMPTE</div>
    <a href="/logout" class="sb-link sb-logout">▸ Déconnexion</a>
    <div class="sb-footer">
      ════════════════════<br>
      © R.P. — Usage interne<br>
      Accès restreint — Art. L.2
    </div>
  </nav>
  <div class="main-wrap">
  ` : '<div class="main-wrap full">';
 
  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1.0">
  <title>${title} — Intranet GN-RP</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=IM+Fell+English:ital@0;1&family=Special+Elite&family=Courier+Prime:wght@400;700&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="/css/style.css">
</head>
<body>
${nav}
  <div class="content">
    ${body}
  </div>
</div>
</body>
</html>`;
}
 
// ─── PAGE D'ACCUEIL / LOGIN ───────────────────────────────────────────────────
app.get('/', (req, res) => {
  if (req.session.user) return res.redirect('/tableau-de-bord');
  res.send(`<!DOCTYPE html>
<html lang="fr"><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>Accès — Intranet GN-RP</title>
<link href="https://fonts.googleapis.com/css2?family=IM+Fell+English:ital@0;1&family=Special+Elite&family=Courier+Prime:wght@400;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/css/style.css">
</head><body class="login-body">
<div class="login-outer">
  <div class="login-box">
    <div class="login-ornament">✦ ✦ ✦</div>
    <div class="login-header">
      ══════════════════════════════════<br>
      MINISTÈRE DE L'INTÉRIEUR<br>
      ──────────────────────────────────<br>
      GENDARMERIE NATIONALE<br>
      ══════════════════════════════════
    </div>
    <div class="login-body-text">
      <p class="login-doc-ref">Réf. : GN/SI/INTRA — ACCÈS RESTREINT</p>
      <p class="login-desc">
        Le présent système d'information est réservé exclusivement au personnel<br>
        habilité de la Gendarmerie Nationale.<br><br>
        Tout accès non autorisé constitue une infraction passible de poursuites<br>
        disciplinaires et pénales conformément au règlement intérieur.
      </p>
    </div>
    <div class="login-sep">— § —</div>
    <p class="login-instruction">
      L'authentification s'effectue via le portail Discord du serveur.<br>
      Seuls les membres titulaires du rôle <strong>Gendarmerie Nationale</strong> sont admis.
    </p>
    <a href="/auth/discord" class="btn-login">
      ▸ S'AUTHENTIFIER VIA DISCORD
    </a>
    ${req.query.err ? `<p class="login-error">⚠ Erreur d'authentification : ${req.query.err}</p>` : ''}
    <div class="login-footer">
      ══════════════════════════════════<br>
      Système protégé — Toute tentative d'intrusion sera signalée
    </div>
  </div>
</div>
</body></html>`);
});
 
app.get('/acces-refuse', (req, res) => {
  res.status(403).send(layout('Accès refusé', `
    <div class="doc-box error-doc">
      <div class="doc-title">ACCÈS NON AUTORISÉ — ERREUR 403</div>
      <div class="doc-sep">══════════════════════════════════════════════</div>
      <p>Votre compte ne dispose pas du grade requis pour accéder à ce système.</p>
      <p>Le rôle <strong>Gendarmerie Nationale</strong> est obligatoire.</p>
      <div class="doc-sep">──────────────────────────────────────────────</div>
      <a href="/logout" class="btn-action">▸ SE DÉCONNECTER</a>
    </div>
  `, null));
});
 
// ─── OAUTH2 ───────────────────────────────────────────────────────────────────
app.get('/auth/discord', (req, res) => {
  const p = new URLSearchParams({ client_id: CFG.CLIENT_ID, redirect_uri: CFG.REDIRECT_URI, response_type: 'code', scope: 'identify' });
  res.redirect(`https://discord.com/api/oauth2/authorize?${p}`);
});
 
app.get('/auth/callback', async (req, res) => {
  const { code } = req.query;
  if (!code) return res.redirect('/?err=no_code');
  try {
    const tokenRes = await fetch('https://discord.com/api/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: CFG.CLIENT_ID, client_secret: CFG.CLIENT_SECRET, grant_type: 'authorization_code', code, redirect_uri: CFG.REDIRECT_URI }),
    });
    const tokens = await tokenRes.json();
    if (!tokens.access_token) return res.redirect('/?err=token');
    const userRes = await fetch('https://discord.com/api/v10/users/@me', { headers: { Authorization: `Bearer ${tokens.access_token}` } });
    const du = await userRes.json();
    req.session.user = { id: du.id, username: du.username, global_name: du.global_name, avatar: du.avatar, nick: du.global_name || du.username };
    res.redirect('/tableau-de-bord');
  } catch (e) { res.redirect('/?err=oauth'); }
});
 
app.get('/logout', (req, res) => { req.session.destroy(); res.redirect('/'); });
 
// ─── TABLEAU DE BORD ──────────────────────────────────────────────────────────
app.get('/tableau-de-bord', requireAuth, (req, res) => {
  const u = req.session.user;
  const stats = {
    casiers:  db.prepare(`SELECT COUNT(*) as n FROM casiers`).get().n,
    fichiersS: db.prepare(`SELECT COUNT(*) as n FROM fichiers_s WHERE actif=1`).get().n,
    mandats:  db.prepare(`SELECT COUNT(*) as n FROM mandats WHERE statut='actif'`).get().n,
    rapports: db.prepare(`SELECT COUNT(*) as n FROM rapports_patrouille`).get().n,
  };
  const recentCasiers = db.prepare(`SELECT * FROM casiers ORDER BY created_at DESC LIMIT 5`).all();
  const recentMandats = db.prepare(`SELECT * FROM mandats WHERE statut='actif' ORDER BY created_at DESC LIMIT 3`).all();
 
  const gradeBlock = u.grade ? `
    <div class="dossier-field"><span class="field-label">Matricule</span><span class="field-val">${u.id}</span></div>
    <div class="dossier-field"><span class="field-label">Grade</span><span class="field-val">[${u.grade.rang}] ${u.grade.sigle} — ${u.grade.nom}</span></div>
    <div class="dossier-field"><span class="field-label">Pseudo serveur</span><span class="field-val">${u.nick}</span></div>
    <div class="dossier-field"><span class="field-label">Accès parquet</span><span class="field-val">${u.isParquet ? 'OUI — HABILITÉ' : 'NON'}</span></div>
  ` : '<p>Grade non identifié</p>';
 
  const casierRows = recentCasiers.map(c => `
    <tr>
      <td class="mono">#${c.id}</td>
      <td>${c.nom_prenom}</td>
      <td>${c.age_rp} ans</td>
      <td>${peineLabel(c)}</td>
      <td class="mono small">${fmtDate(c.created_at)}</td>
      <td><a href="/casiers/${c.id}" class="tbl-link">VOIR ▸</a></td>
    </tr>
  `).join('');
 
  const mandatRows = recentMandats.map(m => `
    <div class="mandat-item">
      <span class="mandat-type">${mandatLabel(m.type_mandat)}</span>
      <span class="mandat-cible">— ${m.cible}</span>
      <span class="mandat-date mono small">${fmtDate(m.created_at)}</span>
    </div>
  `).join('');
 
  res.send(layout('Tableau de bord', `
    <div class="page-title">
      ══ TABLEAU DE BORD ══════════════════════════════════════════
    </div>
 
    <div class="grid-2">
      <div class="doc-box">
        <div class="doc-title">§ FICHE DE SERVICE</div>
        <div class="doc-sep">──────────────────────────────────</div>
        ${gradeBlock}
        <div class="doc-sep">──────────────────────────────────</div>
        <div class="dossier-field"><span class="field-label">Date/Heure</span><span class="field-val mono">${nowFR()}</span></div>
      </div>
      <div class="stats-block">
        <div class="stat-row"><span class="stat-num">${stats.casiers}</span><span class="stat-lbl">Casiers judiciaires enregistrés</span></div>
        <div class="stat-row red"><span class="stat-num">${stats.fichiersS}</span><span class="stat-lbl">Fichiers [S] actifs</span></div>
        <div class="stat-row"><span class="stat-num">${stats.mandats}</span><span class="stat-lbl">Mandats en cours</span></div>
        <div class="stat-row"><span class="stat-num">${stats.rapports}</span><span class="stat-lbl">Rapports de patrouille</span></div>
      </div>
    </div>
 
    <div class="doc-box mt">
      <div class="doc-title">§ DERNIERS CASIERS ENREGISTRÉS</div>
      <div class="doc-sep">──────────────────────────────────────────────────────────────</div>
      <table class="doc-table">
        <thead><tr><th>#</th><th>Nom / Prénom</th><th>Âge</th><th>Peine</th><th>Date</th><th></th></tr></thead>
        <tbody>${casierRows || '<tr><td colspan="6" class="empty">— Aucun casier —</td></tr>'}</tbody>
      </table>
    </div>
 
    <div class="doc-box mt">
      <div class="doc-title">§ MANDATS ACTIFS</div>
      <div class="doc-sep">──────────────────────────────────────────────────────────────</div>
      ${mandatRows || '<p class="empty">— Aucun mandat actif —</p>'}
    </div>
  `, u));
});
 
// ─── CASIERS ──────────────────────────────────────────────────────────────────
app.get('/casiers', requireAuth, (req, res) => {
  const q = req.query.q || '';
  const rows = q ? Q.searchCasier.all(`%${q}%`) : Q.listCasiers.all();
  const u = req.session.user;
 
  const tableRows = rows.map(c => `
    <tr>
      <td class="mono">#${c.id}</td>
      <td><strong>${c.nom_prenom}</strong></td>
      <td>${c.age_rp} ans</td>
      <td class="small">${c.faits.substring(0,55)}${c.faits.length>55?'…':''}</td>
      <td>${peineLabel(c)}</td>
      <td class="mono small">${fmtDate(c.created_at)}</td>
      <td><a href="/casiers/${c.id}" class="tbl-link">VOIR ▸</a></td>
    </tr>
  `).join('');
 
  res.send(layout('Casiers judiciaires', `
    <div class="page-title">
      ══ CASIERS JUDICIAIRES — EXTRAITS B3 ════════════════════════
    </div>
    <div class="toolbar">
      <form method="GET" class="search-form">
        <span class="search-label">RECHERCHER ▸</span>
        <input type="text" name="q" value="${q}" placeholder="Nom / Prénom RP..." class="search-input">
        <button type="submit" class="btn-action">CHERCHER</button>
        ${q ? `<a href="/casiers" class="btn-sec">✕ EFFACER</a>` : ''}
      </form>
      <a href="/casiers/nouveau" class="btn-action">⊞ NOUVEAU CASIER</a>
    </div>
    <div class="doc-box">
      <div class="doc-title">§ REGISTRE DES CASIERS — ${rows.length} ENTRÉE(S)</div>
      <div class="doc-sep">──────────────────────────────────────────────────────────────</div>
      <table class="doc-table">
        <thead><tr><th>N°</th><th>Identité</th><th>Âge</th><th>Faits</th><th>Peine</th><th>Date</th><th></th></tr></thead>
        <tbody>${tableRows || '<tr><td colspan="7" class="empty">— Aucun casier trouvé —</td></tr>'}</tbody>
      </table>
    </div>
  `, u));
});
 
app.get('/casiers/nouveau', requireAuth, (req, res) => {
  res.send(layout('Nouveau casier', `
    <div class="page-title">
      ══ CRÉATION — EXTRAIT DE CASIER JUDICIAIRE B3 ═══════════════
    </div>
    <div class="doc-box form-doc">
      <div class="doc-title">§ FORMULAIRE D'ENREGISTREMENT</div>
      <div class="doc-sep">──────────────────────────────────────────────────────────────</div>
      <form method="POST" action="/casiers" class="doc-form">
        <div class="form-row">
          <div class="form-field">
            <label>NOM ET PRÉNOM RP :</label>
            <input type="text" name="nom_prenom" required placeholder="Ex : DUPONT Jean">
          </div>
          <div class="form-field short">
            <label>ÂGE RP :</label>
            <input type="number" name="age_rp" required min="1" max="120" placeholder="Ex : 32">
          </div>
        </div>
        <div class="form-field full">
          <label>FAITS REPROCHÉS / INFRACTIONS :</label>
          <textarea name="faits" required rows="5" placeholder="Décrivez les infractions commises..."></textarea>
        </div>
        <div class="form-row">
          <div class="form-field">
            <label>TYPE DE PEINE :</label>
            <select name="type_peine" id="type_peine" onchange="switchPeine(this.value)">
              <option value="amende">AMENDE</option>
              <option value="gav">GARDE À VUE (G.A.V.)</option>
              <option value="prison">PEINE D'EMPRISONNEMENT</option>
            </select>
          </div>
        </div>
        <div id="peine-amende" class="form-row peine-block">
          <div class="form-field"><label>MONTANT DE L'AMENDE :</label><input type="text" name="amende" placeholder="Ex : 5 000 €"></div>
          <div class="form-field"><label>AMENDE ACQUITTÉE :</label>
            <select name="amende_payee"><option value="0">NON — IMPAYÉE</option><option value="1">OUI — PAYÉE</option></select>
          </div>
        </div>
        <div id="peine-gav" class="form-row peine-block" style="display:none">
          <div class="form-field"><label>DURÉE DE LA G.A.V. :</label><input type="text" name="duree_gav" placeholder="Ex : 24h, 48h"></div>
        </div>
        <div id="peine-prison" class="form-row peine-block" style="display:none">
          <div class="form-field"><label>DURÉE D'EMPRISONNEMENT :</label><input type="text" name="duree_prison" placeholder="Ex : 6 mois, 2 ans"></div>
        </div>
        <div class="form-field full">
          <label>URL PHOTOGRAPHIE DU MIS EN CAUSE (fond blanc) :</label>
          <input type="url" name="photo_url" placeholder="https://...">
        </div>
        <div class="form-actions">
          <a href="/casiers" class="btn-sec">ANNULER</a>
          <button type="submit" class="btn-action">⊞ ENREGISTRER LE CASIER</button>
        </div>
      </form>
    </div>
    <script>
      function switchPeine(v){
        document.querySelectorAll('.peine-block').forEach(e=>e.style.display='none');
        document.getElementById('peine-'+v).style.display='flex';
      }
    </script>
  `, req.session.user));
});
 
app.post('/casiers', requireAuth, (req, res) => {
  const { nom_prenom, age_rp, faits, type_peine, amende, amende_payee, duree_gav, duree_prison, photo_url } = req.body;
  if (!nom_prenom || !age_rp || !faits || !type_peine) return res.redirect('/casiers/nouveau?err=1');
  const u = req.session.user;
  const createdBy = `${u.grade?.sigle || ''} ${u.nick}`.trim();
  const r = Q.insertCasier.run(nom_prenom, parseInt(age_rp), faits, type_peine, amende||null, parseInt(amende_payee)||0, duree_gav||null, duree_prison||null, photo_url||null, createdBy);
  res.redirect(`/casiers/${r.lastInsertRowid}?ok=1`);
});
 
app.get('/casiers/:id', requireAuth, (req, res) => {
  const c = Q.getCasier.get(parseInt(req.params.id));
  if (!c) return res.redirect('/casiers');
  const u = req.session.user;
 
  let peineBlock = '';
  if (c.type_peine === 'amende') peineBlock = `
    <div class="dossier-field"><span class="field-label">TYPE DE PEINE</span><span class="field-val">AMENDE</span></div>
    <div class="dossier-field"><span class="field-label">MONTANT</span><span class="field-val">${c.amende || 'N/R'}</span></div>
    <div class="dossier-field"><span class="field-label">STATUT</span><span class="field-val ${c.amende_payee?'ok':'nok'}">${c.amende_payee ? 'ACQUITTÉE' : 'NON ACQUITTÉE'}</span></div>`;
  else if (c.type_peine === 'gav') peineBlock = `
    <div class="dossier-field"><span class="field-label">TYPE DE PEINE</span><span class="field-val">GARDE À VUE (G.A.V.)</span></div>
    <div class="dossier-field"><span class="field-label">DURÉE G.A.V.</span><span class="field-val">${c.duree_gav || 'N/R'}</span></div>`;
  else if (c.type_peine === 'prison') peineBlock = `
    <div class="dossier-field"><span class="field-label">TYPE DE PEINE</span><span class="field-val">EMPRISONNEMENT</span></div>
    <div class="dossier-field"><span class="field-label">DURÉE</span><span class="field-val">${c.duree_prison || 'N/R'}</span></div>`;
 
  const photoHtml = c.photo_url
    ? `<img src="${c.photo_url}" class="suspect-img" alt="Photo mis en cause" onerror="this.outerHTML='<div class=no-photo>— PHOTO INDISPONIBLE —</div>'">`
    : `<div class="no-photo">— AUCUNE PHOTOGRAPHIE —</div>`;
 
  res.send(layout(`Casier #${c.id}`, `
    <div class="page-title">
      ══ EXTRAIT DE CASIER JUDICIAIRE — DOCUMENT B3 ═══════════════
    </div>
    ${req.query.ok ? `<div class="alert-ok">✔ Casier enregistré avec succès.</div>` : ''}
    <div class="casier-doc doc-box">
      <div class="casier-doc-header">
        <div class="casier-header-left">
          <div class="doc-title">EXTRAIT DE CASIER JUDICIAIRE — B3</div>
          <div class="doc-sep">══════════════════════════════════════════</div>
          <div class="dossier-field"><span class="field-label">N° DE DOSSIER</span><span class="field-val mono">#${c.id}</span></div>
          <div class="dossier-field"><span class="field-label">IDENTITÉ</span><span class="field-val">${c.nom_prenom}</span></div>
          <div class="dossier-field"><span class="field-label">ÂGE RP</span><span class="field-val">${c.age_rp} ans</span></div>
          <div class="doc-sep">──────────────────────────────────────────</div>
          <div class="dossier-field"><span class="field-label">FAITS REPROCHÉS</span></div>
          <div class="faits-text">${c.faits}</div>
          <div class="doc-sep">──────────────────────────────────────────</div>
          ${peineBlock}
        </div>
        <div class="casier-header-right">
          ${photoHtml}
          <div class="photo-legend">— PHOTOGRAPHIE DU MIS EN CAUSE —</div>
        </div>
      </div>
      <div class="doc-sep">══════════════════════════════════════════</div>
      <div class="casier-footer-meta">
        <span>Établi le : ${fmtDate(c.created_at)}</span>
        <span>Par : ${c.created_by || 'N/R'}</span>
        <span>Administration Générale de la Gendarmerie Nationale RP</span>
      </div>
    </div>
    <div class="doc-actions">
      <a href="/casiers" class="btn-sec">◂ RETOUR AU REGISTRE</a>
      <form method="POST" action="/casiers/${c.id}/supprimer" style="display:inline" onsubmit="return confirm('Supprimer définitivement ce casier ?')">
        <button type="submit" class="btn-danger">✕ SUPPRIMER</button>
      </form>
    </div>
  `, u));
});
 
app.post('/casiers/:id/supprimer', requireAuth, (req, res) => {
  Q.deleteCasier.run(parseInt(req.params.id));
  res.redirect('/casiers');
});
 
// ─── FICHIERS S ───────────────────────────────────────────────────────────────
app.get('/fichiers-s', requireAuth, (req, res) => {
  const rows = Q.listFichiersS.all();
  const u    = req.session.user;
 
  const cards = rows.map(f => `
    <div class="fichier-s-card niveau-${f.niveau}">
      <div class="fs-niveau">${niveauLabel(f.niveau)}</div>
      ${f.photo_url ? `<img src="${f.photo_url}" class="fs-photo" onerror="this.style.display='none'">` : ''}
      <div class="fs-body">
        <div class="fs-nom">${f.nom_prenom}</div>
        ${f.age_rp ? `<div class="fs-age">${f.age_rp} ans</div>` : ''}
        <div class="fs-motif"><strong>Motif :</strong> ${f.motif}</div>
        <div class="fs-desc">${f.description}</div>
        <div class="fs-meta">
          <span class="mono small">${fmtDate(f.created_at)}</span>
          <span>Par : ${f.created_by || 'N/R'}</span>
        </div>
        <form method="POST" action="/fichiers-s/${f.id}/clore" class="fs-actions">
          <button type="submit" class="btn-sec small">✔ CLORE LE FICHIER</button>
        </form>
      </div>
    </div>
  `).join('');
 
  res.send(layout('Fichiers [S]', `
    <div class="page-title">
      ══ FICHIERS [S] — PERSONNES SURVEILLÉES ═════════════════════
    </div>
    <div class="toolbar">
      <button class="btn-action" onclick="showModal('modal-fs')">⊞ NOUVEAU FICHIER [S]</button>
    </div>
    <div class="fs-grid">${cards || '<div class="empty">— Aucun fichier [S] actif —</div>'}</div>
 
    <div class="modal" id="modal-fs">
      <div class="modal-box">
        <div class="doc-title">⊞ OUVERTURE D'UN FICHIER [S]</div>
        <div class="doc-sep">──────────────────────────────────────────────</div>
        <form method="POST" action="/fichiers-s" class="doc-form">
          <div class="form-row">
            <div class="form-field"><label>NOM ET PRÉNOM RP :</label><input type="text" name="nom_prenom" required></div>
            <div class="form-field short"><label>ÂGE RP :</label><input type="number" name="age_rp" min="1" max="120"></div>
          </div>
          <div class="form-row">
            <div class="form-field"><label>MOTIF DE SURVEILLANCE :</label><input type="text" name="motif" required></div>
            <div class="form-field short">
              <label>NIVEAU :</label>
              <select name="niveau">
                <option value="S1">S1 — Surveillance</option>
                <option value="S2">S2 — Dangereux</option>
                <option value="S3">S3 — Très dangereux</option>
                <option value="S4">S4 — CRITIQUE</option>
              </select>
            </div>
          </div>
          <div class="form-field full"><label>DESCRIPTION / ÉLÉMENTS CONNUS :</label><textarea name="description" required rows="4"></textarea></div>
          <div class="form-field full"><label>URL PHOTOGRAPHIE :</label><input type="url" name="photo_url" placeholder="https://..."></div>
          <div class="form-actions">
            <button type="button" onclick="hideModal('modal-fs')" class="btn-sec">ANNULER</button>
            <button type="submit" class="btn-action">OUVRIR LE FICHIER</button>
          </div>
        </form>
      </div>
    </div>
  `, u));
});
 
app.post('/fichiers-s', requireAuth, (req, res) => {
  const { nom_prenom, age_rp, motif, niveau, description, photo_url } = req.body;
  const u = req.session.user;
  const by = `${u.grade?.sigle || ''} ${u.nick}`.trim();
  Q.insertFichierS.run(nom_prenom, age_rp ? parseInt(age_rp) : null, motif, niveau, description, photo_url || null, by);
  res.redirect('/fichiers-s');
});
 
app.post('/fichiers-s/:id/clore', requireAuth, (req, res) => {
  Q.closeFichierS.run(parseInt(req.params.id));
  res.redirect('/fichiers-s');
});
 
// ─── MANDATS ──────────────────────────────────────────────────────────────────
app.get('/mandats', requireAuth, (req, res) => {
  const u       = req.session.user;
  const mandats = Q.listMandats.all();
 
  const rows = mandats.map(m => `
    <tr class="${m.statut === 'clôturé' ? 'row-closed' : ''}">
      <td class="mono">#${m.id}</td>
      <td><span class="mandat-type-badge">${mandatLabel(m.type_mandat)}</span></td>
      <td><strong>${m.cible}</strong></td>
      <td class="small">${m.motif.substring(0,60)}${m.motif.length>60?'…':''}</td>
      <td class="mono small">${m.emis_par || 'N/R'}</td>
      <td class="mono small">${fmtDate(m.created_at)}</td>
      <td><span class="statut-badge ${m.statut === 'clôturé' ? 'closed' : 'active'}">${m.statut.toUpperCase()}</span></td>
      <td>${m.statut === 'actif' && u.isParquet ? `<form method="POST" action="/mandats/${m.id}/cloturer" style="display:inline"><button class="btn-sec small" type="submit">CLÔTURER</button></form>` : ''}</td>
    </tr>
  `).join('');
 
  const formHtml = u.isParquet ? `
    <div class="doc-box mt">
      <div class="doc-title">⊞ ÉMETTRE UN MANDAT</div>
      <div class="doc-sep">──────────────────────────────────────────────────────────────</div>
      <form method="POST" action="/mandats" class="doc-form">
        <div class="form-row">
          <div class="form-field">
            <label>TYPE DE MANDAT :</label>
            <select name="type_mandat">
              <option value="arrestation">MANDAT D'ARRESTATION</option>
              <option value="perquisition">MANDAT DE PERQUISITION</option>
              <option value="recherche">MANDAT DE RECHERCHE</option>
              <option value="depot">MANDAT DE DÉPÔT</option>
              <option value="citation">CITATION À COMPARAÎTRE</option>
              <option value="saisie">MANDAT DE SAISIE</option>
            </select>
          </div>
          <div class="form-field"><label>CIBLE (Nom RP) :</label><input type="text" name="cible" required></div>
        </div>
        <div class="form-field full"><label>MOTIF JURIDIQUE :</label><textarea name="motif" required rows="3"></textarea></div>
        <div class="form-field full"><label>DÉTAILS COMPLÉMENTAIRES :</label><textarea name="details" rows="2"></textarea></div>
        <div class="form-actions">
          <button type="submit" class="btn-action">⊞ ÉMETTRE LE MANDAT</button>
        </div>
      </form>
    </div>
  ` : `<div class="alert-info">§ L'émission de mandats est réservée au Ministère Public et à la Magistrature.</div>`;
 
  res.send(layout('Mandats', `
    <div class="page-title">
      ══ MANDATS DE JUSTICE ════════════════════════════════════════
    </div>
    <div class="doc-box">
      <div class="doc-title">§ REGISTRE DES MANDATS — ${mandats.length} ENTRÉE(S)</div>
      <div class="doc-sep">──────────────────────────────────────────────────────────────</div>
      <table class="doc-table">
        <thead><tr><th>N°</th><th>Type</th><th>Cible</th><th>Motif</th><th>Émis par</th><th>Date</th><th>Statut</th><th></th></tr></thead>
        <tbody>${rows || '<tr><td colspan="8" class="empty">— Aucun mandat —</td></tr>'}</tbody>
      </table>
    </div>
    ${formHtml}
  `, u));
});
 
app.post('/mandats', requireAuth, (req, res) => {
  if (!req.session.user.isParquet) return res.redirect('/mandats');
  const { type_mandat, cible, motif, details } = req.body;
  const u  = req.session.user;
  const by = `${u.grade?.sigle || ''} ${u.nick}`.trim();
  Q.insertMandat.run(type_mandat, cible, motif, details || null, by, u.grade?.nom || '');
  res.redirect('/mandats');
});
 
app.post('/mandats/:id/cloturer', requireAuth, (req, res) => {
  if (!req.session.user.isParquet) return res.redirect('/mandats');
  Q.cloturerMandat.run(parseInt(req.params.id));
  res.redirect('/mandats');
});
 
// ─── RAPPORTS DE PATROUILLE ───────────────────────────────────────────────────
app.get('/rapports', requireAuth, (req, res) => {
  const u = req.session.user;
  const rapports = Q.listRapports.all();
 
  const rows = rapports.map(r => `
    <tr>
      <td class="mono">#${r.id}</td>
      <td><strong>${r.titre}</strong></td>
      <td>${r.zone}</td>
      <td>${r.grade_by || 'N/R'} ${r.created_by || ''}</td>
      <td class="mono small">${fmtDate(r.created_at)}</td>
      <td><button class="tbl-link" onclick="showRapport(${r.id})">LIRE ▸</button></td>
    </tr>
  `).join('');
 
  const rapportDetails = rapports.map(r => `
    <div class="rapport-detail" id="rd-${r.id}" style="display:none">
      <div class="doc-title">RAPPORT DE PATROUILLE — N°${r.id}</div>
      <div class="doc-sep">══════════════════════════════════════════</div>
      <div class="dossier-field"><span class="field-label">TITRE</span><span class="field-val">${r.titre}</span></div>
      <div class="dossier-field"><span class="field-label">ZONE</span><span class="field-val">${r.zone}</span></div>
      <div class="dossier-field"><span class="field-label">AGENTS IMPLIQUÉS</span><span class="field-val">${r.agents || 'N/R'}</span></div>
      <div class="dossier-field"><span class="field-label">RÉDIGÉ PAR</span><span class="field-val">${r.grade_by || ''} ${r.created_by || ''}</span></div>
      <div class="dossier-field"><span class="field-label">DATE</span><span class="field-val mono">${fmtDate(r.created_at)}</span></div>
      <div class="doc-sep">──────────────────────────────────────────</div>
      <div class="field-label">COMPTE-RENDU :</div>
      <div class="rapport-contenu">${r.contenu}</div>
      ${r.incidents ? `<div class="doc-sep">──────────────────────────────────────────</div>
      <div class="field-label">INCIDENTS NOTABLES :</div>
      <div class="rapport-contenu">${r.incidents}</div>` : ''}
      <div class="doc-sep">──────────────────────────────────────────</div>
      <button class="btn-sec" onclick="hideRapport(${r.id})">✕ FERMER</button>
    </div>
  `).join('');
 
  res.send(layout('Rapports de patrouille', `
    <div class="page-title">
      ══ RAPPORTS DE PATROUILLE ════════════════════════════════════
    </div>
    <div class="toolbar">
      <button class="btn-action" onclick="showModal('modal-rapport')">⊞ RÉDIGER UN RAPPORT</button>
    </div>
    <div class="doc-box">
      <div class="doc-title">§ REGISTRE DES RAPPORTS — ${rapports.length} ENTRÉE(S)</div>
      <div class="doc-sep">──────────────────────────────────────────────────────────────</div>
      <table class="doc-table">
        <thead><tr><th>N°</th><th>Titre</th><th>Zone</th><th>Rédacteur</th><th>Date</th><th></th></tr></thead>
        <tbody>${rows || '<tr><td colspan="6" class="empty">— Aucun rapport —</td></tr>'}</tbody>
      </table>
    </div>
 
    <div id="rapports-details">${rapportDetails}</div>
 
    <div class="modal" id="modal-rapport">
      <div class="modal-box wide">
        <div class="doc-title">⊞ RÉDACTION D'UN RAPPORT DE PATROUILLE</div>
        <div class="doc-sep">──────────────────────────────────────────────</div>
        <form method="POST" action="/rapports" class="doc-form">
          <div class="form-row">
            <div class="form-field"><label>TITRE DU RAPPORT :</label><input type="text" name="titre" required placeholder="Ex : Patrouille secteur Nord"></div>
            <div class="form-field"><label>ZONE / SECTEUR :</label><input type="text" name="zone" required placeholder="Ex : Quartier Industriel"></div>
          </div>
          <div class="form-field full"><label>AGENTS IMPLIQUÉS :</label><input type="text" name="agents" placeholder="Ex : ADJ MARTIN, GND DUPONT..."></div>
          <div class="form-field full"><label>COMPTE-RENDU DE PATROUILLE :</label><textarea name="contenu" required rows="6" placeholder="Relatez le déroulement de la patrouille..."></textarea></div>
          <div class="form-field full"><label>INCIDENTS NOTABLES (facultatif) :</label><textarea name="incidents" rows="3" placeholder="Précisez les incidents survenus..."></textarea></div>
          <div class="form-actions">
            <button type="button" onclick="hideModal('modal-rapport')" class="btn-sec">ANNULER</button>
            <button type="submit" class="btn-action">⊞ SOUMETTRE LE RAPPORT</button>
          </div>
        </form>
      </div>
    </div>
 
    <script>
      function showRapport(id){document.querySelectorAll('.rapport-detail').forEach(e=>e.style.display='none');document.getElementById('rd-'+id).style.display='block';document.getElementById('rd-'+id).scrollIntoView({behavior:'smooth'});}
      function hideRapport(id){document.getElementById('rd-'+id).style.display='none';}
    </script>
  `, u));
});
 
app.post('/rapports', requireAuth, (req, res) => {
  const { titre, zone, contenu, incidents, agents } = req.body;
  const u  = req.session.user;
  const by = u.nick;
  const grade = u.grade?.sigle || '';
  Q.insertRapport.run(titre, zone, contenu, incidents || null, agents || null, by, grade);
  res.redirect('/rapports');
});
 
// ─── ESPACE G.A. ──────────────────────────────────────────────────────────────
app.get('/espace-ga', requireAuth, (req, res) => {
  const u = req.session.user;
  if (!u.isGA) return res.redirect('/tableau-de-bord');
  const messages = Q.listGA.all();
 
  const rows = messages.map(m => `
    <div class="ga-msg">
      <div class="ga-msg-header">
        <span class="ga-type">[${m.type_msg.toUpperCase()}]</span>
        <span class="ga-objet">${m.objet}</span>
        <span class="mono small">${fmtDate(m.created_at)} — ${m.created_by || 'N/R'}</span>
      </div>
      <div class="ga-contenu">${m.contenu}</div>
    </div>
  `).join('');
 
  res.send(layout('Espace G.A.', `
    <div class="page-title">
      ══ ESPACE GENDARME-ADJOINT (G.A.) ═══════════════════════════
    </div>
    <div class="alert-info">
      § Cet espace est réservé aux <strong>Gendarmes-Adjoints</strong> (GA1 et GA2).<br>
      Vous pouvez y déposer vos questions, signalements et messages à destination de la hiérarchie.
    </div>
    <div class="toolbar">
      <button class="btn-action" onclick="showModal('modal-ga')">⊞ NOUVEAU MESSAGE</button>
    </div>
    <div class="doc-box mt">
      <div class="doc-title">§ MESSAGES — ${messages.length} ENTRÉE(S)</div>
      <div class="doc-sep">──────────────────────────────────────────────────────────────</div>
      ${rows || '<p class="empty">— Aucun message —</p>'}
    </div>
    <div class="modal" id="modal-ga">
      <div class="modal-box">
        <div class="doc-title">⊞ DÉPOSER UN MESSAGE</div>
        <div class="doc-sep">──────────────────────────────────────────────</div>
        <form method="POST" action="/espace-ga" class="doc-form">
          <div class="form-row">
            <div class="form-field">
              <label>TYPE :</label>
              <select name="type_msg">
                <option value="question">QUESTION</option>
                <option value="signalement">SIGNALEMENT</option>
                <option value="demande">DEMANDE</option>
                <option value="message">MESSAGE GÉNÉRAL</option>
              </select>
            </div>
            <div class="form-field"><label>OBJET :</label><input type="text" name="objet" required></div>
          </div>
          <div class="form-field full"><label>CONTENU :</label><textarea name="contenu" required rows="5"></textarea></div>
          <div class="form-actions">
            <button type="button" onclick="hideModal('modal-ga')" class="btn-sec">ANNULER</button>
            <button type="submit" class="btn-action">ENVOYER</button>
          </div>
        </form>
      </div>
    </div>
  `, u));
});
 
app.post('/espace-ga', requireAuth, (req, res) => {
  if (!req.session.user.isGA) return res.redirect('/tableau-de-bord');
  const { type_msg, objet, contenu } = req.body;
  const u  = req.session.user;
  const by = `[${u.grade?.sigle || 'GA'}] ${u.nick}`;
  Q.insertGA.run(type_msg, objet, contenu, by);
  res.redirect('/espace-ga');
});
 
// ─── ORDRES DE SERVICE ────────────────────────────────────────────────────────
app.get('/ordres-service', requireAuth, (req, res) => {
  const u      = req.session.user;
  const ordres = Q.listOrdres.all();
 
  const cards = ordres.map(o => `
    <div class="ordre-card prio-${o.priorite}">
      <div class="ordre-strip">${prioriteLabel(o.priorite)}</div>
      <div class="ordre-body">
        <div class="ordre-titre">${o.titre}</div>
        <div class="ordre-meta">${o.grade_by ? `[${o.grade_by}]` : ''} ${o.created_by || 'N/R'} — ${fmtDate(o.created_at)}</div>
        <div class="ordre-contenu">${o.contenu}</div>
      </div>
    </div>
  `).join('');
 
  const formHtml = u.isOfficier ? `
    <div class="doc-box mt">
      <div class="doc-title">⊞ ÉMETTRE UN ORDRE DE SERVICE</div>
      <div class="doc-sep">──────────────────────────────────────────────────────────────</div>
      <form method="POST" action="/ordres-service" class="doc-form">
        <div class="form-row">
          <div class="form-field"><label>TITRE DE L'ORDRE :</label><input type="text" name="titre" required></div>
          <div class="form-field short">
            <label>PRIORITÉ :</label>
            <select name="priorite">
              <option value="basse">BASSE</option>
              <option value="normale" selected>NORMALE</option>
              <option value="haute">HAUTE</option>
              <option value="urgente">URGENTE</option>
            </select>
          </div>
        </div>
        <div class="form-field full"><label>CONTENU DE L'ORDRE :</label><textarea name="contenu" required rows="5"></textarea></div>
        <div class="form-actions"><button type="submit" class="btn-action">⊞ PUBLIER L'ORDRE</button></div>
      </form>
    </div>
  ` : `<div class="alert-info">§ La publication d'ordres de service est réservée aux Officiers.</div>`;
 
  res.send(layout('Ordres de service', `
    <div class="page-title">
      ══ ORDRES DE SERVICE ════════════════════════════════════════
    </div>
    <div class="ordres-list">${cards || '<div class="empty">— Aucun ordre de service —</div>'}</div>
    ${formHtml}
  `, u));
});
 
app.post('/ordres-service', requireAuth, (req, res) => {
  if (!req.session.user.isOfficier) return res.redirect('/ordres-service');
  const { titre, contenu, priorite } = req.body;
  const u  = req.session.user;
  const by = u.nick;
  const grade = u.grade?.sigle || '';
  Q.insertOrdre.run(titre, contenu, priorite, by, grade);
  res.redirect('/ordres-service');
});
 
// ─── START ────────────────────────────────────────────────────────────────────
app.listen(PORT, () => console.log(`✅ Serveur lancé sur le port ${PORT}`));
 