'use strict';

const express  = require('express');
const session  = require('express-session');
const fetch    = require('node-fetch');
const Database = require('better-sqlite3');
const path     = require('path');

const app  = express();
const PORT = process.env.PORT || 3000;

// ═══════════════════════════════════════════════════════════════════
//  CONFIGURATION
// ═══════════════════════════════════════════════════════════════════
const CFG = {
  CLIENT_ID:      process.env.DISCORD_CLIENT_ID     || '',
  CLIENT_SECRET:  process.env.DISCORD_CLIENT_SECRET || '',
  REDIRECT_URI:   process.env.REDIRECT_URI          || `http://localhost:${PORT}/auth/callback`,
  SESSION_SECRET: process.env.SESSION_SECRET        || 'gend_intranet_secret_v3',
  GUILD_ID:       process.env.GUILD_ID              || '',
  BOT_TOKEN:      process.env.DISCORD_TOKEN         || '',
};

// ═══════════════════════════════════════════════════════════════════
//  RÔLES & GRADES
// ═══════════════════════════════════════════════════════════════════

// Rôle d'accès général
const ROLE_GEND_ID       = '1508283902672896055'; // Gendarmerie Nationale
const ROLE_PREFECTURE_ID = '1513006896389423275'; // Préfecture
const ROLE_IGGN_ID       = '1508184761380638820'; // IGGN

// Catégories de grades avec leurs permissions
// ordre = priorité décroissante (premier trouvé = grade le plus haut)
const GRADES_DEF = [
  // ── Officiers supérieurs ──────────────────────────────
  { id:'1508156668549140571', sigle:'COL', nom:'Colonel',               rang:'OF-5', cat:'off_sup'   },
  { id:'1508156770298892318', sigle:'LCL', nom:'Lieutenant-Colonel',    rang:'OF-4', cat:'off_sup'   },
  { id:'1508156770382774434', sigle:'CEN', nom:"Chef d'Escadron",        rang:'OF-3', cat:'off_sup'   },
  // ── Officiers subalternes ─────────────────────────────
  { id:'1508156773335564438', sigle:'CNE', nom:'Capitaine',             rang:'OF-2', cat:'off_sub'   },
  { id:'1508156773993943050', sigle:'LTN', nom:'Lieutenant',            rang:'OF-1', cat:'off_sub'   },
  { id:'1508156774346129588', sigle:'SLT', nom:'Sous-Lieutenant',       rang:'OF-1', cat:'off_sub'   },
  { id:'1508156774715494510', sigle:'ELO', nom:'Élève-Officier',        rang:'OF(D)',cat:'off_sub'   },
  // ── Sous-officiers supérieurs ─────────────────────────
  { id:'1508156776279707851', sigle:'MAJ', nom:'Major',                 rang:'OR-9', cat:'sof_sup'   },
  { id:'1508156776317452428', sigle:'ADC', nom:'Adjudant-Chef',         rang:'OR-9', cat:'sof_sup'   },
  { id:'1508156777085141072', sigle:'ADJ', nom:'Adjudant',              rang:'OR-8', cat:'sof_sup'   },
  // ── Sous-officiers subalternes ────────────────────────
  { id:'1508159155511361726', sigle:'MDC', nom:'Maréchal-Des-Logis-Chef',rang:'OR-6',cat:'sof_sub'  },
  { id:'1508159156107083907', sigle:'GND', nom:'Gendarme',              rang:'OR-5', cat:'sof_sub'   },
  { id:'1508159157679689828', sigle:'ELG', nom:'Élève-Gendarme',        rang:'OR-4', cat:'sof_sub'   },
  // ── Militaires du rang ────────────────────────────────
  { id:'1508159156966658059', sigle:'MDL', nom:'Maréchal-Des-Logis',    rang:'OR-5', cat:'rang'      },
  { id:'1508159158891970671', sigle:'BRC', nom:'Brigadier-Chef',        rang:'OR-4', cat:'rang'      },
  { id:'1508159159328182434', sigle:'BRI', nom:'Brigadier',             rang:'OR-3', cat:'rang'      },
  { id:'1508161154692677803', sigle:'GA1', nom:'Gendarme-Adjoint 1ʳᵉ Cl.',rang:'OR-2',cat:'rang'   },
  { id:'1508161155263365212', sigle:'GA2', nom:'Gendarme-Adjoint 2ᵉ Cl.',rang:'OR-1', cat:'rang'   },
  // ── Réserve ───────────────────────────────────────────
  { id:'1508168770684850478', sigle:'RSVT',nom:'Réserviste',            rang:'RSV',  cat:'reserve'   },
  // ── Ministère Public ──────────────────────────────────
  { id:'1512922507487875072', sigle:'PG',  nom:'Procureur Général',     rang:'MP',   cat:'parquet'   },
  { id:'1512922090297233549', sigle:'PR',  nom:'Procureur de la République',rang:'MP',cat:'parquet'  },
  { id:'1512922420254605322', sigle:'PA',  nom:'Procureur Adjoint',     rang:'MP',   cat:'parquet'   },
  // ── Magistrature ──────────────────────────────────────
  { id:'1512923423800692736', sigle:'PT',  nom:'Président du Tribunal', rang:'MAG',  cat:'magistrat' },
  { id:'1512922694495244318', sigle:'JI',  nom:"Juge d'Instruction",    rang:'MAG',  cat:'magistrat' },
  { id:'1512922835348095148', sigle:'JLD', nom:'Juge des Libertés et de la Détention',rang:'MAG',cat:'magistrat'},
  { id:'1512922637225955378', sigle:'JAP', nom:"Juge d'Application des Peines",rang:'MAG',cat:'magistrat'},
  // ── Auxiliaires de justice ────────────────────────────
  { id:'1512923786129965077', sigle:'AG',  nom:'Avocat Général',        rang:'AUX',  cat:'auxiliaire'},
  { id:'1512923784850706532', sigle:'ACO', nom:"Avocat Commis d'Office",rang:'AUX',  cat:'auxiliaire'},
  // ── Représentant ──────────────────────────────────────
  { id:'1512953207238955191', sigle:'RS',  nom:'Représentant Serveur',  rang:'REP',  cat:'representant'},
];

const GRADES_MAP = Object.fromEntries(GRADES_DEF.map(g => [g.id, g]));

// ── Règles de permissions ──────────────────────────────────────────
// Catégories GENDARMERIE (rôle GEND requis)
const CAT_GEND     = ['off_sup','off_sub','sof_sup','sof_sub','rang','reserve'];
// Catégories JUDICIAIRE (rôle PREFECTURE ou GEND)
const CAT_JUDIC    = ['parquet','magistrat','auxiliaire','representant'];
// Peuvent émettre des mandats
const CAT_MANDAT   = ['parquet','magistrat'];
// Peuvent créer des casiers (gendarmes seulement — pas réserve, pas rang bas)
const CAT_CASIER   = ['off_sup','off_sub','sof_sup','sof_sub'];
// Peuvent rédiger des rapports (SOF subalternes et au-dessus)
const CAT_RAPPORT  = ['off_sup','off_sub','sof_sup','sof_sub'];
// Peuvent publier ordres de service
const CAT_ORDRES   = ['off_sup','off_sub'];
// Espace GA
const IDS_GA       = ['1508161154692677803','1508161155263365212'];

function getGrade(roles) {
  for (const g of GRADES_DEF) {
    if (roles.includes(g.id)) return g;
  }
  return null;
}
function hasCat(roles, cats) {
  return roles.some(r => GRADES_MAP[r] && cats.includes(GRADES_MAP[r].cat));
}
function isIGGN(roles)     { return roles.includes(ROLE_IGGN_ID); }
function isGA(roles)       { return roles.some(r => IDS_GA.includes(r)); }
function canMandat(roles)  { return hasCat(roles, CAT_MANDAT); }
function canCasier(roles)  { return hasCat(roles, CAT_CASIER); }
function canRapport(roles) { return hasCat(roles, CAT_RAPPORT); }
function canOrdres(roles)  { return hasCat(roles, CAT_ORDRES); }

// ═══════════════════════════════════════════════════════════════════
//  BASE DE DONNÉES
// ═══════════════════════════════════════════════════════════════════
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
  CREATE TABLE IF NOT EXISTS iggn_dossiers (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    type_saisine TEXT NOT NULL,
    cible       TEXT NOT NULL,
    grade_cible TEXT,
    faits       TEXT NOT NULL,
    details     TEXT,
    created_by  TEXT,
    statut      TEXT NOT NULL DEFAULT 'ouvert',
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
  listCasiers:    db.prepare(`SELECT * FROM casiers ORDER BY created_at DESC LIMIT 50`),
  getCasier:      db.prepare(`SELECT * FROM casiers WHERE id=?`),
  searchCasier:   db.prepare(`SELECT * FROM casiers WHERE nom_prenom LIKE ? ORDER BY created_at DESC`),
  insertCasier:   db.prepare(`INSERT INTO casiers (nom_prenom,age_rp,faits,type_peine,amende,amende_payee,duree_gav,duree_prison,photo_url,created_by) VALUES (?,?,?,?,?,?,?,?,?,?)`),
  deleteCasier:   db.prepare(`DELETE FROM casiers WHERE id=?`),

  listFS:         db.prepare(`SELECT * FROM fichiers_s WHERE actif=1 ORDER BY niveau ASC,created_at DESC`),
  insertFS:       db.prepare(`INSERT INTO fichiers_s (nom_prenom,age_rp,motif,niveau,description,photo_url,created_by) VALUES (?,?,?,?,?,?,?)`),
  closeFS:        db.prepare(`UPDATE fichiers_s SET actif=0 WHERE id=?`),

  listMandats:    db.prepare(`SELECT * FROM mandats ORDER BY created_at DESC LIMIT 60`),
  insertMandat:   db.prepare(`INSERT INTO mandats (type_mandat,cible,motif,details,emis_par,grade_emis) VALUES (?,?,?,?,?,?)`),
  cloturerMandat: db.prepare(`UPDATE mandats SET statut='clôturé' WHERE id=?`),

  listRapports:   db.prepare(`SELECT * FROM rapports_patrouille ORDER BY created_at DESC LIMIT 40`),
  insertRapport:  db.prepare(`INSERT INTO rapports_patrouille (titre,zone,contenu,incidents,agents,created_by,grade_by) VALUES (?,?,?,?,?,?,?)`),

  listGA:         db.prepare(`SELECT * FROM espace_ga ORDER BY created_at DESC LIMIT 50`),
  insertGA:       db.prepare(`INSERT INTO espace_ga (type_msg,objet,contenu,created_by) VALUES (?,?,?,?)`),

  listIGGN:       db.prepare(`SELECT * FROM iggn_dossiers ORDER BY created_at DESC LIMIT 40`),
  insertIGGN:     db.prepare(`INSERT INTO iggn_dossiers (type_saisine,cible,grade_cible,faits,details,created_by) VALUES (?,?,?,?,?,?)`),
  cloturerIGGN:   db.prepare(`UPDATE iggn_dossiers SET statut='clôturé' WHERE id=?`),

  listOrdres:     db.prepare(`SELECT * FROM ordres_service ORDER BY created_at DESC LIMIT 20`),
  insertOrdre:    db.prepare(`INSERT INTO ordres_service (titre,contenu,priorite,created_by,grade_by) VALUES (?,?,?,?,?)`),
};

// ═══════════════════════════════════════════════════════════════════
//  MIDDLEWARE
// ═══════════════════════════════════════════════════════════════════
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

// ─── GUARD ───────────────────────────────────────────────────────
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

    const hasGend   = roles.includes(ROLE_GEND_ID);
    const hasPref   = roles.includes(ROLE_PREFECTURE_ID);
    const hasIGGN   = roles.includes(ROLE_IGGN_ID);

    if (!hasGend && !hasPref && !hasIGGN) return res.redirect('/acces-refuse');

    const grade = getGrade(roles);
    req.session.user.nick        = member.nick || member.user?.global_name || req.session.user.username;
    req.session.user.roles       = roles;
    req.session.user.grade       = grade;
    req.session.user.hasGend     = hasGend;
    req.session.user.hasPref     = hasPref;
    req.session.user.isIGGN      = hasIGGN;
    req.session.user.canMandat   = canMandat(roles);
    req.session.user.canCasier   = canCasier(roles);
    req.session.user.canRapport  = canRapport(roles);
    req.session.user.canOrdres   = canOrdres(roles);
    req.session.user.isGA        = isGA(roles);
    next();
  } catch (e) {
    console.error('Auth error:', e.message);
    res.redirect('/?err=check');
  }
}

function guardPerm(permKey) {
  return (req, res, next) => {
    if (!req.session.user) return res.redirect('/');
    if (!req.session.user[permKey]) return res.redirect('/acces-refuse');
    next();
  };
}

// ═══════════════════════════════════════════════════════════════════
//  UTILITAIRES
// ═══════════════════════════════════════════════════════════════════
function nowFR() {
  return new Date().toLocaleString('fr-FR', { timeZone:'Europe/Paris', day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' });
}
function fmtDate(str) {
  if (!str) return '—';
  return new Date(str.includes('T') ? str : str+'Z')
    .toLocaleString('fr-FR', { timeZone:'Europe/Paris', day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' });
}
function byStr(u) {
  return `${u.grade?.sigle || ''} ${u.nick}`.trim();
}
function peineLabel(c) {
  if (c.type_peine==='amende')  return `<span class="pill pill-or">Amende — ${c.amende||'N/R'}</span>`;
  if (c.type_peine==='gav')     return `<span class="pill pill-bl">G.A.V. — ${c.duree_gav||'N/R'}</span>`;
  if (c.type_peine==='prison')  return `<span class="pill pill-rd">Prison — ${c.duree_prison||'N/R'}</span>`;
  return c.type_peine;
}
function niveauMeta(n) {
  return { S1:{lbl:'S1 — Surveillance',cls:'s1'}, S2:{lbl:'S2 — Dangereux',cls:'s2'}, S3:{lbl:'S3 — Très dangereux',cls:'s3'}, S4:{lbl:'S4 — CRITIQUE',cls:'s4'} }[n] || {lbl:n,cls:'s1'};
}
function prioMeta(p) {
  return { basse:{lbl:'Basse',cls:'p-low'}, normale:{lbl:'Normale',cls:'p-nor'}, haute:{lbl:'Haute',cls:'p-hi'}, urgente:{lbl:'Urgente',cls:'p-urg'} }[p] || {lbl:p,cls:'p-nor'};
}

// ═══════════════════════════════════════════════════════════════════
//  LAYOUT
// ═══════════════════════════════════════════════════════════════════
function layout(title, body, u) {
  const grade = u?.grade;
  const nick  = u?.nick || u?.username || '—';
  const av    = u ? `https://cdn.discordapp.com/avatars/${u.id}/${u.avatar}.png?size=64` : '';

  const navGend = u?.hasGend ? `
      <div class="nav-section">Gendarmerie</div>
      <a href="/casiers"        class="nav-link">Casiers judiciaires</a>
      <a href="/fichiers-s"     class="nav-link">Fichiers [S]</a>
      <a href="/rapports"       class="nav-link">Rapports de patrouille</a>
      <a href="/ordres-service" class="nav-link">Ordres de service</a>
      ${u?.isGA ? `<a href="/espace-ga" class="nav-link">Espace G.A.</a>` : ''}
  ` : '';

  const navJudic = `
      <div class="nav-section">Justice</div>
      <a href="/mandats" class="nav-link">Mandats</a>
  `;

  const navIGGN = u?.isIGGN ? `
      <div class="nav-section">I.G.G.N.</div>
      <a href="/iggn" class="nav-link">Dossiers disciplinaires</a>
  ` : '';

  const sidebar = u ? `
  <aside class="sidebar">
    <div class="sb-brand">
      <div class="sb-brand-title">GENDARMERIE<br>NATIONALE</div>
      <div class="sb-brand-sub">Intranet — Usage interne</div>
    </div>
    <div class="sb-agent">
      <img src="${av}" class="sb-avatar" onerror="this.style.opacity=0" alt="">
      <div>
        <div class="sb-name">${nick}</div>
        <div class="sb-grade">${grade ? `[${grade.rang}] ${grade.sigle} — ${grade.nom}` : 'Habilité'}</div>
        ${u.isIGGN ? `<div class="sb-iggn-badge">I.G.G.N.</div>` : ''}
      </div>
    </div>
    <nav class="sb-nav">
      <a href="/tableau-de-bord" class="nav-link">Tableau de bord</a>
      ${navGend}
      ${navJudic}
      ${navIGGN}
    </nav>
    <div class="sb-footer">
      <a href="/logout" class="nav-link nav-logout">Déconnexion</a>
      <div class="sb-note">Les unités spéciales ne sont pas reconnues sur ce système.</div>
    </div>
  </aside>
  ` : '';

  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1.0">
  <title>${title} — Intranet GN</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Libre+Baskerville:ital,wght@0,400;0,700;1,400&family=Source+Code+Pro:wght@400;600&family=Lato:wght@300;400;700&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="/css/style.css">
</head>
<body>
  ${sidebar}
  <main class="main${u ? '' : ' main--login'}">
    ${body}
  </main>
  <script src="/js/app.js"></script>
</body>
</html>`;
}

// ═══════════════════════════════════════════════════════════════════
//  ROUTES PUBLIQUES
// ═══════════════════════════════════════════════════════════════════
app.get('/', (req, res) => {
  if (req.session.user) return res.redirect('/tableau-de-bord');
  res.send(`<!DOCTYPE html>
<html lang="fr"><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>Accès — Intranet GN</title>
<link href="https://fonts.googleapis.com/css2?family=Libre+Baskerville:ital,wght@0,400;0,700;1,400&family=Source+Code+Pro:wght@400;600&family=Lato:wght@300;400;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/css/style.css">
</head><body class="body--login">
<div class="login-wrap">
  <div class="login-card">
    <div class="login-seal">✦</div>
    <h1 class="login-title">Ministère de l'Intérieur</h1>
    <h2 class="login-subtitle">Gendarmerie Nationale</h2>
    <p class="login-ref">Réf. GN/SI/INTRA — v3 — Accès restreint</p>
    <div class="login-rule"></div>
    <p class="login-text">
      Ce système est réservé au personnel habilité.<br>
      L'accès est conditionné à la détention d'un rôle autorisé sur le serveur.<br>
      Toute tentative d'accès non autorisé est consignée.
    </p>
    <a href="/auth/discord" class="btn-login">S'authentifier via Discord</a>
    ${req.query.err ? `<p class="login-err">Erreur : ${req.query.err}</p>` : ''}
    <p class="login-footnote">
      Sont admis : Gendarmerie Nationale · Préfecture (mandats uniquement) · I.G.G.N.<br>
      <em>Les unités spéciales ne sont pas reconnues sur ce système.</em>
    </p>
  </div>
</div>
</body></html>`);
});

app.get('/acces-refuse', (req, res) => {
  res.status(403).send(layout('Accès refusé', `
    <div class="page-err">
      <div class="err-code">403</div>
      <h2 class="err-title">Accès non autorisé</h2>
      <p>Votre compte ne dispose pas d'un rôle permettant l'accès à cet intranet.</p>
      <a href="/logout" class="btn">Déconnexion</a>
    </div>
  `, null));
});

app.get('/auth/discord', (req, res) => {
  const p = new URLSearchParams({ client_id:CFG.CLIENT_ID, redirect_uri:CFG.REDIRECT_URI, response_type:'code', scope:'identify' });
  res.redirect(`https://discord.com/api/oauth2/authorize?${p}`);
});

app.get('/auth/callback', async (req, res) => {
  if (!req.query.code) return res.redirect('/?err=no_code');
  try {
    const tr = await fetch('https://discord.com/api/oauth2/token', {
      method:'POST',
      headers:{'Content-Type':'application/x-www-form-urlencoded'},
      body: new URLSearchParams({ client_id:CFG.CLIENT_ID, client_secret:CFG.CLIENT_SECRET, grant_type:'authorization_code', code:req.query.code, redirect_uri:CFG.REDIRECT_URI }),
    });
    const tk = await tr.json();
    if (!tk.access_token) return res.redirect('/?err=token');
    const ur = await fetch('https://discord.com/api/v10/users/@me', { headers:{Authorization:`Bearer ${tk.access_token}`} });
    const du = await ur.json();
    req.session.user = { id:du.id, username:du.username, global_name:du.global_name, avatar:du.avatar, nick:du.global_name||du.username };
    res.redirect('/tableau-de-bord');
  } catch (e) { res.redirect('/?err=oauth'); }
});

app.get('/logout', (req, res) => { req.session.destroy(); res.redirect('/'); });

// ═══════════════════════════════════════════════════════════════════
//  TABLEAU DE BORD
// ═══════════════════════════════════════════════════════════════════
app.get('/tableau-de-bord', requireAuth, (req, res) => {
  const u = req.session.user;
  const stats = {
    casiers:   db.prepare(`SELECT COUNT(*) as n FROM casiers`).get().n,
    fichiers:  db.prepare(`SELECT COUNT(*) as n FROM fichiers_s WHERE actif=1`).get().n,
    mandats:   db.prepare(`SELECT COUNT(*) as n FROM mandats WHERE statut='actif'`).get().n,
    rapports:  db.prepare(`SELECT COUNT(*) as n FROM rapports_patrouille`).get().n,
  };
  const recentCasiers = db.prepare(`SELECT * FROM casiers ORDER BY created_at DESC LIMIT 5`).all();
  const mandatsActifs = db.prepare(`SELECT * FROM mandats WHERE statut='actif' ORDER BY created_at DESC LIMIT 4`).all();

  const catLabel = {
    off_sup:'Officier Supérieur', off_sub:'Officier Subalterne',
    sof_sup:'Sous-Officier Supérieur', sof_sub:'Sous-Officier Subalterne',
    rang:'Militaire du Rang', reserve:'Réserviste',
    parquet:'Ministère Public', magistrat:'Magistrature',
    auxiliaire:'Auxiliaire de Justice', representant:'Représentant Serveur',
  };

  const permList = [
    u.canCasier  ? 'Création de casiers judiciaires' : null,
    u.canRapport ? 'Rédaction de rapports de patrouille' : null,
    u.canMandat  ? 'Émission de mandats de justice' : null,
    u.canOrdres  ? "Publication d'ordres de service" : null,
    u.isGA       ? 'Accès espace Gendarme-Adjoint' : null,
    u.isIGGN     ? 'Accès espace I.G.G.N.' : null,
  ].filter(Boolean);

  const casierRows = recentCasiers.map(c => `
    <tr>
      <td class="mono">${c.id}</td>
      <td>${c.nom_prenom}</td>
      <td>${c.age_rp} ans</td>
      <td>${peineLabel(c)}</td>
      <td class="mono dim">${fmtDate(c.created_at)}</td>
      <td><a href="/casiers/${c.id}" class="link-action">Consulter</a></td>
    </tr>`).join('');

  const mandatCards = mandatsActifs.map(m => `
    <div class="info-row">
      <span class="info-type">${m.type_mandat.toUpperCase()}</span>
      <span class="info-cible">${m.cible}</span>
      <span class="mono dim small">${fmtDate(m.created_at)}</span>
    </div>`).join('') || '<p class="empty-note">Aucun mandat en cours.</p>';

  res.send(layout('Tableau de bord', `
    <header class="page-header">
      <h1>Tableau de bord</h1>
      <span class="page-date">${nowFR()}</span>
    </header>

    <div class="grid-cols-2 mb-lg">
      <div class="card">
        <h3 class="card-title">Fiche de service</h3>
        <dl class="dl">
          <dt>Pseudo serveur</dt><dd>${u.nick}</dd>
          <dt>Grade</dt><dd>${u.grade ? `[${u.grade.rang}] ${u.grade.sigle} — ${u.grade.nom}` : '—'}</dd>
          <dt>Catégorie</dt><dd>${u.grade ? (catLabel[u.grade.cat] || u.grade.cat) : '—'}</dd>
          ${u.isIGGN ? `<dt>Habilitation</dt><dd class="badge-iggn">I.G.G.N.</dd>` : ''}
        </dl>
        ${permList.length ? `
          <div class="perm-title">Habilitations actives</div>
          <ul class="perm-list">${permList.map(p=>`<li>${p}</li>`).join('')}</ul>
        ` : ''}
      </div>
      <div class="stats-card">
        <div class="stat-item">
          <span class="stat-n">${stats.casiers}</span>
          <span class="stat-l">Casiers enregistrés</span>
        </div>
        <div class="stat-sep"></div>
        <div class="stat-item">
          <span class="stat-n stat-warn">${stats.fichiers}</span>
          <span class="stat-l">Fichiers [S] actifs</span>
        </div>
        <div class="stat-sep"></div>
        <div class="stat-item">
          <span class="stat-n">${stats.mandats}</span>
          <span class="stat-l">Mandats en vigueur</span>
        </div>
        <div class="stat-sep"></div>
        <div class="stat-item">
          <span class="stat-n">${stats.rapports}</span>
          <span class="stat-l">Rapports de patrouille</span>
        </div>
      </div>
    </div>

    <div class="card mb-lg">
      <div class="card-head">
        <h3 class="card-title">Derniers casiers enregistrés</h3>
        <a href="/casiers" class="link-action">Voir tout</a>
      </div>
      <table class="tbl">
        <thead><tr><th>N°</th><th>Identité</th><th>Âge</th><th>Peine</th><th>Date</th><th></th></tr></thead>
        <tbody>${casierRows || '<tr><td colspan="6" class="empty-note">Aucun casier.</td></tr>'}</tbody>
      </table>
    </div>

    <div class="card">
      <h3 class="card-title">Mandats actifs</h3>
      ${mandatCards}
    </div>
  `, u));
});

// ═══════════════════════════════════════════════════════════════════
//  CASIERS
// ═══════════════════════════════════════════════════════════════════
app.get('/casiers', requireAuth, (req, res) => {
  const u = req.session.user;
  const q = req.query.q || '';
  const rows = q ? Q.searchCasier.all(`%${q}%`) : Q.listCasiers.all();

  const tbody = rows.map(c => `
    <tr>
      <td class="mono">${c.id}</td>
      <td><strong>${c.nom_prenom}</strong></td>
      <td>${c.age_rp} ans</td>
      <td class="dim truncate">${c.faits.substring(0,55)}${c.faits.length>55?'…':''}</td>
      <td>${peineLabel(c)}</td>
      <td class="mono dim small">${fmtDate(c.created_at)}</td>
      <td><a href="/casiers/${c.id}" class="link-action">Consulter</a></td>
    </tr>`).join('');

  res.send(layout('Casiers judiciaires', `
    <header class="page-header">
      <h1>Casiers judiciaires <span class="page-count">${rows.length}</span></h1>
      ${u.canCasier ? `<a href="/casiers/nouveau" class="btn">Nouveau casier</a>` : ''}
    </header>
    <div class="card mb-lg">
      <form method="GET" class="search-row">
        <input type="text" name="q" value="${q}" placeholder="Rechercher par nom ou prénom…" class="input">
        <button type="submit" class="btn">Chercher</button>
        ${q ? `<a href="/casiers" class="btn btn--ghost">Effacer</a>` : ''}
      </form>
    </div>
    <div class="card">
      <table class="tbl">
        <thead><tr><th>N°</th><th>Identité</th><th>Âge</th><th>Faits</th><th>Peine</th><th>Date</th><th></th></tr></thead>
        <tbody>${tbody || '<tr><td colspan="7" class="empty-note">Aucun casier trouvé.</td></tr>'}</tbody>
      </table>
    </div>
  `, u));
});

app.get('/casiers/nouveau', requireAuth, guardPerm('canCasier'), (req, res) => {
  res.send(layout('Nouveau casier', `
    <header class="page-header"><h1>Nouveau casier judiciaire — B3</h1></header>
    <div class="card">
      <form method="POST" action="/casiers" class="form-stack">
        <div class="form-row-2">
          <div class="field">
            <label>Nom et prénom RP</label>
            <input type="text" name="nom_prenom" required placeholder="DUPONT Jean">
          </div>
          <div class="field field--sm">
            <label>Âge RP</label>
            <input type="number" name="age_rp" required min="1" max="120">
          </div>
        </div>
        <div class="field">
          <label>Faits reprochés</label>
          <textarea name="faits" required rows="5" placeholder="Décrivez les infractions commises…"></textarea>
        </div>
        <div class="field field--sm">
          <label>Type de peine</label>
          <select name="type_peine" onchange="switchPeine(this.value)">
            <option value="amende">Amende</option>
            <option value="gav">Garde à vue (G.A.V.)</option>
            <option value="prison">Emprisonnement</option>
          </select>
        </div>
        <div id="f-amende" class="form-row-2 peine-bloc">
          <div class="field"><label>Montant de l'amende</label><input type="text" name="amende" placeholder="Ex : 5 000 €"></div>
          <div class="field field--sm"><label>Amende acquittée</label>
            <select name="amende_payee"><option value="0">Non — impayée</option><option value="1">Oui — acquittée</option></select>
          </div>
        </div>
        <div id="f-gav" class="peine-bloc" style="display:none">
          <div class="field"><label>Durée de la G.A.V.</label><input type="text" name="duree_gav" placeholder="Ex : 24h, 48h"></div>
        </div>
        <div id="f-prison" class="peine-bloc" style="display:none">
          <div class="field"><label>Durée d'emprisonnement</label><input type="text" name="duree_prison" placeholder="Ex : 6 mois, 2 ans"></div>
        </div>
        <div class="field">
          <label>URL photographie (fond blanc)</label>
          <input type="url" name="photo_url" placeholder="https://…">
        </div>
        <div class="form-actions">
          <a href="/casiers" class="btn btn--ghost">Annuler</a>
          <button type="submit" class="btn btn--primary">Enregistrer le casier</button>
        </div>
      </form>
    </div>
    <script>
      function switchPeine(v){
        document.querySelectorAll('.peine-bloc').forEach(e=>e.style.display='none');
        document.getElementById('f-'+v).style.display='flex';
      }
    </script>
  `, req.session.user));
});

app.post('/casiers', requireAuth, guardPerm('canCasier'), (req, res) => {
  const {nom_prenom,age_rp,faits,type_peine,amende,amende_payee,duree_gav,duree_prison,photo_url} = req.body;
  if (!nom_prenom||!age_rp||!faits||!type_peine) return res.redirect('/casiers/nouveau');
  const r = Q.insertCasier.run(nom_prenom,parseInt(age_rp),faits,type_peine,amende||null,parseInt(amende_payee)||0,duree_gav||null,duree_prison||null,photo_url||null,byStr(req.session.user));
  res.redirect(`/casiers/${r.lastInsertRowid}?ok=1`);
});

app.get('/casiers/:id', requireAuth, (req, res) => {
  const c = Q.getCasier.get(parseInt(req.params.id));
  if (!c) return res.redirect('/casiers');
  const u = req.session.user;

  let peineSection = '';
  if (c.type_peine==='amende') peineSection = `
    <dt>Type de peine</dt><dd>Amende pécuniaire</dd>
    <dt>Montant</dt><dd>${c.amende||'Non renseigné'}</dd>
    <dt>Statut</dt><dd class="${c.amende_payee?'txt-ok':'txt-warn'}">${c.amende_payee?'Acquittée':'Non acquittée'}</dd>`;
  else if (c.type_peine==='gav') peineSection = `
    <dt>Type de peine</dt><dd>Garde à vue (G.A.V.)</dd>
    <dt>Durée</dt><dd>${c.duree_gav||'Non renseignée'}</dd>`;
  else if (c.type_peine==='prison') peineSection = `
    <dt>Type de peine</dt><dd>Emprisonnement</dd>
    <dt>Durée</dt><dd>${c.duree_prison||'Non renseignée'}</dd>`;

  const photoBlock = c.photo_url
    ? `<img src="${c.photo_url}" class="suspect-photo" alt="Photo mis en cause" onerror="this.outerHTML='<div class=photo-placeholder>Photo indisponible</div>'">`
    : `<div class="photo-placeholder">Aucune photographie</div>`;

  res.send(layout(`Casier #${c.id}`, `
    <header class="page-header">
      <h1>Casier judiciaire <span class="mono dim">#${c.id}</span></h1>
      <div class="header-actions">
        <a href="/casiers" class="btn btn--ghost">← Retour</a>
        ${u.canCasier ? `<form method="POST" action="/casiers/${c.id}/supprimer" style="display:inline" onsubmit="return confirm('Supprimer définitivement ce casier ?')"><button class="btn btn--danger">Supprimer</button></form>` : ''}
      </div>
    </header>

    <div class="casier-sheet card">
      <div class="casier-layout">
        <div class="casier-main">
          <div class="doc-stamp">EXTRAIT DE CASIER JUDICIAIRE — B3</div>
          <dl class="dl dl--wide">
            <dt>Identité</dt><dd class="txt-strong">${c.nom_prenom}</dd>
            <dt>Âge RP</dt><dd>${c.age_rp} ans</dd>
          </dl>
          <div class="section-label">Faits reprochés</div>
          <div class="faits-block">${c.faits}</div>
          <div class="section-label mt-md">Peine prononcée</div>
          <dl class="dl">${peineSection}</dl>
        </div>
        <div class="casier-aside">
          ${photoBlock}
          <p class="photo-caption">Photographie du mis en cause</p>
        </div>
      </div>
      <div class="casier-foot">
        <span>Établi le ${fmtDate(c.created_at)}</span>
        <span>Par : ${c.created_by||'—'}</span>
        <span>Administration Générale de la Gendarmerie Nationale</span>
      </div>
    </div>
    ${req.query.ok ? `<div class="toast" id="toast">Casier enregistré.<script>setTimeout(()=>document.getElementById('toast').remove(),3000)<\/script></div>` : ''}
  `, u));
});

app.post('/casiers/:id/supprimer', requireAuth, guardPerm('canCasier'), (req, res) => {
  Q.deleteCasier.run(parseInt(req.params.id)); res.redirect('/casiers');
});

// ═══════════════════════════════════════════════════════════════════
//  FICHIERS S
// ═══════════════════════════════════════════════════════════════════
app.get('/fichiers-s', requireAuth, (req, res) => {
  const u    = req.session.user;
  const rows = Q.listFS.all();
  const cards = rows.map(f => {
    const nm = niveauMeta(f.niveau);
    return `<div class="fs-card fs-${nm.cls}">
      <div class="fs-niveau">${nm.lbl}</div>
      ${f.photo_url ? `<img src="${f.photo_url}" class="fs-img" onerror="this.style.display='none'" alt="">` : ''}
      <div class="fs-body">
        <div class="fs-nom">${f.nom_prenom}</div>
        ${f.age_rp ? `<div class="fs-age">${f.age_rp} ans</div>` : ''}
        <div class="fs-motif">${f.motif}</div>
        <div class="fs-desc">${f.description}</div>
        <div class="fs-meta">
          <span class="mono small dim">${fmtDate(f.created_at)} — ${f.created_by||'—'}</span>
          <form method="POST" action="/fichiers-s/${f.id}/clore">
            <button class="btn btn--sm btn--ghost">Clore le fichier</button>
          </form>
        </div>
      </div>
    </div>`;
  }).join('');

  res.send(layout('Fichiers [S]', `
    <header class="page-header">
      <h1>Fichiers [S] <span class="page-count">${rows.length}</span></h1>
      <button class="btn" onclick="openModal('modal-fs')">Ouvrir un fichier</button>
    </header>
    <div class="fs-grid">${cards || '<p class="empty-note">Aucun fichier [S] actif.</p>'}</div>

    <div class="modal" id="modal-fs" hidden>
      <div class="modal-panel">
        <div class="modal-head">
          <h2>Ouverture d'un fichier [S]</h2>
          <button class="modal-close" onclick="closeModal('modal-fs')" aria-label="Fermer">×</button>
        </div>
        <form method="POST" action="/fichiers-s" class="form-stack">
          <div class="form-row-2">
            <div class="field"><label>Nom et prénom RP</label><input type="text" name="nom_prenom" required></div>
            <div class="field field--sm"><label>Âge RP</label><input type="number" name="age_rp" min="1" max="120"></div>
          </div>
          <div class="form-row-2">
            <div class="field"><label>Motif de surveillance</label><input type="text" name="motif" required></div>
            <div class="field field--sm"><label>Niveau</label>
              <select name="niveau">
                <option value="S1">S1 — Surveillance</option>
                <option value="S2">S2 — Dangereux</option>
                <option value="S3">S3 — Très dangereux</option>
                <option value="S4">S4 — Critique</option>
              </select>
            </div>
          </div>
          <div class="field"><label>Description et éléments connus</label><textarea name="description" required rows="4"></textarea></div>
          <div class="field"><label>URL photographie</label><input type="url" name="photo_url" placeholder="https://…"></div>
          <div class="form-actions">
            <button type="button" onclick="closeModal('modal-fs')" class="btn btn--ghost">Annuler</button>
            <button type="submit" class="btn btn--primary">Ouvrir le fichier</button>
          </div>
        </form>
      </div>
    </div>
  `, u));
});

app.post('/fichiers-s', requireAuth, (req, res) => {
  const {nom_prenom,age_rp,motif,niveau,description,photo_url} = req.body;
  Q.insertFS.run(nom_prenom,age_rp?parseInt(age_rp):null,motif,niveau,description,photo_url||null,byStr(req.session.user));
  res.redirect('/fichiers-s');
});
app.post('/fichiers-s/:id/clore', requireAuth, (req, res) => { Q.closeFS.run(parseInt(req.params.id)); res.redirect('/fichiers-s'); });

// ═══════════════════════════════════════════════════════════════════
//  MANDATS
// ═══════════════════════════════════════════════════════════════════
app.get('/mandats', requireAuth, (req, res) => {
  const u       = req.session.user;
  const mandats = Q.listMandats.all();
  const TYPES = { arrestation:"Mandat d'arrestation", perquisition:"Mandat de perquisition", recherche:"Mandat de recherche", depot:"Mandat de dépôt", citation:"Citation à comparaître", saisie:"Mandat de saisie" };

  const tbody = mandats.map(m => `
    <tr class="${m.statut==='clôturé'?'row--closed':''}">
      <td class="mono">${m.id}</td>
      <td>${TYPES[m.type_mandat]||m.type_mandat}</td>
      <td><strong>${m.cible}</strong></td>
      <td class="dim truncate">${m.motif.substring(0,55)}${m.motif.length>55?'…':''}</td>
      <td class="dim small">${m.emis_par||'—'}</td>
      <td class="mono dim small">${fmtDate(m.created_at)}</td>
      <td><span class="pill ${m.statut==='actif'?'pill-ok':'pill-dim'}">${m.statut}</span></td>
      <td>${m.statut==='actif'&&u.canMandat?`<form method="POST" action="/mandats/${m.id}/cloturer" style="display:inline"><button class="btn btn--sm btn--ghost">Clôturer</button></form>`:''}</td>
    </tr>`).join('');

  const form = u.canMandat ? `
    <div class="card mt-lg">
      <h3 class="card-title">Émettre un mandat</h3>
      <form method="POST" action="/mandats" class="form-stack">
        <div class="form-row-2">
          <div class="field"><label>Type de mandat</label>
            <select name="type_mandat">
              ${Object.entries(TYPES).map(([v,l])=>`<option value="${v}">${l}</option>`).join('')}
            </select>
          </div>
          <div class="field"><label>Cible (nom RP)</label><input type="text" name="cible" required></div>
        </div>
        <div class="field"><label>Motif juridique</label><textarea name="motif" required rows="3"></textarea></div>
        <div class="field"><label>Détails complémentaires (facultatif)</label><textarea name="details" rows="2"></textarea></div>
        <div class="form-actions"><button type="submit" class="btn btn--primary">Émettre le mandat</button></div>
      </form>
    </div>` : `<p class="info-note mt-lg">L'émission de mandats est réservée au Ministère Public et à la Magistrature.</p>`;

  res.send(layout('Mandats', `
    <header class="page-header"><h1>Mandats de justice <span class="page-count">${mandats.length}</span></h1></header>
    <div class="card">
      <table class="tbl">
        <thead><tr><th>N°</th><th>Type</th><th>Cible</th><th>Motif</th><th>Émis par</th><th>Date</th><th>Statut</th><th></th></tr></thead>
        <tbody>${tbody||'<tr><td colspan="8" class="empty-note">Aucun mandat enregistré.</td></tr>'}</tbody>
      </table>
    </div>
    ${form}
  `, u));
});

app.post('/mandats', requireAuth, guardPerm('canMandat'), (req, res) => {
  const {type_mandat,cible,motif,details} = req.body;
  const u = req.session.user;
  Q.insertMandat.run(type_mandat,cible,motif,details||null,byStr(u),u.grade?.nom||'');
  res.redirect('/mandats');
});
app.post('/mandats/:id/cloturer', requireAuth, guardPerm('canMandat'), (req, res) => {
  Q.cloturerMandat.run(parseInt(req.params.id)); res.redirect('/mandats');
});

// ═══════════════════════════════════════════════════════════════════
//  RAPPORTS DE PATROUILLE
// ═══════════════════════════════════════════════════════════════════
app.get('/rapports', requireAuth, (req, res) => {
  const u = req.session.user;
  const rapports = Q.listRapports.all();

  const tbody = rapports.map(r => `
    <tr>
      <td class="mono">${r.id}</td>
      <td><strong>${r.titre}</strong></td>
      <td>${r.zone}</td>
      <td class="dim small">${r.grade_by||''} ${r.created_by||''}</td>
      <td class="mono dim small">${fmtDate(r.created_at)}</td>
      <td><button class="link-action" onclick="showRapport(${r.id})">Lire</button></td>
    </tr>`).join('');

  const details = rapports.map(r => `
    <div id="rd-${r.id}" class="rapport-detail card" style="display:none">
      <div class="card-head">
        <h3>Rapport n° ${r.id} — ${r.titre}</h3>
        <button class="btn btn--ghost" onclick="this.closest('.rapport-detail').style.display='none'">Fermer</button>
      </div>
      <dl class="dl">
        <dt>Zone / Secteur</dt><dd>${r.zone}</dd>
        <dt>Agents impliqués</dt><dd>${r.agents||'Non renseigné'}</dd>
        <dt>Rédigé par</dt><dd>${r.grade_by||''} ${r.created_by||''}</dd>
        <dt>Date</dt><dd class="mono">${fmtDate(r.created_at)}</dd>
      </dl>
      <div class="section-label mt-md">Compte-rendu de patrouille</div>
      <div class="rapport-text">${r.contenu}</div>
      ${r.incidents ? `<div class="section-label mt-md">Incidents notables</div><div class="rapport-text">${r.incidents}</div>` : ''}
    </div>`).join('');

  const formBlock = u.canRapport ? `
    <div class="modal" id="modal-rapport" hidden>
      <div class="modal-panel modal-panel--lg">
        <div class="modal-head">
          <h2>Rédiger un rapport de patrouille</h2>
          <button class="modal-close" onclick="closeModal('modal-rapport')">×</button>
        </div>
        <form method="POST" action="/rapports" class="form-stack">
          <div class="form-row-2">
            <div class="field"><label>Titre du rapport</label><input type="text" name="titre" required></div>
            <div class="field"><label>Zone / Secteur</label><input type="text" name="zone" required></div>
          </div>
          <div class="field"><label>Agents impliqués</label><input type="text" name="agents" placeholder="ADJ MARTIN, GND DUPONT…"></div>
          <div class="field"><label>Compte-rendu</label><textarea name="contenu" required rows="6"></textarea></div>
          <div class="field"><label>Incidents notables (facultatif)</label><textarea name="incidents" rows="3"></textarea></div>
          <div class="form-actions">
            <button type="button" onclick="closeModal('modal-rapport')" class="btn btn--ghost">Annuler</button>
            <button type="submit" class="btn btn--primary">Soumettre</button>
          </div>
        </form>
      </div>
    </div>` : '';

  res.send(layout('Rapports de patrouille', `
    <header class="page-header">
      <h1>Rapports de patrouille <span class="page-count">${rapports.length}</span></h1>
      ${u.canRapport ? `<button class="btn" onclick="openModal('modal-rapport')">Nouveau rapport</button>` : ''}
    </header>
    ${!u.canRapport ? `<p class="info-note mb-lg">La rédaction de rapports est réservée aux Sous-Officiers Subalternes et grades supérieurs.</p>` : ''}
    <div class="card mb-lg">
      <table class="tbl">
        <thead><tr><th>N°</th><th>Titre</th><th>Zone</th><th>Rédacteur</th><th>Date</th><th></th></tr></thead>
        <tbody>${tbody||'<tr><td colspan="6" class="empty-note">Aucun rapport.</td></tr>'}</tbody>
      </table>
    </div>
    <div id="rapports-details">${details}</div>
    ${formBlock}
    <script>
      function showRapport(id){
        document.querySelectorAll('.rapport-detail').forEach(e=>e.style.display='none');
        const el=document.getElementById('rd-'+id);
        el.style.display='block';
        el.scrollIntoView({behavior:'smooth',block:'start'});
      }
    </script>
  `, u));
});

app.post('/rapports', requireAuth, guardPerm('canRapport'), (req, res) => {
  const {titre,zone,contenu,incidents,agents} = req.body;
  const u = req.session.user;
  Q.insertRapport.run(titre,zone,contenu,incidents||null,agents||null,u.nick,u.grade?.sigle||'');
  res.redirect('/rapports');
});

// ═══════════════════════════════════════════════════════════════════
//  ESPACE G.A.
// ═══════════════════════════════════════════════════════════════════
app.get('/espace-ga', requireAuth, (req, res) => {
  const u = req.session.user;
  if (!u.isGA) return res.redirect('/tableau-de-bord');
  const msgs = Q.listGA.all();

  const list = msgs.map(m => `
    <div class="ga-item">
      <div class="ga-header">
        <span class="pill pill-bl">${m.type_msg}</span>
        <strong>${m.objet}</strong>
        <span class="mono dim small">${fmtDate(m.created_at)} — ${m.created_by||'—'}</span>
      </div>
      <div class="ga-body">${m.contenu}</div>
    </div>`).join('') || '<p class="empty-note">Aucun message.</p>';

  res.send(layout('Espace G.A.', `
    <header class="page-header">
      <h1>Espace Gendarme-Adjoint</h1>
      <button class="btn" onclick="openModal('modal-ga')">Nouveau message</button>
    </header>
    <p class="info-note mb-lg">Cet espace est réservé aux Gendarmes-Adjoints (GA1 & GA2). Vos messages sont visibles par votre hiérarchie.</p>
    <div class="card">${list}</div>

    <div class="modal" id="modal-ga" hidden>
      <div class="modal-panel">
        <div class="modal-head"><h2>Nouveau message</h2><button class="modal-close" onclick="closeModal('modal-ga')">×</button></div>
        <form method="POST" action="/espace-ga" class="form-stack">
          <div class="form-row-2">
            <div class="field"><label>Type</label>
              <select name="type_msg">
                <option value="question">Question</option>
                <option value="signalement">Signalement</option>
                <option value="demande">Demande</option>
                <option value="message">Message général</option>
              </select>
            </div>
            <div class="field"><label>Objet</label><input type="text" name="objet" required></div>
          </div>
          <div class="field"><label>Contenu</label><textarea name="contenu" required rows="5"></textarea></div>
          <div class="form-actions">
            <button type="button" onclick="closeModal('modal-ga')" class="btn btn--ghost">Annuler</button>
            <button type="submit" class="btn btn--primary">Envoyer</button>
          </div>
        </form>
      </div>
    </div>
  `, u));
});

app.post('/espace-ga', requireAuth, (req, res) => {
  if (!req.session.user.isGA) return res.redirect('/tableau-de-bord');
  const {type_msg,objet,contenu} = req.body;
  Q.insertGA.run(type_msg,objet,contenu,`[${req.session.user.grade?.sigle||'GA'}] ${req.session.user.nick}`);
  res.redirect('/espace-ga');
});

// ═══════════════════════════════════════════════════════════════════
//  IGGN
// ═══════════════════════════════════════════════════════════════════
app.get('/iggn', requireAuth, (req, res) => {
  const u = req.session.user;
  if (!u.isIGGN) return res.redirect('/tableau-de-bord');
  const dossiers = Q.listIGGN.all();

  const TYPES_IGGN = { faute_prof:'Faute professionnelle', manquement:'Manquement au devoir', abus_pouvoir:'Abus de pouvoir', violence:'Violence illégitime', corruption:'Corruption / Conflit d\'intérêts', autre:'Autre' };

  const list = dossiers.map(d => `
    <div class="iggn-dossier ${d.statut==='clôturé'?'iggn--closed':''}">
      <div class="iggn-head">
        <span class="pill ${d.statut==='ouvert'?'pill-warn':'pill-dim'}">${d.statut}</span>
        <span class="iggn-type">${TYPES_IGGN[d.type_saisine]||d.type_saisine}</span>
        <span class="mono dim small">${fmtDate(d.created_at)}</span>
      </div>
      <div class="iggn-cible"><strong>Mis en cause :</strong> ${d.cible}${d.grade_cible?` — ${d.grade_cible}`:''}</div>
      <div class="iggn-faits">${d.faits}</div>
      ${d.details ? `<div class="iggn-details dim">${d.details}</div>` : ''}
      <div class="iggn-foot">
        <span class="dim small">Saisi par : ${d.created_by||'—'}</span>
        ${d.statut==='ouvert'?`<form method="POST" action="/iggn/${d.id}/cloturer" style="display:inline"><button class="btn btn--sm btn--ghost">Clôturer le dossier</button></form>`:''}
      </div>
    </div>`).join('') || '<p class="empty-note">Aucun dossier disciplinaire.</p>';

  res.send(layout('I.G.G.N.', `
    <header class="page-header">
      <h1>Inspection Générale de la Gendarmerie Nationale</h1>
      <button class="btn" onclick="openModal('modal-iggn')">Ouvrir un dossier</button>
    </header>
    <p class="info-note mb-lg">
      L'I.G.G.N. traite les manquements disciplinaires et déontologiques du personnel de la Gendarmerie Nationale.
      Les dossiers sont strictement confidentiels et réservés au personnel habilité I.G.G.N.
    </p>
    <div class="card">${list}</div>

    <div class="modal" id="modal-iggn" hidden>
      <div class="modal-panel modal-panel--lg">
        <div class="modal-head"><h2>Ouverture d'un dossier disciplinaire</h2><button class="modal-close" onclick="closeModal('modal-iggn')">×</button></div>
        <form method="POST" action="/iggn" class="form-stack">
          <div class="form-row-2">
            <div class="field"><label>Type de saisine</label>
              <select name="type_saisine">
                ${Object.entries(TYPES_IGGN).map(([v,l])=>`<option value="${v}">${l}</option>`).join('')}
              </select>
            </div>
            <div class="field"><label>Mis en cause (pseudo RP)</label><input type="text" name="cible" required></div>
          </div>
          <div class="field field--sm"><label>Grade du mis en cause</label><input type="text" name="grade_cible" placeholder="Ex : ADJ, GND…"></div>
          <div class="field"><label>Faits reprochés</label><textarea name="faits" required rows="5"></textarea></div>
          <div class="field"><label>Pièces et détails complémentaires</label><textarea name="details" rows="3"></textarea></div>
          <div class="form-actions">
            <button type="button" onclick="closeModal('modal-iggn')" class="btn btn--ghost">Annuler</button>
            <button type="submit" class="btn btn--primary">Ouvrir le dossier</button>
          </div>
        </form>
      </div>
    </div>
  `, u));
});

app.post('/iggn', requireAuth, (req, res) => {
  if (!req.session.user.isIGGN) return res.redirect('/tableau-de-bord');
  const {type_saisine,cible,grade_cible,faits,details} = req.body;
  Q.insertIGGN.run(type_saisine,cible,grade_cible||null,faits,details||null,byStr(req.session.user));
  res.redirect('/iggn');
});
app.post('/iggn/:id/cloturer', requireAuth, (req, res) => {
  if (!req.session.user.isIGGN) return res.redirect('/tableau-de-bord');
  Q.cloturerIGGN.run(parseInt(req.params.id)); res.redirect('/iggn');
});

// ═══════════════════════════════════════════════════════════════════
//  ORDRES DE SERVICE
// ═══════════════════════════════════════════════════════════════════
app.get('/ordres-service', requireAuth, (req, res) => {
  const u      = req.session.user;
  const ordres = Q.listOrdres.all();

  const cards = ordres.map(o => {
    const pm = prioMeta(o.priorite);
    return `<div class="ordre-item ordre-${pm.cls}">
      <div class="ordre-prio"><span class="pill pill-prio-${pm.cls}">${pm.lbl}</span></div>
      <div class="ordre-body">
        <div class="ordre-titre">${o.titre}</div>
        <div class="ordre-meta dim small">${o.grade_by||''} ${o.created_by||'—'} — ${fmtDate(o.created_at)}</div>
        <div class="ordre-texte">${o.contenu}</div>
      </div>
    </div>`;
  }).join('') || '<p class="empty-note">Aucun ordre de service.</p>';

  const form = u.canOrdres ? `
    <div class="modal" id="modal-ordre" hidden>
      <div class="modal-panel">
        <div class="modal-head"><h2>Émettre un ordre de service</h2><button class="modal-close" onclick="closeModal('modal-ordre')">×</button></div>
        <form method="POST" action="/ordres-service" class="form-stack">
          <div class="form-row-2">
            <div class="field"><label>Titre</label><input type="text" name="titre" required></div>
            <div class="field field--sm"><label>Priorité</label>
              <select name="priorite">
                <option value="basse">Basse</option>
                <option value="normale" selected>Normale</option>
                <option value="haute">Haute</option>
                <option value="urgente">Urgente</option>
              </select>
            </div>
          </div>
          <div class="field"><label>Contenu de l'ordre</label><textarea name="contenu" required rows="5"></textarea></div>
          <div class="form-actions">
            <button type="button" onclick="closeModal('modal-ordre')" class="btn btn--ghost">Annuler</button>
            <button type="submit" class="btn btn--primary">Publier</button>
          </div>
        </form>
      </div>
    </div>` : '';

  res.send(layout('Ordres de service', `
    <header class="page-header">
      <h1>Ordres de service <span class="page-count">${ordres.length}</span></h1>
      ${u.canOrdres ? `<button class="btn" onclick="openModal('modal-ordre')">Émettre un ordre</button>` : ''}
    </header>
    ${!u.canOrdres ? `<p class="info-note mb-lg">La publication d'ordres de service est réservée aux Officiers.</p>` : ''}
    <div class="ordres-stack">${cards}</div>
    ${form}
  `, u));
});

app.post('/ordres-service', requireAuth, guardPerm('canOrdres'), (req, res) => {
  const {titre,contenu,priorite} = req.body;
  const u = req.session.user;
  Q.insertOrdre.run(titre,contenu,priorite,u.nick,u.grade?.sigle||'');
  res.redirect('/ordres-service');
});

// ═══════════════════════════════════════════════════════════════════
//  START
// ═══════════════════════════════════════════════════════════════════
app.listen(PORT, () => console.log(`✅ Intranet GN démarré — port ${PORT}`));
