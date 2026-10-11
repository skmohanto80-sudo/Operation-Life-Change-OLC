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
const Merge = require('./merge');

const PORT = process.env.PORT || 4000;
const ADMIN_KEY = process.env.OLC_ADMIN_KEY || '';
const VERSION = '4.0.0';
const CATALOG_EDIT = (process.env.OLC_CATALOG_EDIT || 'anyone').toLowerCase();   // 'anyone' = every account may edit shared items; 'owner' = only the account that created it
const CAT_FIELDS = {
  medal: ['name', 'requirements', 'connection', 'connectionKey', 'target', 'colors', 'why', 'medalImg', 'ribbonImg', 'createdDate'],
  badge: ['name', 'requirements', 'connection', 'connectionKey', 'target', 'colors', 'why', 'badgeImg', 'createdDate'],
  division: ['division', 'name', 'logo', 'flag', 'colors', 'systemTheme', 'durationDays', 'start', 'end', 'mission', 'objective', 'books', 'createdAt'],
  rank: ['xp'],
};
const MAX_CAT_ITEM = 3 * 1024 * 1024;
const MAX_BLOB_BYTES = 40 * 1024 * 1024;
const MAX_USER_BLOB_BYTES = (Number(process.env.OLC_BLOB_QUOTA_MB) || 300) * 1024 * 1024;

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
  if (s.divisions) w += s.divisions.length;
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
  app.use(express.json({ limit: '30mb' }));

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
    return { state: safeParse(r.rows[0].data), updatedAt: Number(r.rows[0].updated_at), version: Number(r.rows[0].version) };
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
    if ((await setting('registration', 'open')) === 'closed') return fail(res, 403, 'New sign-ups are closed on this server. Ask the owner.', { code: 'closed' });
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
    res.json({ token, user: userOut(u), state: st.state, updatedAt: st.updatedAt, v: st.version || 0 });
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
    res.json({ token, user: userOut(u), recoveryCode: recovery, state: st.state, updatedAt: st.updatedAt, v: st.version || 0 });
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

  /* ---------- live updates (so a change on the laptop shows on the phone within a second) ---------- */
  const listeners = new Map();   // userId -> Set(res)
  function broadcast(userId, payload, exceptDevice) {
    const set = listeners.get(userId); if (!set) return;
    const line = 'data: ' + JSON.stringify(payload) + '\n\n';
    for (const r of set) { if (exceptDevice && r.olcDevice === exceptDevice) continue; try { r.write(line); } catch (e) { /* closed */ } }
  }
  function broadcastAll(payload, exceptUser) {
    for (const [uid2, set] of listeners) { if (exceptUser && uid2 === exceptUser) { /* the sender still gets it on its other devices */ } for (const r of set) { try { r.write('data: ' + JSON.stringify(payload) + '\n\n'); } catch (e) {} } }
  }
  app.get('/api/events', auth, (req, res) => {
    res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
    res.flushHeaders && res.flushHeaders();
    res.olcDevice = String(req.query.device || '').slice(0, 40);
    if (!listeners.has(req.user.id)) listeners.set(req.user.id, new Set());
    listeners.get(req.user.id).add(res);
    res.write('retry: 4000\n\ndata: {"hello":1}\n\n');
    const hb = setInterval(() => { try { res.write(': hb\n\n'); } catch (e) {} }, 20000);
    req.on('close', () => { clearInterval(hb); const set = listeners.get(req.user.id); if (set) { set.delete(res); if (!set.size) listeners.delete(req.user.id); } });
  });

  /* ---------- signed-in: data sync (field-by-field merge — nothing is ever replaced wholesale) ---------- */
  app.get('/api/state', auth, wrap(async (req, res) => {          // legacy read (kept so old copies can still read)
    const st = await stateOut(req.user.id);
    res.json(st);
  }));
  app.put('/api/state', auth, (req, res) => fail(res, 426, 'This copy of OLC is out of date. Close the app completely and open it again to update.', { code: 'update_required' }));

  app.get('/api/sync', auth, wrap(async (req, res) => {
    const r = await db.query(`SELECT data, version FROM states WHERE user_id=$1`, [req.user.id]);
    if (!r.rows.length) return res.json({ state: null, v: 0, t: Date.now() });
    const row = r.rows[0], v = Number(row.version);
    if (Number(req.query.v || 0) === v) return res.json({ unchanged: true, v, t: Date.now() });
    res.json({ state: safeParse(row.data), v, t: Date.now() });
  }));

  async function maybeBackup(userId, row, always) {
    const last = await db.query(`SELECT created_at FROM state_backups WHERE user_id=$1 ORDER BY created_at DESC LIMIT 1`, [userId]);
    if (!always && last.rows.length && Date.now() - Number(last.rows[0].created_at) < 6 * 3600e3) return;
    await db.query(`INSERT INTO state_backups (id, user_id, data, state_updated_at, created_at) VALUES ($1,$2,$3,$4,$5)`,
      [rid('b'), userId, row.data, row.updated_at, Date.now()]);
    const old = await db.query(`SELECT id FROM state_backups WHERE user_id=$1 ORDER BY created_at DESC`, [userId]);
    for (const o of old.rows.slice(20)) await db.query(`DELETE FROM state_backups WHERE id=$1`, [o.id]);
  }

  app.post('/api/sync', auth, wrap(async (req, res) => {
    const { state, device } = req.body || {};
    if (!state || typeof state !== 'object' || Array.isArray(state)) return fail(res, 400, 'Invalid data');
    const uid = req.user.id;
    for (let attempt = 0; attempt < 8; attempt++) {
      const cur = await db.query(`SELECT data, updated_at, version FROM states WHERE user_id=$1`, [uid]);
      if (!cur.rows.length) {
        const first = Merge.merge({}, state).state, now = Date.now();
        try {
          await db.query(`INSERT INTO states (user_id, data, updated_at, version) VALUES ($1,$2,$3,1)`, [uid, JSON.stringify(first), now]);
        } catch (e) { continue; }                      // someone else created it first -> merge with theirs
        broadcast(uid, { v: 1, from: device || '' }, device);
        return res.json({ ok: true, v: 1, t: now });
      }
      const row = cur.rows[0], curState = safeParse(row.data) || {};
      // a device still running the old (v9) code would send data without field stamps: refuse so it cannot overwrite newer data
      if (curState._m && !state._m && Object.keys(state).length) return fail(res, 426, 'This copy of OLC is out of date. Close the app completely and open it again to update.', { code: 'update_required' });
      const r = Merge.merge(curState, state);
      const rowV = Number(row.version);
      if (!r.fromB) {                                   // nothing new from this device
        return res.json({ ok: true, v: rowV, t: Date.now(), state: r.fromA ? r.state : undefined });
      }
      await maybeBackup(uid, row, false);
      const stamp = Math.max(Date.now(), Number(row.updated_at) + 1);
      const upd = await db.query(`UPDATE states SET data=$1, updated_at=$2, version=version+1 WHERE user_id=$3 AND version=$4`,
        [JSON.stringify(r.state), stamp, uid, rowV]);
      if (!upd.rowCount) continue;                      // another device wrote at the same moment -> re-merge
      broadcast(uid, { v: rowV + 1, from: device || '' }, device);
      return res.json({ ok: true, v: rowV + 1, t: Date.now(), state: r.fromA ? r.state : undefined });
    }
    fail(res, 503, 'Server is busy — your data is safe on this device, it will retry');
  }));

  /* ---------- big files (images, PDFs) kept apart from the data so syncing stays fast ---------- */
  const okId = (id) => /^[A-Za-z0-9_-]{6,80}$/.test(String(id || ''));
  app.put('/api/blobs/:id', auth, express.raw({ type: () => true, limit: MAX_BLOB_BYTES }), wrap(async (req, res) => {
    if (!okId(req.params.id)) return fail(res, 400, 'Bad file id');
    const buf = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
    if (!buf.length) return fail(res, 400, 'Empty file');
    const mime = String(req.query.m || 'application/octet-stream').slice(0, 80).replace(/[^A-Za-z0-9.+\-\/]/g, '');
    const have = await db.query(`SELECT 1 FROM blobs WHERE id=$1`, [req.params.id]);       // files are named by their content, so they are shared between accounts
    if (have.rows.length) return res.json({ ok: true, existed: true });
    const used = await db.query(`SELECT COALESCE(SUM(size),0) AS n FROM blobs WHERE user_id=$1`, [req.user.id]);
    if (Number(used.rows[0].n) + buf.length > MAX_USER_BLOB_BYTES) return fail(res, 413, 'Cloud file storage is full', { code: 'quota' });
    await db.query(`INSERT INTO blobs (user_id, id, mime, size, data, created_at) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (user_id, id) DO NOTHING`,
      [req.user.id, req.params.id, mime, buf.length, buf, Date.now()]);
    res.json({ ok: true });
  }));
  app.get('/api/blobs/:id', auth, wrap(async (req, res) => {
    if (!okId(req.params.id)) return fail(res, 400, 'Bad file id');
    const r = await db.query(`SELECT mime, data FROM blobs WHERE id=$1 LIMIT 1`, [req.params.id]);
    if (!r.rows.length) return fail(res, 404, 'File not found');
    res.set({ 'Content-Type': r.rows[0].mime, 'Cache-Control': 'private, max-age=31536000, immutable' });
    res.send(Buffer.from(r.rows[0].data));
  }));
  app.post('/api/blobs/have', auth, wrap(async (req, res) => {
    const ids = ((req.body || {}).ids || []).filter(okId).slice(0, 200);
    if (!ids.length) return res.json({ have: [] });
    const ph = ids.map((_, i) => '$' + (i + 1)).join(',');
    const r = await db.query(`SELECT DISTINCT id FROM blobs WHERE id IN (${ph})`, ids);
    res.json({ have: r.rows.map((x) => x.id) });
  }));

  app.get('/api/backups', auth, wrap(async (req, res) => {
    const r = await db.query(`SELECT id, state_updated_at, created_at, data FROM state_backups WHERE user_id=$1 ORDER BY created_at DESC LIMIT 20`, [req.user.id]);
    res.json({ backups: r.rows.map(b => ({ id: b.id, stateUpdatedAt: Number(b.state_updated_at), createdAt: Number(b.created_at), bytes: b.data.length })) });
  }));
  // Restoring is done by the app: it loads this copy as a NEW edit (stamped "now") so every device follows it.
  app.post('/api/backups/:id/restore', auth, wrap(async (req, res) => {
    const b = await db.query(`SELECT data FROM state_backups WHERE id=$1 AND user_id=$2`, [req.params.id, req.user.id]);
    if (!b.rows.length) return fail(res, 404, 'Backup not found');
    res.json({ ok: true, state: safeParse(b.rows[0].data) });
  }));

  /* ---------- legacy (old Codename + Code ID) ---------- */
  app.post('/api/legacy/claim', auth, wrap(async (req, res) => {
    const { codename, codeid } = req.body || {};
    const r = await db.query(`SELECT data FROM legacy_accounts WHERE codename=$1 AND codeid=$2`, [String(codename || ''), String(codeid || '')]);
    if (!r.rows.length) return fail(res, 404, 'No old cloud account found with that Codename + Code ID');
    res.json({ state: r.rows[0].data ? safeParse(r.rows[0].data) : null });
  }));

  /* ---------- SHARED CATALOG: medals, badges and divisions are shared by every account; progress and ON/OFF stay per account ---------- */
  let catLast = 0;
  async function catStamp() {
    if (!catLast) { const m = await db.query(`SELECT MAX(updated_at) AS m FROM catalog`); catLast = Number(m.rows[0] && m.rows[0].m) || 0; }
    catLast = Math.max(Date.now(), catLast + 1); return catLast;
  }
  const okCatId = (id) => /^[A-Za-z0-9_-]{4,80}$/.test(String(id || ''));
  function catClean(kind, data) {
    const out = {}; const src = data && typeof data === 'object' ? data : {};
    for (const k of CAT_FIELDS[kind]) if (src[k] !== undefined && src[k] !== null) out[k] = src[k];
    return out;
  }
  app.get('/api/catalog', auth, wrap(async (req, res) => {
    const since = Number(req.query.since || 0) || 0;
    const r = await db.query(`SELECT kind, id, data, edited_at, updated_at, deleted FROM catalog WHERE updated_at > $1 ORDER BY updated_at`, [since]);
    const items = r.rows.map((x) => ({ kind: x.kind, id: x.id, at: Number(x.edited_at), u: Number(x.updated_at), deleted: !!Number(x.deleted), data: Number(x.deleted) ? null : safeParse(x.data) }));
    res.json({ items, max: items.length ? items[items.length - 1].u : since, t: Date.now() });
  }));
  app.post('/api/catalog', auth, wrap(async (req, res) => {
    const body = req.body || {}, items = Array.isArray(body.items) ? body.items.slice(0, 100) : [], dels = Array.isArray(body.deletes) ? body.deletes.slice(0, 100) : [];
    const accepted = [], rejected = []; let changed = false;
    const apply = async (kind, id, at, data, del) => {
      if (!CAT_FIELDS[kind] || !okCatId(id)) { rejected.push({ kind, id, why: 'bad item' }); return; }
      at = Number(at) || Date.now();
      let text = '{}';
      if (!del) { text = JSON.stringify(catClean(kind, data)); if (text.length > MAX_CAT_ITEM) { rejected.push({ kind, id, why: 'too large' }); return; } }
      const ex = (await db.query(`SELECT owner, edited_at, deleted FROM catalog WHERE kind=$1 AND id=$2`, [kind, id])).rows[0];
      if (ex && Number(ex.edited_at) > at) { rejected.push({ kind, id, why: 'newer' }); return; }
      if (ex && CATALOG_EDIT === 'owner' && ex.owner && ex.owner !== req.user.id) { rejected.push({ kind, id, why: 'not yours' }); return; }
      const u = await catStamp();
      if (ex) await db.query(`UPDATE catalog SET data=$1, edited_at=$2, updated_at=$3, deleted=$4 WHERE kind=$5 AND id=$6`, [text, at, u, del ? 1 : 0, kind, id]);
      else await db.query(`INSERT INTO catalog (kind, id, data, owner, edited_at, updated_at, deleted) VALUES ($1,$2,$3,$4,$5,$6,$7)`, [kind, id, text, req.user.id, at, u, del ? 1 : 0]);
      accepted.push({ kind, id, at, u }); changed = true;
    };
    for (const it of items) if (it) await apply(String(it.kind), String(it.id), it.at, it.data, false);
    for (const it of dels) if (it) await apply(String(it.kind), String(it.id), it.at, null, true);
    if (changed) broadcastAll({ cat: 1 });
    res.json({ ok: true, accepted, rejected, t: Date.now() });
  }));

  /* ---------- ADMIN: see every account and control the backend (needs OLC_ADMIN_KEY; the page itself is at /admin) ---------- */
  const setting = async (k, d) => { const r = await db.query(`SELECT v FROM meta WHERE k=$1`, ['set:' + k]); return r.rows.length ? r.rows[0].v : d; };
  const setSetting = async (k, v) => { const ex = await db.query(`SELECT 1 FROM meta WHERE k=$1`, ['set:' + k]); if (ex.rows.length) await db.query(`UPDATE meta SET v=$1 WHERE k=$2`, [String(v), 'set:' + k]); else await db.query(`INSERT INTO meta (k, v) VALUES ($1,$2)`, ['set:' + k, String(v)]); };
  const admFails = new Map();
  const admin = (req, res, next) => {
    if (!ADMIN_KEY) return fail(res, 404, 'Admin is switched off. Set the environment variable OLC_ADMIN_KEY on your server to turn it on.', { code: 'admin_off' });
    const fh = admFails.get(req.ip); if (fh && fh.reset > Date.now() && fh.n >= 20) return fail(res, 429, 'Too many wrong attempts. Wait 10 minutes.');
    const k = String(req.headers['x-admin-key'] || '');
    const a = Buffer.from(k), b = Buffer.from(ADMIN_KEY);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) { const h0 = admFails.get(req.ip); admFails.set(req.ip, !h0 || h0.reset < Date.now() ? { n: 1, reset: Date.now() + 10 * 60e3 } : { n: h0.n + 1, reset: h0.reset }); return fail(res, 401, 'Wrong admin key', { code: 'bad_key' }); }
    next();
  };
  app.get('/admin', (req, res) => res.sendFile(require('path').join(__dirname, 'admin.html')));
  app.get('/api/admin/overview', admin, wrap(async (req, res) => {
    const n = async (q) => Number(((await db.query(q)).rows[0] || {}).n) || 0;
    res.json({ version: VERSION, storage: db.kind, uptimeMin: Math.round(process.uptime() / 60), users: await n(`SELECT COUNT(*) AS n FROM users`), sessions: await n(`SELECT COUNT(*) AS n FROM sessions`),
      stateKB: Math.round((await db.query(`SELECT data FROM states`)).rows.reduce((a, r) => a + String(r.data == null ? '' : typeof r.data === 'string' ? r.data : JSON.stringify(r.data)).length, 0) / 1024), blobs: await n(`SELECT COUNT(*) AS n FROM blobs`), blobMB: +(await n(`SELECT COALESCE(SUM(size),0) AS n FROM blobs`) / 1048576).toFixed(1),
      catalog: await n(`SELECT COUNT(*) AS n FROM catalog WHERE deleted=0`), registration: await setting('registration', 'open'), catalogEdit: CATALOG_EDIT, live: [...listeners.values()].reduce((a, s) => a + s.size, 0) });
  }));
  app.get('/api/admin/users', admin, wrap(async (req, res) => {
    const r = await db.query(`SELECT u.id, u.username, u.created_at, s.updated_at, s.data FROM users u LEFT JOIN states s ON s.user_id=u.id ORDER BY u.created_at`);
    const ss = (await db.query(`SELECT user_id, COUNT(*) AS c, MAX(last_seen) AS m FROM sessions GROUP BY user_id`)).rows, sm = Object.fromEntries(ss.map((x) => [x.user_id, x]));
    const bl = (await db.query(`SELECT user_id, COALESCE(SUM(size),0) AS b FROM blobs GROUP BY user_id`)).rows, bm = Object.fromEntries(bl.map((x) => [x.user_id, Number(x.b)]));
    res.json({ users: r.rows.map((u) => { const st = u.data ? safeParse(u.data) : null; const se = sm[u.id];
      return { id: u.id, username: u.username, createdAt: Number(u.created_at), lastSaved: u.updated_at ? Number(u.updated_at) : null, lastSeen: se ? Number(se.m) : null, devices: se ? Number(se.c) : 0,
        xp: st ? Number(st.xp) || 0 : 0, daysLogged: st && st.dailyLogs ? Object.keys(st.dailyLogs).length : 0, stateKB: u.data ? Math.round(u.data.length / 1024) : 0, fileMB: +((bm[u.id] || 0) / 1048576).toFixed(2), codename: st && st.profile ? (st.profile.codename || st.profile.name || '') : '' }; }) });
  }));
  app.get('/api/admin/users/:id', admin, wrap(async (req, res) => {
    const u = (await db.query(`SELECT id, username, created_at, avatar FROM users WHERE id=$1`, [req.params.id])).rows[0]; if (!u) return fail(res, 404, 'No such account');
    const st = (await stateOut(u.id)).state || {};
    const sessions = (await db.query(`SELECT id, device, created_at, last_seen FROM sessions WHERE user_id=$1 ORDER BY last_seen DESC`, [u.id])).rows.map((x) => ({ id: x.id, device: x.device, createdAt: Number(x.created_at), lastSeen: Number(x.last_seen) }));
    const backups = (await db.query(`SELECT id, created_at, data FROM state_backups WHERE user_id=$1 ORDER BY created_at DESC`, [u.id])).rows.map((x) => ({ id: x.id, createdAt: Number(x.created_at), kb: Math.round(String(typeof x.data === 'string' ? x.data : JSON.stringify(x.data || '')).length / 1024) }));
    const act = (st.divisions || []).find((d) => d.id === st.activeDivisionId);
    res.json({ id: u.id, username: u.username, avatar: u.avatar || null, createdAt: Number(u.created_at), sessions, backups,
      summary: { codename: (st.profile && (st.profile.codename || st.profile.name)) || '', xp: Number(st.xp) || 0, daysLogged: Object.keys(st.dailyLogs || {}).length, achievements: (st.achievements || []).length, goals: (st.goals || []).length, activeDivision: act ? (act.name || act.division) : null } });
  }));
  app.get('/api/admin/users/:id/state', admin, wrap(async (req, res) => { const st = await stateOut(req.params.id); res.set('Content-Disposition', 'attachment; filename="olc-' + String(req.params.id).replace(/[^\w-]/g, '') + '.json"'); res.json(st.state || {}); }));
  app.post('/api/admin/users/:id/reset-password', admin, wrap(async (req, res) => {
    const u = (await db.query(`SELECT id FROM users WHERE id=$1`, [req.params.id])).rows[0]; if (!u) return fail(res, 404, 'No such account');
    let pw = String((req.body && req.body.newPassword) || '');
    if (pw) { const pe = passwordError(pw); if (pe) return fail(res, 400, pe); }
    else { const al = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'; for (let t = 0; t < 20; t++) { pw = Array.from(crypto.randomBytes(10), (b) => al[b % al.length]).join(''); if (!passwordError(pw) && !(await db.query(`SELECT 1 FROM users WHERE pass_fp=$1`, [fp(pw)])).rows.length) break; } }
    if ((await db.query(`SELECT id FROM users WHERE pass_fp=$1 AND id<>$2`, [fp(pw), u.id])).rows.length) return fail(res, 409, 'That password is used by another account');
    const recovery = newRecoveryCode();
    await db.query(`UPDATE users SET pass_hash=$1, pass_fp=$2, rec_hash=$3, rec_fp=$4 WHERE id=$5`, [await hashSecret(pw), fp(pw), await hashSecret(normRecovery(recovery)), fp(normRecovery(recovery)), u.id]);
    await db.query(`DELETE FROM sessions WHERE user_id=$1`, [u.id]);
    res.json({ ok: true, newPassword: pw, recoveryCode: recovery });
  }));
  app.post('/api/admin/users/:id/signout-all', admin, wrap(async (req, res) => { await db.query(`DELETE FROM sessions WHERE user_id=$1`, [req.params.id]); res.json({ ok: true }); }));
  app.post('/api/admin/users/:id/restore/:bid', admin, wrap(async (req, res) => {
    const b = (await db.query(`SELECT data FROM state_backups WHERE id=$1 AND user_id=$2`, [req.params.bid, req.params.id])).rows[0]; if (!b) return fail(res, 404, 'Backup not found');
    const cur = (await db.query(`SELECT data, updated_at, version FROM states WHERE user_id=$1`, [req.params.id])).rows[0];
    if (cur) await maybeBackup(req.params.id, cur, true);
    const stamp = Math.max(Date.now(), cur ? Number(cur.updated_at) + 1 : 0);
    if (cur) await db.query(`UPDATE states SET data=$1, updated_at=$2, version=version+1 WHERE user_id=$3`, [b.data, stamp, req.params.id]);
    else await db.query(`INSERT INTO states (user_id, data, updated_at, version) VALUES ($1,$2,$3,1)`, [req.params.id, b.data, stamp]);
    res.json({ ok: true, note: 'Restored on the server. Devices keep their own newer edits when they merge — to force the restore everywhere, sign the account out of its devices.' });
  }));
  app.delete('/api/admin/users/:id', admin, wrap(async (req, res) => {
    const u = (await db.query(`SELECT username FROM users WHERE id=$1`, [req.params.id])).rows[0]; if (!u) return fail(res, 404, 'No such account');
    if (String((req.body || {}).confirm || '').toLowerCase() !== u.username.toLowerCase()) return fail(res, 400, 'Type the exact username to confirm deleting it.');
    for (const t of ['sessions', 'states', 'state_backups', 'blobs']) await db.query(`DELETE FROM ${t} WHERE user_id=$1`, [req.params.id]);
    await db.query(`DELETE FROM users WHERE id=$1`, [req.params.id]);
    res.json({ ok: true });
  }));
  app.get('/api/admin/catalog', admin, wrap(async (req, res) => {
    const r = await db.query(`SELECT c.kind, c.id, c.data, c.owner, c.edited_at, c.deleted, u.username FROM catalog c LEFT JOIN users u ON u.id=c.owner ORDER BY c.updated_at DESC`);
    res.json({ items: r.rows.map((x) => { const d = Number(x.deleted) ? {} : safeParse(x.data) || {}; return { kind: x.kind, id: x.id, name: d.name || '', division: d.division || '', owner: x.username || '', editedAt: Number(x.edited_at), deleted: !!Number(x.deleted) }; }) });
  }));
  app.delete('/api/admin/catalog/:kind/:id', admin, wrap(async (req, res) => {
    if (!CAT_FIELDS[req.params.kind]) return fail(res, 400, 'Bad kind');
    const u = await catStamp();
    const r = await db.query(`UPDATE catalog SET data='{}', deleted=1, edited_at=$1, updated_at=$2 WHERE kind=$3 AND id=$4`, [Date.now(), u, req.params.kind, req.params.id]);
    broadcastAll({ cat: 1 }); res.json({ ok: true, changed: r.rowCount });
  }));
  app.post('/api/admin/settings', admin, wrap(async (req, res) => {
    const b = req.body || {}; if (b.registration === 'open' || b.registration === 'closed') await setSetting('registration', b.registration);
    res.json({ ok: true, registration: await setting('registration', 'open') });
  }));
  app.get('/api/admin/export', admin, wrap(async (req, res) => {
    const r = await db.query(`SELECT u.id, u.username, u.created_at, s.data FROM users u LEFT JOIN states s ON s.user_id=u.id ORDER BY u.created_at`);
    const cat = await db.query(`SELECT kind, id, data, owner, edited_at, deleted FROM catalog`);
    res.set('Content-Disposition', 'attachment; filename="olc-server-export-' + new Date().toISOString().slice(0, 10) + '.json"');
    res.json({ exportedAt: new Date().toISOString(), version: VERSION, accounts: r.rows.map((u) => ({ id: u.id, username: u.username, createdAt: Number(u.created_at), state: u.data ? safeParse(u.data) : null })), catalog: cat.rows.map((x) => ({ kind: x.kind, id: x.id, owner: x.owner, editedAt: Number(x.edited_at), deleted: !!Number(x.deleted), data: safeParse(x.data) })) });
  }));
  app.get('/api/admin/state/:id', admin, wrap(async (req, res) => res.json((await stateOut(req.params.id)).state)));

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
