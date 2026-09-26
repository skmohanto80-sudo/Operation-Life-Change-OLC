/**
 * OLC — Operation Life Change — Backend
 * ---------------------------------------------------
 * A tiny, self-contained Node/Express server that gives the OLC frontend
 * real cross-device storage instead of (or alongside) browser localStorage.
 *
 * Storage: a single JSON file (db.json) next to this script. No external
 * database needed — easy to inspect, back up, or swap for a real DB later.
 *
 * Run locally:
 *   npm install
 *   npm start
 *   -> API on http://localhost:4000
 *   -> Admin viewer on http://localhost:4000/admin?key=YOUR_ADMIN_KEY
 *
 * Deploy: works on any Node host (Render, Railway, Fly.io, a VPS, etc).
 * GitHub Pages CANNOT run this — Pages only serves static files. Host the
 * frontend on Pages and this backend somewhere that runs Node, then point
 * the frontend at it (see frontend/app.js -> API_BASE_URL).
 */

const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 4000;
const ADMIN_KEY = process.env.OLC_ADMIN_KEY || 'changeme';
const DB_PATH = path.join(__dirname, 'db.json');

if (ADMIN_KEY === 'changeme') {
  console.warn('\n⚠  OLC_ADMIN_KEY is not set — using the default "changeme".');
  console.warn('   Set a real admin key: OLC_ADMIN_KEY=yourSecretHere npm start\n');
}

/* ---------- tiny JSON-file "database" ---------- */
function readDB() {
  if (!fs.existsSync(DB_PATH)) {
    const fresh = { accounts: [], states: {} };
    fs.writeFileSync(DB_PATH, JSON.stringify(fresh, null, 2));
    return fresh;
  }
  try {
    return JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
  } catch (e) {
    console.error('db.json is corrupted, starting fresh:', e.message);
    return { accounts: [], states: {} };
  }
}
function writeDB(db) {
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
}
function uid() {
  return 'acct_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

const app = express();
app.use(cors());
app.use(express.json({ limit: '5mb' }));

/* ---------- account API ---------- */

// Create a new account, or log into a matching one if it already exists.
app.post('/api/signup', (req, res) => {
  const { codename, codeid } = req.body || {};
  if (!codename || !codeid) return res.status(400).json({ error: 'codename and codeid are required' });

  const db = readDB();
  const existing = db.accounts.find(a => a.codename === codename && a.codeid === codeid);
  if (existing) {
    return res.json({ accountId: existing.id, state: db.states[existing.id] || null, existed: true });
  }
  const id = uid();
  db.accounts.push({ id, codename, codeid, createdAt: new Date().toISOString() });
  db.states[id] = null; // frontend will PUT the default state on first save
  writeDB(db);
  res.json({ accountId: id, state: null, existed: false });
});

// Log into an existing account.
app.post('/api/login', (req, res) => {
  const { codename, codeid } = req.body || {};
  const db = readDB();
  const acc = db.accounts.find(a => a.codename === codename && a.codeid === codeid);
  if (!acc) return res.status(404).json({ error: 'No matching account found' });
  res.json({ accountId: acc.id, state: db.states[acc.id] || null });
});

// Get an account's saved state.
app.get('/api/state/:accountId', (req, res) => {
  const db = readDB();
  const acc = db.accounts.find(a => a.id === req.params.accountId);
  if (!acc) return res.status(404).json({ error: 'Account not found' });
  res.json({ state: db.states[acc.id] || null });
});

// Save (overwrite) an account's state.
app.put('/api/state/:accountId', (req, res) => {
  const db = readDB();
  const acc = db.accounts.find(a => a.id === req.params.accountId);
  if (!acc) return res.status(404).json({ error: 'Account not found' });
  db.states[acc.id] = req.body;
  writeDB(db);
  res.json({ ok: true });
});

app.get('/api/health', (req, res) => res.json({ ok: true, time: new Date().toISOString() }));

/* ---------- admin viewer (protected by a simple key) ---------- */
function checkAdmin(req, res, next) {
  const key = req.query.key || req.headers['x-admin-key'];
  if (key !== ADMIN_KEY) return res.status(401).send('Unauthorized — add ?key=YOUR_ADMIN_KEY to the URL.');
  next();
}

app.get('/api/admin/accounts', checkAdmin, (req, res) => {
  const db = readDB();
  res.json(db.accounts);
});

app.get('/api/admin/state/:accountId', checkAdmin, (req, res) => {
  const db = readDB();
  res.json(db.states[req.params.accountId] || null);
});

app.delete('/api/admin/account/:accountId', checkAdmin, (req, res) => {
  const db = readDB();
  db.accounts = db.accounts.filter(a => a.id !== req.params.accountId);
  delete db.states[req.params.accountId];
  writeDB(db);
  res.json({ ok: true });
});

app.get('/admin', checkAdmin, (req, res) => {
  const db = readDB();
  const key = req.query.key;
  const rows = db.accounts.map(a => {
    const st = db.states[a.id];
    const xp = st ? st.xp : '—';
    const rank = st && st.profile ? (st.profile.name || '—') : '—';
    const goals = st && st.goals ? st.goals.length : '—';
    return `<tr>
      <td>${a.codename}</td><td>${a.codeid}</td><td>${a.id}</td>
      <td>${xp}</td><td>${goals}</td><td>${a.createdAt || ''}</td>
      <td>
        <a href="/api/admin/state/${a.id}?key=${key}" target="_blank">view JSON</a>
        &nbsp;·&nbsp;
        <a href="#" onclick="if(confirm('Delete this account and all its data?')){fetch('/api/admin/account/${a.id}?key=${key}',{method:'DELETE'}).then(()=>location.reload());} return false;">delete</a>
      </td>
    </tr>`;
  }).join('');
  res.send(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>OLC Admin</title>
  <style>
    body{ font-family:system-ui, sans-serif; background:#0b0714; color:#f4f1fb; padding:30px; }
    h1{ color:#d779f1; }
    table{ border-collapse:collapse; width:100%; margin-top:16px; }
    th,td{ border:1px solid #6753b7; padding:8px 12px; text-align:left; font-size:14px; }
    th{ background:#1a1226; }
    a{ color:#01c4c4; }
  </style></head><body>
  <h1>OLC — Admin Viewer</h1>
  <p>${db.accounts.length} account(s) on this backend.</p>
  <table>
    <tr><th>Codename</th><th>Code ID</th><th>Account ID</th><th>XP</th><th>Goals</th><th>Created</th><th>Actions</th></tr>
    ${rows || '<tr><td colspan="7">No accounts yet.</td></tr>'}
  </table>
  </body></html>`);
});

app.listen(PORT, () => {
  console.log(`OLC backend running on http://localhost:${PORT}`);
  console.log(`Admin viewer: http://localhost:${PORT}/admin?key=${ADMIN_KEY}`);
});
