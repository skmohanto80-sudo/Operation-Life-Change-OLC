/**
 * Storage layer. PostgreSQL only — a real database that survives restarts,
 * redeploys and free-tier "sleep". (The old db.json file lived on a disk that
 * hosts like Render wipe on every restart, which is what kept erasing accounts.)
 *
 *   DATABASE_URL=postgres://...   -> real database (production)
 *   DATABASE_URL=memory           -> in-memory test database (data is LOST on restart)
 */
const fs = require('fs');
const path = require('path');

async function createPool() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('\n✖ DATABASE_URL is not set.\n  Create a free PostgreSQL database (Neon / Supabase) and set DATABASE_URL.\n  For a throw-away local test only:  DATABASE_URL=memory npm start\n');
    process.exit(1);
  }
  if (url === 'memory') {
    const { newDb } = require('pg-mem');
    const mem = newDb();
    const { Pool } = mem.adapters.createPg();
    console.warn('⚠  Using an IN-MEMORY database — everything is lost when the server stops.');
    return { pool: new Pool(), kind: 'memory' };
  }
  const { Pool } = require('pg');
  const needsSsl = /sslmode=require|neon\.tech|supabase\.co|supabase\.com/i.test(url) || process.env.PGSSL === '1';
  const pool = new Pool({
    connectionString: url,
    ssl: needsSsl ? { rejectUnauthorized: false } : undefined,
    max: 5,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 15000,
  });
  pool.on('error', (e) => console.error('pg pool error:', e.message));
  return { pool, kind: 'postgres' };
}

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS users (
     id TEXT PRIMARY KEY,
     username TEXT NOT NULL,
     username_lc TEXT NOT NULL UNIQUE,
     pass_hash TEXT NOT NULL,
     pass_fp TEXT NOT NULL UNIQUE,
     rec_hash TEXT NOT NULL,
     rec_fp TEXT NOT NULL UNIQUE,
     avatar TEXT,
     created_at BIGINT NOT NULL
   )`,
  `CREATE TABLE IF NOT EXISTS sessions (
     id TEXT PRIMARY KEY,
     user_id TEXT NOT NULL,
     token_hash TEXT NOT NULL UNIQUE,
     device TEXT,
     created_at BIGINT NOT NULL,
     last_seen BIGINT NOT NULL
   )`,
  `CREATE TABLE IF NOT EXISTS states (
     user_id TEXT PRIMARY KEY,
     data TEXT NOT NULL,
     updated_at BIGINT NOT NULL,
     version INTEGER NOT NULL DEFAULT 1
   )`,
  `CREATE TABLE IF NOT EXISTS state_backups (
     id TEXT PRIMARY KEY,
     user_id TEXT NOT NULL,
     data TEXT NOT NULL,
     state_updated_at BIGINT NOT NULL,
     created_at BIGINT NOT NULL
   )`,
  `CREATE TABLE IF NOT EXISTS legacy_accounts (
     id TEXT PRIMARY KEY, codename TEXT NOT NULL, codeid TEXT NOT NULL, data TEXT
   )`,
];

async function init() {
  const { pool, kind } = await createPool();
  for (const sql of SCHEMA) await pool.query(sql);
  const db = {
    kind,
    pool,
    query: (sql, params) => pool.query(sql, params),
  };

  // Pepper used to fingerprint passwords/recovery codes for the "must be unique" rule.
  if (process.env.OLC_PEPPER) db.pepper = process.env.OLC_PEPPER;
  else {
    const r = await pool.query(`SELECT v FROM meta WHERE k='pepper'`);
    if (r.rows.length) db.pepper = r.rows[0].v;
    else {
      db.pepper = require('crypto').randomBytes(32).toString('hex');
      await pool.query(`INSERT INTO meta (k, v) VALUES ('pepper', $1)`, [db.pepper]);
    }
  }

  // One-time, read-only import of the OLD db.json (if it is still around) so old
  // Codename + Code ID data can be claimed from the new app. The file is never modified.
  try {
    const legacyPath = path.join(__dirname, 'db.json');
    if (fs.existsSync(legacyPath)) {
      const old = JSON.parse(fs.readFileSync(legacyPath, 'utf8'));
      let n = 0;
      for (const a of old.accounts || []) {
        const st = old.states && old.states[a.id];
        const r = await pool.query(
          `INSERT INTO legacy_accounts (id, codename, codeid, data) VALUES ($1,$2,$3,$4) ON CONFLICT (id) DO NOTHING`,
          [a.id, a.codename, a.codeid, st ? JSON.stringify(st) : null]
        );
        n += r.rowCount || 0;
      }
      if (n) console.log(`Imported ${n} legacy account(s) from db.json (original file left untouched).`);
    }
  } catch (e) { console.warn('legacy db.json import skipped:', e.message); }

  return db;
}

module.exports = { init };
