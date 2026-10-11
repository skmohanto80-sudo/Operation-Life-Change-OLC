/**
 * OLC — Operation Life Change — Backend v2
 * Accounts (username@olc.com + password + recovery code), per-device sessions,
 * and SAFE cloud sync of each account's data (PostgreSQL).
 *
 * Safety rules built in so data is never silently erased:
 *  - states are only replaced if the client saw the latest server version (compare-and-set)
 *  - a "blank" state can never overwrite a populated one
 *  - automatic server-side backups of every account's data (restorable)
 */
const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const { init } = require('./db');

const PORT = process.env.PORT || 4000;
const ADMIN_KEY = process.env.OLC_ADMIN_KEY || '';
const VERSION = '2.0.0';

/* ---------------- validation (mirrored in frontend/auth.js) ---------------- */
const SUFFIX = '@olc.com';
function normalizeUsername(raw) {
  let u = String(raw || '').trim();
  if (!u) return '';
  if (!u.includes('@')) u += SUFFIX;
  const at = u.lastIndexOf('@');
  return u.slice(0, at) + u.slice(at).toLowerCase();
}
function usernameError(u) {
  if (!u.toLowerCase().endsWith(SUFFIX)) return 'Username must end with @olc.com';
  const local = u.slice(0, -SUFFIX.length);
  if (!/^[A-Za-z0-9]+$/.test(local)) return 'Before @olc.com use only letters and numbers';
  if (local.length !== 8) return 'Username must be exactly 8 characters before @olc.com';
  if (!/[A-Z]/.test(local)) return 'Username needs at least 1 capital letter';
  if (!/[a-z]/.test(local)) return 'Username needs at least 1 small letter';
  if (!/[0-9]/.test(local)) return 'Username needs at least 1 number';
  return null;
}
function passwordError(p) {
  if (typeof p !== 'string' || p.length < 8) return 'Password must be at least 8 characters';
  if (p.length > 128) return 'Password is too long (max 128)';
  return null;
}

/* ---------------- crypto helpers ---------------- */
const scrypt = (secret, salt) => new Promise((res, rej) =>
  crypto.scrypt(secret, salt, 32, { N: 16384, r: 8, p: 1 }, (e, k) => (e ? rej(e) : res(k))));
async function hashSecret(secret) {
  const salt = crypto.randomBytes(16);
  const key = await scrypt(secret, salt);
  return salt.toString('hex') + ':' + key.toString('hex');
}
async function verifySecret(secret, stored) {
  try {
    const [saltHex, keyHex] = String(stored).split(':');
    const key = await scrypt(secret, Buffer.from(saltHex, 'hex'));
    const want = Buffer.from(keyHex, 'hex');
    return want.length === key.length && crypto.timingSafeEqual(want, key);
  } catch (e) { return false; }
}
const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');
const rid = (p) => p + '_' + crypto.randomBytes(9).toString('base64url');
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function newRecoveryCode() {
  const b = crypto.randomBytes(12);
  let s = '';
  for (let i = 0; i < 12; i++) s += ALPHABET[b[i] % ALPHABET.length];
  return s.match(/.{4}/g).join('-');
}
const normRecovery = (c) => String(c || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

/* ---------------- tiny rate limiter ---------------- */
const hits = new Map();
function limited(key, max, windowMs) {
  const now = Date.now();
  let h = hits.get(key);
  if (!h || h.reset < now) h = { n: 0, reset: now + windowMs };
  h.n++;
  hits.set(key, h);
  return h.n > max;
}
setInterval(() => { const now = Date.now(); for (const [k, v] of hits) if (v.reset < now) hits.delete(k); }, 60000).unref();

/* ---------------- state helpers ---------------- */
function dayHasData(d) {
  if (!d || typeof d !== 'object') return false;
  if (d.items && Object.keys(d.items).length) return true;
  if (d.ratings && Object.values(d.ratings).some(v => v)) return true;
  if (d.wokeOnTime || d.readingDone || d.waterL > 0) return true;
  if (d.screen && (d.screen.totalMin > 0 || (d.screen.devices && d.screen.devices.length))) return true;
  if (d.planner && Object.values(d.planner).some(v => v)) return true;
  if (d.eod && Object.values(d.eod).some(v => v)) return true;
  return false;
}
function stateWeight(s) {
  if (!s || typeof s !== 'object') return 0;
  let w = 0;
  if (typeof s.xp === 'number' && s.xp !== 0) w += 1;
  if (s.dailyLogs) for (const k of Object.keys(s.dailyLogs)) if (dayHasData(s.dailyLogs[k])) w++;
  if (s.trackerLogs) for (const k of Object.keys(s.trackerLogs)) w += (s.trackerLogs[k] || []).length;
  if (s.customMedals) w += s.customMedals.length;
  if (s.customBadges) w += s.customBadges.length;
  if (s.achievements) w += s.achievements.length;
  if (s.profile && (s.profile.name || s.profile.photo)) w += 1;
  return w;
}
const safeParse = (t) => { try { return JSON.parse(t); } catch (e) { return null; } };

async function main() {
  const db = await init();
  const fp = (secret) => crypto.createHmac('sha256', db.pepper).update(String(secret)).digest('hex');

  const app = express();
  app.set('trust proxy', 1);
  app.use(cors());
  app.use(express.json({ limit: '25mb' }));

  const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
  const fail = (res, status, error, extra) => res.status(status).json(Object.assign({ error }, extra || {}));

  const userOut = (u) => ({ id: u.id, username: u.username, avatar: u.avatar || null, createdAt: Number(u.created_at) });

  async function newSession(userId, device) {
    const token = crypto.randomBytes(32).toString('base64url');
    const now = Date.now();
    await db.query(
      `INSERT INTO sessions (id, user_id, token_hash, device, created_at, last_seen) VALUES ($1,$2,$3,$4,$5,$6)`,
      [rid('s'), userId, sha256(token), String(device || 'Unknown device').slice(0, 80), now, now]
    );
    return token;
  }
  async function stateOut(userId) {
    const r = await db.query(`SELECT data, updated_at, version FROM states WHERE user_id=$1`, [userId]);
    if (!r.rows.length) return { state: null, updatedAt: 0 };
    return { state: safeParse(r.rows[0].data), updatedAt: Number(r.rows[0].updated_at), version: r.rows[0].version };
  }

  /* ---------- auth middleware ---------- */
  const auth = wrap(async (req, res, next) => {
    const h = req.headers.authorization || '';
    const token = h.startsWith('Bearer ') ? h.slice(7) : '';
    if (!token) return fail(res, 401, 'Not signed in', { code: 'no_token' });
    const r = await db.query(
      `SELECT s.id AS sid, s.last_seen, u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash=$1`,
      [sha256(token)]
    );
    if (!r.rows.length) return fail(res, 401, 'Session expired — please sign in again', { code: 'bad_token' });
    const row = r.rows[0];
    req.user = row;
    req.sessionId = row.sid;
    if (Date.now() - Number(row.last_seen) > 5 * 60 * 1000) {
      db.query(`UPDATE sessions SET last_seen=$1 WHERE id=$2`, [Date.now(), row.sid]).catch(() => {});
    }
    next();
  });

  /* ---------- public ---------- */
  app.get('/', (req, res) => res.type('text').send('OLC backend v' + VERSION + ' is running.'));
  app.get('/api/health', (req, res) => res.json({ ok: true, storage: db.kind, version: VERSION, time: new Date().toISOString() }));

  app.post('/api/register', wrap(async (req, res) => {
    if (limited('reg:' + req.ip, 20, 3600e3)) return fail(res, 429, 'Too many sign-ups from this network. Try again later.');
    const { password, avatar, device } = req.body || {};
    const username = normalizeUsername(req.body && req.body.username);
    const ue = usernameError(username); if (ue) return fail(res, 400, ue, { field: 'username' });
    const pe = passwordError(password); if (pe) return fail(res, 400, pe, { field: 'password' });
    if (avatar && (typeof avatar !== 'string' || !avatar.startsWith('data:image/') || avatar.length > 400000))
      return fail(res, 400, 'Profile picture is invalid or too large', { field: 'avatar' });

    const lc = username.toLowerCase();
    if ((await db.query(`SELECT 1 FROM users WHERE username_lc=$1`, [lc])).rows.length)
      return fail(res, 409, 'This username is already taken — change at least one character.', { field: 'username' });
    const pfp = fp(password);
    if ((await db.query(`SELECT 1 FROM users WHERE pass_fp=$1`, [pfp])).rows.length)
      return fail(res, 409, 'This password is already used by another account — choose a different one.', { field: 'password' });

    const recovery = newRecoveryCode();
    const id = rid('u');
    try {
      await db.query(
        `INSERT INTO users (id, username, username_lc, pass_hash, pass_fp, rec_hash, rec_fp, avatar, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [id, username, lc, await hashSecret(password), pfp, await hashSecret(normRecovery(recovery)), fp(normRecovery(recovery)), avatar || null, Date.now()]
      );
    } catch (e) {
      if (/unique|duplicate/i.test(e.message)) return fail(res, 409, 'That username or password is already in use.');
      throw e;
    }
    const token = await newSession(id, device);
    res.json({ token, user: { id, username, avatar: avatar || null }, recoveryCode: recovery, state: null, updatedAt: 0 });
  }));

  app.post('/api/login', wrap(async (req, res) => {
    const { password, device } = req.body || {};
    const username = normalizeUsername(req.body && req.body.username);
    const key = 'login:' + req.ip + ':' + username.toLowerCase();
    if (limited(key, 10, 15 * 60e3)) return fail(res, 429, 'Too many attempts. Wait 15 minutes, or use "Forgot password".');
    const r = await db.query(`SELECT * FROM users WHERE username_lc=$1`, [username.toLowerCase()]);
    const u = r.rows[0];
    if (!u || typeof password !== 'string' || !(await verifySecret(password, u.pass_hash)))
      return fail(res, 401, 'Wrong username or password');
    hits.delete(key);
    const token = await newSession(u.id, device);
    const st = await stateOut(u.id);
    res.json({ token, user: userOut(u), state: st.state, updatedAt: st.updatedAt });
  }));

  app.post('/api/recover', wrap(async (req, res) => {
    const { recoveryCode, newPassword, device } = req.body || {};
    const username = normalizeUsername(req.body && req.body.username);
    if (limited('rec:' + username.toLowerCase(), 6, 3600e3) || limited('recip:' + req.ip, 20, 3600e3))
      return fail(res, 429, 'Too many recovery attempts. Try again in an hour.');
    const pe = passwordError(newPassword); if (pe) return fail(res, 400, pe, { field: 'password' });
    const r = await db.query(`SELECT * FROM users WHERE username_lc=$1`, [username.toLowerCase()]);
    const u = r.rows[0];
    if (!u || !(await verifySecret(normRecovery(recoveryCode), u.rec_hash)))
      return fail(res, 401, 'Username or recovery code is wrong');
    const pfp = fp(newPassword);
    const clash = await db.query(`SELECT id FROM users WHERE pass_fp=$1`, [pfp]);
    if (clash.rows.length && clash.rows[0].id !== u.id)
      return fail(res, 409, 'This password is already used by another account — choose a different one.', { field: 'password' });
    const recovery = newRecoveryCode();
    await db.query(`UPDATE users SET pass_hash=$1, pass_fp=$2, rec_hash=$3, rec_fp=$4 WHERE id=$5`,
      [await hashSecret(newPassword), pfp, await hashSecret(normRecovery(recovery)), fp(normRecovery(recovery)), u.id]);
    await db.query(`DELETE FROM sessions WHERE user_id=$1`, [u.id]);
    const token = await newSession(u.id, device);
    const st = await stateOut(u.id);
    res.json({ token, user: userOut(u), recoveryCode: recovery, state: st.state, updatedAt: st.updatedAt });
  }));

  /* ---------- signed-in: account ---------- */
  app.get('/api/me', auth, (req, res) => res.json({ user: userOut(req.user) }));

  app.post('/api/logout', auth, wrap(async (req, res) => {
    await db.query(`DELETE FROM sessions WHERE id=$1`, [req.sessionId]);
    res.json({ ok: true });
  }));

  app.put('/api/me/avatar', auth, wrap(async (req, res) => {
    const { avatar } = req.body || {};
    if (avatar !== null && (typeof avatar !== 'string' || !avatar.startsWith('data:image/') || avatar.length > 400000))
      return fail(res, 400, 'Profile picture is invalid or too large');
    await db.query(`UPDATE users SET avatar=$1 WHERE id=$2`, [avatar, req.user.id]);
    res.json({ ok: true });
  }));

  app.post('/api/me/verify', auth, wrap(async (req, res) => {
    if (limited('ver:' + req.user.id, 10, 15 * 60e3)) return fail(res, 429, 'Too many attempts. Try again later.');
    const ok = await verifySecret(String((req.body || {}).password || ''), req.user.pass_hash);
    if (!ok) return fail(res, 401, 'Wrong password');
    res.json({ ok: true });
  }));

  app.post('/api/me/password', auth, wrap(async (req, res) => {
    const { oldPassword, newPassword } = req.body || {};
    if (!(await verifySecret(String(oldPassword || ''), req.user.pass_hash))) return fail(res, 401, 'Current password is wrong');
    const pe = passwordError(newPassword); if (pe) return fail(res, 400, pe, { field: 'password' });
    const pfp = fp(newPassword);
    const clash = await db.query(`SELECT id FROM users WHERE pass_fp=$1`, [pfp]);
    if (clash.rows.length) return fail(res, 409, clash.rows[0].id === req.user.id ? 'New password must be different from the current one.' : 'This password is already used by another account — choose a different one.', { field: 'password' });
    await db.query(`UPDATE users SET pass_hash=$1, pass_fp=$2 WHERE id=$3`, [await hashSecret(newPassword), pfp, req.user.id]);
    await db.query(`DELETE FROM sessions WHERE user_id=$1 AND id<>$2`, [req.user.id, req.sessionId]);
    res.json({ ok: true });
  }));

  app.post('/api/me/recovery', auth, wrap(async (req, res) => {
    if (!(await verifySecret(String((req.body || {}).password || ''), req.user.pass_hash))) return fail(res, 401, 'Wrong password');
    const recovery = newRecoveryCode();
    await db.query(`UPDATE users SET rec_hash=$1, rec_fp=$2 WHERE id=$3`,
      [await hashSecret(normRecovery(recovery)), fp(normRecovery(recovery)), req.user.id]);
    res.json({ recoveryCode: recovery });
  }));

  app.get('/api/sessions', auth, wrap(async (req, res) => {
    const r = await db.query(`SELECT id, device, created_at, last_seen FROM sessions WHERE user_id=$1 ORDER BY last_seen DESC`, [req.user.id]);
    res.json({ sessions: r.rows.map(s => ({ id: s.id, device: s.device, createdAt: Number(s.created_at), lastSeen: Number(s.last_seen), current: s.id === req.sessionId })) });
  }));
  app.delete('/api/sessions/:id', auth, wrap(async (req, res) => {
    await db.query(`DELETE FROM sessions WHERE id=$1 AND user_id=$2`, [req.params.id, req.user.id]);
    res.json({ ok: true });
  }));

  /* ---------- signed-in: data sync ---------- */
  app.get('/api/state', auth, wrap(async (req, res) => {
    const st = await stateOut(req.user.id);
    const since = Number(req.query.since || 0);
    if (since && st.updatedAt && st.updatedAt <= since) return res.json({ unchanged: true, updatedAt: st.updatedAt });
    res.json(st);
  }));

  async function maybeBackup(userId, row, always) {
    const last = await db.query(`SELECT created_at FROM state_backups WHERE user_id=$1 ORDER BY created_at DESC LIMIT 1`, [userId]);
    if (!always && last.rows.length && Date.now() - Number(last.rows[0].created_at) < 6 * 3600e3) return;
    await db.query(`INSERT INTO state_backups (id, user_id, data, state_updated_at, created_at) VALUES ($1,$2,$3,$4,$5)`,
      [rid('b'), userId, row.data, row.updated_at, Date.now()]);
    const old = await db.query(`SELECT id FROM state_backups WHERE user_id=$1 ORDER BY created_at DESC`, [userId]);
    for (const o of old.rows.slice(20)) await db.query(`DELETE FROM state_backups WHERE id=$1`, [o.id]);
  }

  app.put('/api/state', auth, wrap(async (req, res) => {
    const { state, baseUpdatedAt, force } = req.body || {};
    if (!state || typeof state !== 'object' || Array.isArray(state)) return fail(res, 400, 'Invalid data');
    const uid = req.user.id;
    const cur = await db.query(`SELECT data, updated_at FROM states WHERE user_id=$1`, [uid]);
    const text = JSON.stringify(state);
    const base = Number(baseUpdatedAt || 0);

    if (!cur.rows.length) {
      const now = Date.now();
      try {
        await db.query(`INSERT INTO states (user_id, data, updated_at, version) VALUES ($1,$2,$3,1)`, [uid, text, now]);
      } catch (e) {
        const again = await stateOut(uid);
        return fail(res, 409, 'Newer data exists on the server', { code: 'conflict', state: again.state, updatedAt: again.updatedAt });
      }
      return res.json({ ok: true, updatedAt: now });
    }

    const row = cur.rows[0];
    const serverStamp = Number(row.updated_at);
    if (!force && base !== serverStamp) {
      return fail(res, 409, 'Newer data exists on the server', { code: 'conflict', state: safeParse(row.data), updatedAt: serverStamp });
    }
    if (!force) {
      const was = stateWeight(safeParse(row.data)), now = stateWeight(state);
      if (was > 0 && now === 0) return fail(res, 409, 'Refusing to overwrite saved data with an empty state', { code: 'blank', state: safeParse(row.data), updatedAt: serverStamp });
    }
    await maybeBackup(uid, row, !!force);
    const stamp = Math.max(Date.now(), serverStamp + 1);
    const upd = await db.query(`UPDATE states SET data=$1, updated_at=$2, version=version+1 WHERE user_id=$3 AND updated_at=$4`,
      [text, stamp, uid, serverStamp]);
    if (!upd.rowCount && !force) {
      const again = await stateOut(uid);
      return fail(res, 409, 'Newer data exists on the server', { code: 'conflict', state: again.state, updatedAt: again.updatedAt });
    }
    if (!upd.rowCount) await db.query(`UPDATE states SET data=$1, updated_at=$2, version=version+1 WHERE user_id=$3`, [text, stamp, uid]);
    res.json({ ok: true, updatedAt: stamp });
  }));

  app.get('/api/backups', auth, wrap(async (req, res) => {
    const r = await db.query(`SELECT id, state_updated_at, created_at, data FROM state_backups WHERE user_id=$1 ORDER BY created_at DESC LIMIT 20`, [req.user.id]);
    res.json({ backups: r.rows.map(b => ({ id: b.id, stateUpdatedAt: Number(b.state_updated_at), createdAt: Number(b.created_at), bytes: b.data.length })) });
  }));
  app.post('/api/backups/:id/restore', auth, wrap(async (req, res) => {
    const b = await db.query(`SELECT data FROM state_backups WHERE id=$1 AND user_id=$2`, [req.params.id, req.user.id]);
    if (!b.rows.length) return fail(res, 404, 'Backup not found');
    const cur = await db.query(`SELECT data, updated_at FROM states WHERE user_id=$1`, [req.user.id]);
    const stamp = Math.max(Date.now(), cur.rows.length ? Number(cur.rows[0].updated_at) + 1 : 0);
    if (cur.rows.length) {
      await db.query(`INSERT INTO state_backups (id, user_id, data, state_updated_at, created_at) VALUES ($1,$2,$3,$4,$5)`,
        [rid('b'), req.user.id, cur.rows[0].data, cur.rows[0].updated_at, Date.now()]);
      await db.query(`UPDATE states SET data=$1, updated_at=$2, version=version+1 WHERE user_id=$3`, [b.rows[0].data, stamp, req.user.id]);
    } else {
      await db.query(`INSERT INTO states (user_id, data, updated_at, version) VALUES ($1,$2,$3,1)`, [req.user.id, b.rows[0].data, stamp]);
    }
    res.json({ ok: true, state: safeParse(b.rows[0].data), updatedAt: stamp });
  }));

  /* ---------- legacy (old Codename + Code ID) ---------- */
  app.post('/api/legacy/claim', auth, wrap(async (req, res) => {
    const { codename, codeid } = req.body || {};
    const r = await db.query(`SELECT data FROM legacy_accounts WHERE codename=$1 AND codeid=$2`, [String(codename || ''), String(codeid || '')]);
    if (!r.rows.length) return fail(res, 404, 'No old cloud account found with that Codename + Code ID');
    res.json({ state: r.rows[0].data ? safeParse(r.rows[0].data) : null });
  }));

  /* ---------- admin (read-only, needs OLC_ADMIN_KEY) ---------- */
  const admin = (req, res, next) => {
    if (!ADMIN_KEY) return res.status(404).send('Admin viewer disabled (set OLC_ADMIN_KEY to enable).');
    const k = req.query.key || req.headers['x-admin-key'];
    if (k !== ADMIN_KEY) return res.status(401).send('Unauthorized');
    next();
  };
  const h = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  app.get('/api/admin/state/:id', admin, wrap(async (req, res) => res.json((await stateOut(req.params.id)).state)));
  app.get('/admin', admin, wrap(async (req, res) => {
    const r = await db.query(`SELECT u.id, u.username, u.created_at, s.updated_at, s.data FROM users u LEFT JOIN states s ON s.user_id=u.id ORDER BY u.created_at`);
    const rows = r.rows.map(u => {
      const st = u.data ? safeParse(u.data) : null;
      return `<tr><td>${h(u.username)}</td><td>${st ? h(st.xp) : '—'}</td><td>${st && st.dailyLogs ? Object.keys(st.dailyLogs).length : 0}</td>
        <td>${u.data ? Math.round(u.data.length / 1024) + ' KB' : '—'}</td><td>${u.updated_at ? new Date(Number(u.updated_at)).toISOString() : '—'}</td>
        <td><a href="/api/admin/state/${h(u.id)}?key=${encodeURIComponent(req.query.key)}" target="_blank">view JSON</a></td></tr>`;
    }).join('');
    res.send(`<!DOCTYPE html><meta charset="utf-8"><title>OLC Admin</title><style>body{font-family:system-ui;background:#0b0714;color:#f4f1fb;padding:24px}
      table{border-collapse:collapse;width:100%}th,td{border:1px solid #6753b7;padding:8px 12px;text-align:left;font-size:14px}th{background:#1a1226}a{color:#01c4c4}</style>
      <h1>OLC — Admin (read-only)</h1><p>${r.rows.length} account(s) · storage: ${h(db.kind)}</p>
      <table><tr><th>Username</th><th>XP</th><th>Days logged</th><th>Size</th><th>Last saved</th><th></th></tr>${rows || '<tr><td colspan=6>No accounts yet</td></tr>'}</table>`);
  }));

  /* ---------- errors ---------- */
  app.use((req, res) => fail(res, 404, 'Not found'));
  app.use((err, req, res, next) => {
    if (err && err.type === 'entity.too.large') return fail(res, 413, 'Your data is too large to sync (remove some big uploaded images).', { code: 'too_large' });
    if (err && err.type === 'entity.parse.failed') return fail(res, 400, 'Bad request');
    const id = rid('e');
    console.error('[' + id + ']', err);
    fail(res, 500, 'Server error — please try again', { id });
  });

  const server = app.listen(PORT, () => console.log(`OLC backend v${VERSION} on :${PORT} (storage: ${db.kind})`));
  return { app, server, db };
}

if (require.main === module) main().catch((e) => { console.error('Failed to start:', e); process.exit(1); });
module.exports = { main };
