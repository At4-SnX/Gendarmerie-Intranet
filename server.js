'use strict';

const express        = require('express');
const session        = require('express-session');
const fetch          = require('node-fetch');
const Database       = require('better-sqlite3');
const path           = require('path');

const app  = express();
const PORT = process.env.PORT || 3000;

// ─── CONFIG ──────────────────────────────────────────────────────────────────
const CFG = {
  CLIENT_ID:     process.env.DISCORD_CLIENT_ID     || '',
  CLIENT_SECRET: process.env.DISCORD_CLIENT_SECRET || '',
  REDIRECT_URI:  process.env.REDIRECT_URI          || `http://localhost:${PORT}/auth/callback`,
  SESSION_SECRET: process.env.SESSION_SECRET       || 'gend_secret_change_me',
  GUILD_ID:      process.env.GUILD_ID              || '',
  BOT_TOKEN:     process.env.DISCORD_TOKEN         || '',
  // ID du rôle "Gendarmerie Nationale" sur le serveur Discord
  ROLE_GEND_ID:  '1508283902672896055',
};

// ─── BASE DE DONNÉES ─────────────────────────────────────────────────────────
const db = new Database('./gend_web.db');
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

  CREATE TABLE IF NOT EXISTS avis_recherche (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    nom_prenom  TEXT NOT NULL,
    age_rp      INTEGER,
    description TEXT NOT NULL,
    danger      TEXT NOT NULL DEFAULT 'moyen',
    photo_url   TEXT,
    created_by  TEXT,
    actif       INTEGER DEFAULT 1,
    created_at  TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS ordres_service (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    titre       TEXT NOT NULL,
    contenu     TEXT NOT NULL,
    priorite    TEXT NOT NULL DEFAULT 'normale',
    created_by  TEXT,
    created_at  TEXT DEFAULT (datetime('now'))
  );
`);

const Q = {
  listCasiers:  db.prepare(`SELECT * FROM casiers ORDER BY created_at DESC LIMIT 50`),
  getCasier:    db.prepare(`SELECT * FROM casiers WHERE id=?`),
  searchCasier: db.prepare(`SELECT * FROM casiers WHERE nom_prenom LIKE ? ORDER BY created_at DESC`),
  insertCasier: db.prepare(`INSERT INTO casiers (nom_prenom,age_rp,faits,type_peine,amende,amende_payee,duree_gav,duree_prison,photo_url,created_by) VALUES (?,?,?,?,?,?,?,?,?,?)`),
  deleteCasier: db.prepare(`DELETE FROM casiers WHERE id=?`),

  listAvis:     db.prepare(`SELECT * FROM avis_recherche WHERE actif=1 ORDER BY created_at DESC`),
  insertAvis:   db.prepare(`INSERT INTO avis_recherche (nom_prenom,age_rp,description,danger,photo_url,created_by) VALUES (?,?,?,?,?,?)`),
  closeAvis:    db.prepare(`UPDATE avis_recherche SET actif=0 WHERE id=?`),

  listOrdres:   db.prepare(`SELECT * FROM ordres_service ORDER BY created_at DESC LIMIT 20`),
  insertOrdre:  db.prepare(`INSERT INTO ordres_service (titre,contenu,priorite,created_by) VALUES (?,?,?,?)`),
};

// ─── MIDDLEWARE ───────────────────────────────────────────────────────────────
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({
  secret: CFG.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 1000 * 60 * 60 * 8 }, // 8h
}));

// Injecter user dans toutes les vues
app.use((req, res, next) => {
  res.locals.user = req.session.user || null;
  next();
});

// Guard : vérifier le rôle Gendarmerie
async function requireGend(req, res, next) {
  if (!req.session.user) return res.redirect('/login');

  // Vérifier le rôle via l'API Discord (bot token)
  try {
    const r = await fetch(
      `https://discord.com/api/v10/guilds/${CFG.GUILD_ID}/members/${req.session.user.id}`,
      { headers: { Authorization: `Bot ${CFG.BOT_TOKEN}` } }
    );
    if (!r.ok) { req.session.destroy(); return res.redirect('/login?err=guild'); }
    const member = await r.json();
    if (!member.roles || !member.roles.includes(CFG.ROLE_GEND_ID)) {
      return res.redirect('/acces-refuse');
    }
    req.session.user.roles = member.roles;
    next();
  } catch {
    res.redirect('/login?err=check');
  }
}

// ─── HELPERS HTML ─────────────────────────────────────────────────────────────
function layout(title, body, user) {
  const avatar = user
    ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png`
    : '';
  const nav = user ? `
    <nav class="sidebar">
      <div class="sidebar-logo">
        <div class="logo-shield">⚔</div>
        <div class="logo-text">
          <span class="logo-main">GENDARMERIE</span>
          <span class="logo-sub">NATIONALE RP</span>
        </div>
      </div>
      <div class="nav-links">
        <a href="/dashboard" class="nav-item"><span class="nav-icon">🏠</span>Tableau de bord</a>
        <a href="/casiers" class="nav-item"><span class="nav-icon">📂</span>Casiers judiciaires</a>
        <a href="/casiers/nouveau" class="nav-item"><span class="nav-icon">➕</span>Nouveau casier</a>
        <a href="/avis-recherche" class="nav-item"><span class="nav-icon">🔍</span>Avis de recherche</a>
        <a href="/ordres-service" class="nav-item"><span class="nav-icon">📋</span>Ordres de service</a>
      </div>
      <div class="sidebar-user">
        <img src="${avatar}" class="user-avatar" onerror="this.src='/img/default.png'">
        <div class="user-info">
          <span class="user-name">${user.global_name || user.username}</span>
          <span class="user-grade">Gendarme</span>
        </div>
        <a href="/logout" class="logout-btn" title="Déconnexion">⏏</a>
      </div>
    </nav>
    <div class="main-content">
  ` : '<div class="main-content full">';

  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title} — Gendarmerie RP</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Rajdhani:wght@400;500;600;700&family=Share+Tech+Mono&family=Barlow:wght@300;400;500;600&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="/css/style.css">
</head>
<body>
  ${nav}
    ${body}
  </div>
</body>
</html>`;
}

// ─── ROUTES PUBLIQUES ─────────────────────────────────────────────────────────

app.get('/', (req, res) => {
  if (req.session.user) return res.redirect('/dashboard');
  res.send(layout('Accès', `
    <div class="login-page">
      <div class="login-card">
        <div class="login-emblem">⚔</div>
        <h1 class="login-title">GENDARMERIE<br><span>NATIONALE RP</span></h1>
        <p class="login-sub">Intranet sécurisé — Accès restreint au personnel autorisé</p>
        <div class="login-divider"></div>
        <p class="login-info">Authentification via votre compte Discord du serveur.<br>Seuls les membres ayant le rôle <strong>Gendarmerie Nationale</strong> peuvent accéder au système.</p>
        <a href="/auth/discord" class="btn-login">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03z"/></svg>
          Se connecter avec Discord
        </a>
        <p class="login-footer">© Gendarmerie Nationale RP — Système d'information sécurisé</p>
      </div>
    </div>
  `, null));
});

app.get('/login', (req, res) => res.redirect('/'));

app.get('/acces-refuse', (req, res) => {
  res.status(403).send(layout('Accès refusé', `
    <div class="error-page">
      <div class="error-code">403</div>
      <h2>ACCÈS NON AUTORISÉ</h2>
      <p>Vous ne possédez pas le rôle <strong>Gendarmerie Nationale</strong> sur le serveur Discord.</p>
      <a href="/logout" class="btn-primary">Se déconnecter</a>
    </div>
  `, req.session.user || null));
});

// ─── DISCORD OAUTH2 ───────────────────────────────────────────────────────────

app.get('/auth/discord', (req, res) => {
  const params = new URLSearchParams({
    client_id:     CFG.CLIENT_ID,
    redirect_uri:  CFG.REDIRECT_URI,
    response_type: 'code',
    scope:         'identify',
  });
  res.redirect(`https://discord.com/api/oauth2/authorize?${params}`);
});

app.get('/auth/callback', async (req, res) => {
  const { code } = req.query;
  if (!code) return res.redirect('/?err=no_code');

  try {
    // Échanger le code contre un token
    const tokenRes = await fetch('https://discord.com/api/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id:     CFG.CLIENT_ID,
        client_secret: CFG.CLIENT_SECRET,
        grant_type:    'authorization_code',
        code,
        redirect_uri:  CFG.REDIRECT_URI,
      }),
    });
    const tokens = await tokenRes.json();
    if (!tokens.access_token) return res.redirect('/?err=token');

    // Récupérer le profil Discord
    const userRes = await fetch('https://discord.com/api/v10/users/@me', {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    const discordUser = await userRes.json();

    req.session.user = {
      id:          discordUser.id,
      username:    discordUser.username,
      global_name: discordUser.global_name,
      avatar:      discordUser.avatar,
    };

    res.redirect('/dashboard');
  } catch (err) {
    console.error('OAuth error:', err);
    res.redirect('/?err=oauth');
  }
});

app.get('/logout', (req, res) => {
  req.session.destroy();
  res.redirect('/');
});

// ─── ROUTES PROTÉGÉES ─────────────────────────────────────────────────────────

app.get('/dashboard', requireGend, (req, res) => {
  const totalCasiers = db.prepare(`SELECT COUNT(*) as n FROM casiers`).get().n;
  const avisActifs   = db.prepare(`SELECT COUNT(*) as n FROM avis_recherche WHERE actif=1`).get().n;
  const ordresTotal  = db.prepare(`SELECT COUNT(*) as n FROM ordres_service`).get().n;
  const derniersCasiers = db.prepare(`SELECT * FROM casiers ORDER BY created_at DESC LIMIT 5`).all();
  const lastOrdre    = db.prepare(`SELECT * FROM ordres_service ORDER BY created_at DESC LIMIT 1`).get();

  const casierRows = derniersCasiers.map(c => `
    <tr>
      <td><span class="badge-id">#${c.id}</span></td>
      <td><strong>${c.nom_prenom}</strong></td>
      <td>${c.age_rp} ans</td>
      <td>${peineLabel(c)}</td>
      <td class="date-cell">${fmtDate(c.created_at)}</td>
      <td><a href="/casiers/${c.id}" class="btn-sm">Voir</a></td>
    </tr>
  `).join('');

  const ordreHtml = lastOrdre ? `
    <div class="ordre-card ${lastOrdre.priorite}">
      <div class="ordre-header">
        <span class="ordre-priorite ${lastOrdre.priorite}">${prioriteLabel(lastOrdre.priorite)}</span>
        <span class="ordre-date">${fmtDate(lastOrdre.created_at)}</span>
      </div>
      <h3>${lastOrdre.titre}</h3>
      <p>${lastOrdre.contenu.substring(0, 200)}${lastOrdre.contenu.length > 200 ? '...' : ''}</p>
    </div>
  ` : '<p class="empty-state">Aucun ordre de service.</p>';

  res.send(layout('Tableau de bord', `
    <div class="page-header">
      <h1>Tableau de bord</h1>
      <span class="page-sub">Bienvenue, <strong>${req.session.user.global_name || req.session.user.username}</strong></span>
    </div>

    <div class="stats-grid">
      <div class="stat-card blue">
        <div class="stat-icon">📂</div>
        <div class="stat-value">${totalCasiers}</div>
        <div class="stat-label">Casiers enregistrés</div>
      </div>
      <div class="stat-card red">
        <div class="stat-icon">🔍</div>
        <div class="stat-value">${avisActifs}</div>
        <div class="stat-label">Avis de recherche actifs</div>
      </div>
      <div class="stat-card grey">
        <div class="stat-icon">📋</div>
        <div class="stat-value">${ordresTotal}</div>
        <div class="stat-label">Ordres de service</div>
      </div>
    </div>

    <div class="dashboard-grid">
      <div class="panel">
        <div class="panel-header">
          <h2>📂 Derniers casiers</h2>
          <a href="/casiers" class="btn-sm">Tout voir</a>
        </div>
        <div class="table-wrap">
          <table class="data-table">
            <thead><tr><th>#</th><th>Nom / Prénom</th><th>Âge</th><th>Peine</th><th>Date</th><th></th></tr></thead>
            <tbody>${casierRows || '<tr><td colspan="6" class="empty-state">Aucun casier.</td></tr>'}</tbody>
          </table>
        </div>
      </div>
      <div class="panel">
        <div class="panel-header">
          <h2>📋 Dernier ordre de service</h2>
          <a href="/ordres-service" class="btn-sm">Tout voir</a>
        </div>
        ${ordreHtml}
      </div>
    </div>
  `, req.session.user));
});

// ── CASIERS ──────────────────────────────────────────────────────────────────

app.get('/casiers', requireGend, (req, res) => {
  const q     = req.query.q || '';
  const rows  = q ? Q.searchCasier.all(`%${q}%`) : Q.listCasiers.all();

  const tableRows = rows.map(c => `
    <tr>
      <td><span class="badge-id">#${c.id}</span></td>
      <td><strong>${c.nom_prenom}</strong></td>
      <td>${c.age_rp} ans</td>
      <td>${c.faits.substring(0, 60)}${c.faits.length > 60 ? '…' : ''}</td>
      <td>${peineLabel(c)}</td>
      <td class="date-cell">${fmtDate(c.created_at)}</td>
      <td><a href="/casiers/${c.id}" class="btn-sm">Voir</a></td>
    </tr>
  `).join('');

  res.send(layout('Casiers judiciaires', `
    <div class="page-header">
      <h1>📂 Casiers judiciaires</h1>
      <a href="/casiers/nouveau" class="btn-primary">+ Nouveau casier</a>
    </div>
    <div class="panel">
      <form class="search-bar" method="GET">
        <input type="text" name="q" placeholder="🔍 Rechercher par nom / prénom..." value="${q}" class="search-input">
        <button type="submit" class="btn-primary">Rechercher</button>
        ${q ? '<a href="/casiers" class="btn-secondary">✕ Effacer</a>' : ''}
      </form>
      <div class="table-wrap">
        <table class="data-table">
          <thead><tr><th>#</th><th>Nom / Prénom</th><th>Âge</th><th>Faits</th><th>Peine</th><th>Date</th><th></th></tr></thead>
          <tbody>${tableRows || '<tr><td colspan="7" class="empty-state">Aucun casier trouvé.</td></tr>'}</tbody>
        </table>
      </div>
    </div>
  `, req.session.user));
});

app.get('/casiers/nouveau', requireGend, (req, res) => {
  res.send(layout('Nouveau casier', `
    <div class="page-header">
      <h1>➕ Nouveau casier judiciaire B3</h1>
    </div>
    <div class="panel form-panel">
      <form method="POST" action="/casiers" class="form-grid">
        <div class="form-row">
          <div class="form-group">
            <label>👤 Nom et prénom RP</label>
            <input type="text" name="nom_prenom" required placeholder="Ex: Jean Dupont">
          </div>
          <div class="form-group">
            <label>🎂 Âge RP</label>
            <input type="number" name="age_rp" required min="1" max="120" placeholder="Ex: 32">
          </div>
        </div>
        <div class="form-group full">
          <label>📋 Faits reprochés</label>
          <textarea name="faits" required rows="4" placeholder="Décrivez les infractions commises..."></textarea>
        </div>
        <div class="form-group">
          <label>🏷️ Type de peine</label>
          <select name="type_peine" id="type_peine" onchange="updatePeineFields(this.value)">
            <option value="amende">💰 Amende</option>
            <option value="gav">🚔 Garde à vue (GAV)</option>
            <option value="prison">⛓️ Prison</option>
          </select>
        </div>
        <div id="fields-amende" class="form-row peine-fields">
          <div class="form-group">
            <label>💰 Montant de l'amende</label>
            <input type="text" name="amende" placeholder="Ex: 5000$">
          </div>
          <div class="form-group">
            <label>📌 Amende payée ?</label>
            <select name="amende_payee">
              <option value="0">❌ Non payée</option>
              <option value="1">✅ Payée</option>
            </select>
          </div>
        </div>
        <div id="fields-gav" class="form-row peine-fields" style="display:none">
          <div class="form-group">
            <label>⏱️ Durée de la GAV</label>
            <input type="text" name="duree_gav" placeholder="Ex: 24h, 48h">
          </div>
        </div>
        <div id="fields-prison" class="form-row peine-fields" style="display:none">
          <div class="form-group">
            <label>⏱️ Durée de la peine</label>
            <input type="text" name="duree_prison" placeholder="Ex: 6 mois, 2 ans">
          </div>
        </div>
        <div class="form-group full">
          <label>🖼️ URL photo du suspect (fond blanc)</label>
          <input type="url" name="photo_url" placeholder="https://... (lien vers l'image)">
        </div>
        <div class="form-actions">
          <a href="/casiers" class="btn-secondary">Annuler</a>
          <button type="submit" class="btn-primary">📂 Créer le casier</button>
        </div>
      </form>
    </div>
    <script>
      function updatePeineFields(v) {
        document.querySelectorAll('.peine-fields').forEach(el => el.style.display = 'none');
        const el = document.getElementById('fields-' + v);
        if (el) el.style.display = 'flex';
      }
    </script>
  `, req.session.user));
});

app.post('/casiers', requireGend, (req, res) => {
  const { nom_prenom, age_rp, faits, type_peine, amende, amende_payee, duree_gav, duree_prison, photo_url } = req.body;
  if (!nom_prenom || !age_rp || !faits || !type_peine) return res.redirect('/casiers/nouveau?err=1');
  const res2 = Q.insertCasier.run(nom_prenom, parseInt(age_rp), faits, type_peine, amende || null, parseInt(amende_payee) || 0, duree_gav || null, duree_prison || null, photo_url || null, req.session.user.username);
  res.redirect(`/casiers/${res2.lastInsertRowid}?created=1`);
});

app.get('/casiers/:id', requireGend, (req, res) => {
  const casier = Q.getCasier.get(parseInt(req.params.id));
  if (!casier) return res.redirect('/casiers');

  let peineHtml = '';
  if (casier.type_peine === 'amende') {
    peineHtml = `
      <div class="info-block"><span class="info-label">💰 Type de peine</span><span class="info-val peine-badge amende">Amende</span></div>
      <div class="info-block"><span class="info-label">Montant</span><span class="info-val">${casier.amende || 'N/R'}</span></div>
      <div class="info-block"><span class="info-label">Statut</span><span class="info-val ${casier.amende_payee ? 'status-ok' : 'status-nok'}">${casier.amende_payee ? '✅ Payée' : '❌ Non payée'}</span></div>
    `;
  } else if (casier.type_peine === 'gav') {
    peineHtml = `
      <div class="info-block"><span class="info-label">🚔 Type de peine</span><span class="info-val peine-badge gav">Garde à vue</span></div>
      <div class="info-block"><span class="info-label">Durée GAV</span><span class="info-val">${casier.duree_gav || 'N/R'}</span></div>
    `;
  } else if (casier.type_peine === 'prison') {
    peineHtml = `
      <div class="info-block"><span class="info-label">⛓️ Type de peine</span><span class="info-val peine-badge prison">Prison</span></div>
      <div class="info-block"><span class="info-label">Durée</span><span class="info-val">${casier.duree_prison || 'N/R'}</span></div>
    `;
  }

  const photoHtml = casier.photo_url
    ? `<div class="suspect-photo"><img src="${casier.photo_url}" alt="Photo suspect" onerror="this.parentElement.innerHTML='<span class=no-photo>Photo indisponible</span>'"></div>`
    : `<div class="suspect-photo no-photo-box"><span>📷 Aucune photo</span></div>`;

  res.send(layout(`Casier #${casier.id}`, `
    <div class="page-header">
      <h1>📂 Casier judiciaire <span class="badge-id">#${casier.id}</span></h1>
      <div class="header-actions">
        <a href="/casiers" class="btn-secondary">← Retour</a>
        <form method="POST" action="/casiers/${casier.id}/supprimer" style="display:inline" onsubmit="return confirm('Supprimer ce casier définitivement ?')">
          <button type="submit" class="btn-danger">🗑 Supprimer</button>
        </form>
      </div>
    </div>
    <div class="casier-detail">
      <div class="casier-main panel">
        <div class="casier-header-strip">
          <div class="casier-title-block">
            <h2>${casier.nom_prenom}</h2>
            <span class="casier-meta">${casier.age_rp} ans — Créé le ${fmtDate(casier.created_at)} par ${casier.created_by}</span>
          </div>
          ${photoHtml}
        </div>
        <div class="divider"></div>
        <div class="info-section">
          <h3>📋 Faits reprochés</h3>
          <div class="faits-block">${casier.faits}</div>
        </div>
        <div class="divider"></div>
        <div class="info-section">
          <h3>⚖️ Peine prononcée</h3>
          <div class="info-grid">${peineHtml}</div>
        </div>
        <div class="casier-footer">
          <span>Document officiel B3 — Usage strictement interne</span>
          <span>Administration Générale de la Gendarmerie Nationale RP</span>
        </div>
      </div>
    </div>
    ${req.query.created ? '<div class="toast">✅ Casier créé avec succès</div><script>setTimeout(()=>document.querySelector(".toast").remove(),3000)</script>' : ''}
  `, req.session.user));
});

app.post('/casiers/:id/supprimer', requireGend, (req, res) => {
  Q.deleteCasier.run(parseInt(req.params.id));
  res.redirect('/casiers');
});

// ── AVIS DE RECHERCHE ─────────────────────────────────────────────────────────

app.get('/avis-recherche', requireGend, (req, res) => {
  const avis = Q.listAvis.all();
  const cards = avis.map(a => `
    <div class="avis-card danger-${a.danger}">
      <div class="avis-danger-strip">${dangerLabel(a.danger)}</div>
      ${a.photo_url ? `<img src="${a.photo_url}" class="avis-photo" onerror="this.style.display='none'">` : '<div class="avis-no-photo">📷</div>'}
      <div class="avis-body">
        <h3>${a.nom_prenom}</h3>
        ${a.age_rp ? `<span class="avis-age">${a.age_rp} ans</span>` : ''}
        <p class="avis-desc">${a.description}</p>
        <div class="avis-footer">
          <span class="avis-date">${fmtDate(a.created_at)}</span>
          <form method="POST" action="/avis-recherche/${a.id}/clore" style="display:inline">
            <button type="submit" class="btn-sm">✓ Clore</button>
          </form>
        </div>
      </div>
    </div>
  `).join('');

  res.send(layout('Avis de recherche', `
    <div class="page-header">
      <h1>🔍 Avis de recherche actifs</h1>
      <button class="btn-primary" onclick="document.getElementById('modal-avis').style.display='flex'">+ Nouvel avis</button>
    </div>
    <div class="avis-grid">${cards || '<div class="empty-state">Aucun avis de recherche actif.</div>'}</div>

    <div class="modal" id="modal-avis">
      <div class="modal-card">
        <div class="modal-header"><h3>+ Nouvel avis de recherche</h3><button onclick="document.getElementById('modal-avis').style.display='none'" class="modal-close">✕</button></div>
        <form method="POST" action="/avis-recherche" class="form-grid">
          <div class="form-row">
            <div class="form-group"><label>👤 Nom / Prénom RP</label><input type="text" name="nom_prenom" required></div>
            <div class="form-group"><label>🎂 Âge RP</label><input type="number" name="age_rp" min="1" max="120"></div>
          </div>
          <div class="form-group full"><label>📋 Description / Motif</label><textarea name="description" required rows="3"></textarea></div>
          <div class="form-row">
            <div class="form-group">
              <label>⚠️ Niveau de danger</label>
              <select name="danger">
                <option value="faible">🟢 Faible</option>
                <option value="moyen" selected>🟡 Moyen</option>
                <option value="eleve">🔴 Élevé</option>
                <option value="critique">🔴 CRITIQUE</option>
              </select>
            </div>
            <div class="form-group"><label>🖼️ URL photo</label><input type="url" name="photo_url" placeholder="https://..."></div>
          </div>
          <div class="form-actions">
            <button type="button" onclick="document.getElementById('modal-avis').style.display='none'" class="btn-secondary">Annuler</button>
            <button type="submit" class="btn-primary">Publier l'avis</button>
          </div>
        </form>
      </div>
    </div>
  `, req.session.user));
});

app.post('/avis-recherche', requireGend, (req, res) => {
  const { nom_prenom, age_rp, description, danger, photo_url } = req.body;
  Q.insertAvis.run(nom_prenom, age_rp ? parseInt(age_rp) : null, description, danger, photo_url || null, req.session.user.username);
  res.redirect('/avis-recherche');
});

app.post('/avis-recherche/:id/clore', requireGend, (req, res) => {
  Q.closeAvis.run(parseInt(req.params.id));
  res.redirect('/avis-recherche');
});

// ── ORDRES DE SERVICE ─────────────────────────────────────────────────────────

app.get('/ordres-service', requireGend, (req, res) => {
  const ordres = Q.listOrdres.all();
  const cards = ordres.map(o => `
    <div class="ordre-card ${o.priorite}">
      <div class="ordre-header">
        <span class="ordre-priorite ${o.priorite}">${prioriteLabel(o.priorite)}</span>
        <span class="ordre-date">${fmtDate(o.created_at)} — ${o.created_by}</span>
      </div>
      <h3>${o.titre}</h3>
      <p>${o.contenu}</p>
    </div>
  `).join('');

  res.send(layout('Ordres de service', `
    <div class="page-header">
      <h1>📋 Ordres de service</h1>
      <button class="btn-primary" onclick="document.getElementById('modal-ordre').style.display='flex'">+ Nouvel ordre</button>
    </div>
    <div class="ordres-list">${cards || '<div class="empty-state">Aucun ordre de service.</div>'}</div>

    <div class="modal" id="modal-ordre">
      <div class="modal-card">
        <div class="modal-header"><h3>+ Nouvel ordre de service</h3><button onclick="document.getElementById('modal-ordre').style.display='none'" class="modal-close">✕</button></div>
        <form method="POST" action="/ordres-service" class="form-grid">
          <div class="form-row">
            <div class="form-group full"><label>📌 Titre</label><input type="text" name="titre" required placeholder="Ex: Opération Bouclier — Zone Est"></div>
          </div>
          <div class="form-group full"><label>📋 Contenu de l'ordre</label><textarea name="contenu" required rows="5" placeholder="Détails de l'ordre de service..."></textarea></div>
          <div class="form-group">
            <label>🚨 Priorité</label>
            <select name="priorite">
              <option value="basse">🟢 Basse</option>
              <option value="normale" selected>🔵 Normale</option>
              <option value="haute">🟡 Haute</option>
              <option value="urgente">🔴 Urgente</option>
            </select>
          </div>
          <div class="form-actions">
            <button type="button" onclick="document.getElementById('modal-ordre').style.display='none'" class="btn-secondary">Annuler</button>
            <button type="submit" class="btn-primary">Publier</button>
          </div>
        </form>
      </div>
    </div>
  `, req.session.user));
});

app.post('/ordres-service', requireGend, (req, res) => {
  const { titre, contenu, priorite } = req.body;
  Q.insertOrdre.run(titre, contenu, priorite, req.session.user.username);
  res.redirect('/ordres-service');
});

// ─── HELPERS ─────────────────────────────────────────────────────────────────
function fmtDate(str) {
  if (!str) return 'N/A';
  return new Date(str + (str.includes('T') ? '' : 'Z'))
    .toLocaleString('fr-FR', { timeZone: 'Europe/Paris', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}
function peineLabel(c) {
  if (c.type_peine === 'amende')  return `<span class="peine-badge amende">💰 ${c.amende || 'Amende'}</span>`;
  if (c.type_peine === 'gav')     return `<span class="peine-badge gav">🚔 GAV ${c.duree_gav || ''}</span>`;
  if (c.type_peine === 'prison')  return `<span class="peine-badge prison">⛓️ Prison ${c.duree_prison || ''}</span>`;
  return c.type_peine;
}
function prioriteLabel(p) {
  const m = { basse: '🟢 Basse', normale: '🔵 Normale', haute: '🟡 Haute', urgente: '🔴 URGENTE' };
  return m[p] || p;
}
function dangerLabel(d) {
  const m = { faible: '🟢 Faible', moyen: '🟡 Moyen', eleve: '🔴 Élevé', critique: '🔴 CRITIQUE' };
  return m[d] || d;
}

// ─── START ────────────────────────────────────────────────────────────────────
app.listen(PORT, () => console.log(`✅ Serveur démarré sur le port ${PORT}`));
