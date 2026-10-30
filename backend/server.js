/* PROJUKTI backend — accounts (OLC rules), cloud sync (latest wins, versioned backups), shared XP.
   Runs on Vercel (serverless), Render, Railway or plain `node server.js`. */
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { Pool } = require('pg');

const { DATABASE_URL, JWT_SECRET } = process.env;
if (!DATABASE_URL || !JWT_SECRET) console.error('Missing DATABASE_URL or JWT_SECRET environment variable.');

/* ---------- account table mapping (matches OLC's table if you set these env vars) ---------- */
const id = (v, d) => { const x = v || d; if (!/^[a-z_][a-z0-9_]*$/i.test(x)) throw new Error('Bad identifier: ' + x); return '"' + x + '"'; };
const T = id(process.env.ACCOUNTS_TABLE, 'olc_accounts');
const C = {
  user: id(process.env.COL_USER, 'username'), hash: id(process.env.COL_HASH, 'pass_hash'), avatar: id(process.env.COL_AVATAR, 'avatar'),
  display: id(process.env.COL_DISPLAY, 'display_name'), rq: id(process.env.COL_RECOVERY_Q, 'recovery_q'), rh: id(process.env.COL_RECOVERY_HASH, 'recovery_hash')
};

const pool = new Pool({ connectionString: DATABASE_URL, ssl: DATABASE_URL && !/localhost|127\.0\.0\.1/.test(DATABASE_URL) ? { rejectUnauthorized: false } : undefined, max: 5 });
let ready = null;
const init = () => ready || (ready = pool.query(`
  CREATE TABLE IF NOT EXISTS ${T} (
    ${C.user} TEXT PRIMARY KEY, ${C.hash} TEXT NOT NULL, ${C.avatar} TEXT, ${C.display} TEXT,
    ${C.rq} TEXT, ${C.rh} TEXT, created_at TIMESTAMPTZ DEFAULT now());
  CREATE TABLE IF NOT EXISTS olc_xp_events (
    username TEXT NOT NULL, source TEXT NOT NULL, key TEXT NOT NULL, xp INT NOT NULL, label TEXT, day TEXT, ts BIGINT,
    PRIMARY KEY (username, source, key));
  CREATE INDEX IF NOT EXISTS olc_xp_user ON olc_xp_events (username);
  CREATE TABLE IF NOT EXISTS app_data (
    username TEXT NOT NULL, app TEXT NOT NULL, data JSONB NOT NULL, rev INT NOT NULL DEFAULT 1, updated_at TIMESTAMPTZ DEFAULT now(),
    PRIMARY KEY (username, app));
  CREATE TABLE IF NOT EXISTS app_data_history (
    id SERIAL PRIMARY KEY, username TEXT NOT NULL, app TEXT NOT NULL, rev INT NOT NULL, data JSONB NOT NULL, created_at TIMESTAMPTZ DEFAULT now());
  CREATE INDEX IF NOT EXISTS app_hist ON app_data_history (username, app, id DESC);
`).catch(e => { ready = null; throw e; }));

/* ---------- OLC account rules ---------- */
const USER_RX = /^(?=[A-Za-z0-9]*[A-Z])(?=[A-Za-z0-9]*[a-z])(?=[A-Za-z0-9]*\d)[A-Za-z0-9]{8}@olc\.com$/;
const validUser = u => typeof u === 'string' && USER_RX.test(u);
const validPass = p => typeof p === 'string' && p.length === 8;
const sign = u => jwt.sign({ u }, JWT_SECRET, { expiresIn: '90d' });

const app = express();
app.set('trust proxy', 1);
app.use(helmet());
const origins = (process.env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
app.use(cors({ origin: (o, cb) => cb(null, !o || !origins.length || origins.includes(o)), methods: ['GET', 'POST', 'PUT', 'OPTIONS'] }));
app.use(express.json({ limit: '4mb' }));
app.use(async (req, res, next) => { try { await init(); next(); } catch (e) { console.error(e); res.status(500).json({ error: 'Database unavailable' }); } });

const authLimit = rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: true, legacyHeaders: false, message: { error: 'Too many attempts. Try again in a few minutes.' } });
const wrap = f => (req, res) => f(req, res).catch(e => { console.error(e); res.status(500).json({ error: 'Server error' }); });
const need = (req, res, next) => {
  const h = req.headers.authorization || '';
  try { req.user = jwt.verify(h.replace(/^Bearer /, ''), JWT_SECRET).u; next(); } catch (e) { res.status(401).json({ error: 'Please sign in again.' }); }
};

app.get('/', (req, res) => res.json({ ok: true, service: 'projukti-backend' }));
app.get('/api/health', (req, res) => res.json({ ok: true }));

/* ---------- auth ---------- */
app.post('/api/auth/register', authLimit, wrap(async (req, res) => {
  const { username, password, displayName, recoveryQuestion, recoveryAnswer } = req.body || {};
  if (!validUser(username)) return res.status(400).json({ error: 'Username must be 8 letters/numbers with 1 capital, 1 small letter and 1 number, then @olc.com.' });
  if (!validPass(password)) return res.status(400).json({ error: 'Password must be exactly 8 characters.' });
  if (!recoveryQuestion || !recoveryAnswer || String(recoveryAnswer).trim().length < 2) return res.status(400).json({ error: 'A recovery question and answer are required.' });
  const exists = await pool.query(`SELECT 1 FROM ${T} WHERE lower(${C.user}) = lower($1)`, [username]);
  if (exists.rowCount) return res.status(409).json({ error: 'That username is already taken.' });
  const hash = await bcrypt.hash(password, 10), rh = await bcrypt.hash(String(recoveryAnswer).trim().toLowerCase(), 10);
  await pool.query(`INSERT INTO ${T} (${C.user}, ${C.hash}, ${C.display}, ${C.rq}, ${C.rh}) VALUES ($1,$2,$3,$4,$5)`, [username, hash, String(displayName || '').slice(0, 60), String(recoveryQuestion).slice(0, 200), rh]);
  res.json({ token: sign(username), username });
}));

app.post('/api/auth/login', authLimit, wrap(async (req, res) => {
  const { username, password } = req.body || {};
  if (typeof username !== 'string' || typeof password !== 'string') return res.status(400).json({ error: 'Enter username and password.' });
  const r = await pool.query(`SELECT ${C.user} AS u, ${C.hash} AS h FROM ${T} WHERE lower(${C.user}) = lower($1)`, [username]);
  const row = r.rows[0];
  if (!row || !(await verifyPassword(password, row.h))) return res.status(401).json({ error: 'Wrong username or password.' });
  res.json({ token: sign(row.u), username: row.u });
}));
/* If OLC stores hashes differently (e.g. sha256), change ONLY this function. */
async function verifyPassword(plain, stored) { try { return await bcrypt.compare(plain, stored); } catch (e) { return false; } }

app.get('/api/auth/question', authLimit, wrap(async (req, res) => {
  const r = await pool.query(`SELECT ${C.rq} AS q FROM ${T} WHERE lower(${C.user}) = lower($1)`, [String(req.query.username || '')]);
  if (!r.rows[0] || !r.rows[0].q) return res.status(404).json({ error: 'No recovery question found for that account.' });
  res.json({ question: r.rows[0].q });
}));
app.post('/api/auth/recover', authLimit, wrap(async (req, res) => {
  const { username, answer, newPassword } = req.body || {};
  if (!validPass(newPassword)) return res.status(400).json({ error: 'New password must be exactly 8 characters.' });
  const r = await pool.query(`SELECT ${C.user} AS u, ${C.rh} AS rh FROM ${T} WHERE lower(${C.user}) = lower($1)`, [String(username || '')]);
  const row = r.rows[0];
  if (!row || !row.rh || !(await bcrypt.compare(String(answer || '').trim().toLowerCase(), row.rh))) return res.status(401).json({ error: 'That answer is not correct.' });
  await pool.query(`UPDATE ${T} SET ${C.hash} = $1 WHERE ${C.user} = $2`, [await bcrypt.hash(newPassword, 10), row.u]);
  res.json({ token: sign(row.u), username: row.u });
}));

/* ---------- profile ---------- */
app.get('/api/me', need, wrap(async (req, res) => {
  const r = await pool.query(`SELECT ${C.user} AS u, ${C.avatar} AS a, ${C.display} AS d FROM ${T} WHERE ${C.user} = $1`, [req.user]);
  if (!r.rows[0]) return res.status(404).json({ error: 'Account not found.' });
  res.json({ username: r.rows[0].u, avatar: r.rows[0].a || '', displayName: r.rows[0].d || '' });
}));
app.put('/api/me', need, wrap(async (req, res) => {
  const { avatar, displayName } = req.body || {};
  if (avatar !== undefined) {
    if (typeof avatar !== 'string' || avatar.length > 400000 || (avatar && !/^data:image\/(jpeg|png|webp);base64,/.test(avatar))) return res.status(400).json({ error: 'Invalid image.' });
    await pool.query(`UPDATE ${T} SET ${C.avatar} = $1 WHERE ${C.user} = $2`, [avatar, req.user]);
  }
  if (displayName !== undefined) await pool.query(`UPDATE ${T} SET ${C.display} = $1 WHERE ${C.user} = $2`, [String(displayName).slice(0, 60), req.user]);
  res.json({ ok: true });
}));

/* ---------- sync: whole-document, optimistic revision, 20 backups ---------- */
const APP = 'projukti';
app.get('/api/sync', need, wrap(async (req, res) => {
  const r = await pool.query('SELECT data, rev FROM app_data WHERE username = $1 AND app = $2', [req.user, APP]);
  res.json(r.rows[0] ? { data: r.rows[0].data, rev: r.rows[0].rev } : { data: null, rev: 0 });
}));
app.put('/api/sync', need, wrap(async (req, res) => {
  const { data, baseRev } = req.body || {};
  if (!data || typeof data !== 'object' || !Array.isArray(data.subjects)) return res.status(400).json({ error: 'Invalid data.' });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const cur = await client.query('SELECT data, rev FROM app_data WHERE username = $1 AND app = $2 FOR UPDATE', [req.user, APP]);
    const rev = cur.rows[0] ? cur.rows[0].rev : 0;
    if (rev !== (baseRev || 0)) { await client.query('ROLLBACK'); return res.status(409).json({ error: 'Newer version on server', rev, data: cur.rows[0].data }); }
    if (cur.rows[0]) {
      await client.query('INSERT INTO app_data_history (username, app, rev, data) VALUES ($1,$2,$3,$4)', [req.user, APP, rev, cur.rows[0].data]);
      await client.query('DELETE FROM app_data_history WHERE username=$1 AND app=$2 AND id NOT IN (SELECT id FROM app_data_history WHERE username=$1 AND app=$2 ORDER BY id DESC LIMIT 20)', [req.user, APP]);
    }
    await client.query(`INSERT INTO app_data (username, app, data, rev) VALUES ($1,$2,$3,$4)
      ON CONFLICT (username, app) DO UPDATE SET data = EXCLUDED.data, rev = EXCLUDED.rev, updated_at = now()`, [req.user, APP, JSON.stringify(data), rev + 1]);
    await client.query('COMMIT');
    res.json({ rev: rev + 1 });
  } catch (e) { await client.query('ROLLBACK').catch(() => { }); throw e; } finally { client.release(); }
}));

/* ---------- shared XP (one ledger for OLC + PROJUKTI, idempotent per key) ---------- */
app.post('/api/xp', need, wrap(async (req, res) => {
  const list = Array.isArray(req.body && req.body.entries) ? req.body.entries.slice(0, 1000) : [];
  const source = /^[a-z0-9_-]{2,20}$/.test((req.body && req.body.source) || '') ? req.body.source : APP;
  let added = 0;
  for (const e of list) {
    if (!e || typeof e.key !== 'string' || !Number.isFinite(e.xp) || e.xp < 0 || e.xp > 5000) continue;
    const r = await pool.query('INSERT INTO olc_xp_events (username, source, key, xp, label, day, ts) VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT DO NOTHING',
      [req.user, source, e.key.slice(0, 120), Math.round(e.xp), String(e.label || '').slice(0, 120), String(e.day || '').slice(0, 10), Number(e.ts) || Date.now()]);
    added += r.rowCount;
  }
  res.json({ added });
}));
app.get('/api/xp', need, wrap(async (req, res) => {
  const r = await pool.query('SELECT source, COALESCE(SUM(xp),0)::int AS xp FROM olc_xp_events WHERE username = $1 GROUP BY source', [req.user]);
  const bySource = {}; let total = 0; r.rows.forEach(x => { bySource[x.source] = x.xp; total += x.xp; });
  res.json({ total, bySource });
}));

app.use((req, res) => res.status(404).json({ error: 'Not found' }));
module.exports = app;
if (require.main === module) { const port = process.env.PORT || 3000; app.listen(port, () => console.log('PROJUKTI backend on :' + port)); }
