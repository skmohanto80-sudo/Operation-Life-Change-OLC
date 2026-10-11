# OLC Backend v2 (accounts + safe sync)

Needs two free things:
1. **A PostgreSQL database** (this is what keeps your data forever)
2. **A Node host** (Render) that runs this folder

## Step 1 — free database (Neon, 3 minutes)
1. Go to neon.tech → sign up (Google login is fine) → *Create project*.
2. Copy the **connection string** (starts with `postgresql://...`).

## Step 2 — Render
1. Put this `backend/` folder in GitHub (same repo or a new one).
2. Render → *New Web Service* → pick the repo (Root Directory = `backend` if needed).
3. Build command: `npm install`   Start command: `npm start`
4. Environment variables:
   - `DATABASE_URL` = the Neon connection string  ← **required**
   - `OLC_ADMIN_KEY` = a long secret only you know (turns on the owner panel at `https://YOUR-SERVICE.onrender.com/admin`)
   - `OLC_CATALOG_EDIT` = `anyone` (default: every account may edit shared ranks/medals/badges/divisions) or `owner` (only the creating account)
5. Deploy. Open `https://YOUR-SERVICE.onrender.com/api/health` — it must show `"storage":"postgres"`.

If your Render address is not `https://operation-life-change-olc.onrender.com`, change `API_BASE_URL` at the top of `frontend/auth.js`.

## Why the old backend lost data
It saved to a file (`db.json`). Render's free disk is wiped on every restart/redeploy, so accounts vanished and the app showed errors. This version only uses PostgreSQL, so restarts cannot erase anything.

## Safety built in
- A save is accepted only if the device saw the latest cloud version; otherwise the server returns its copy and the app merges safely.
- A blank state can never overwrite saved data.
- Automatic cloud backups (every 6 h and before forced overwrites), restorable from Agent Profile.

## Test
`npm install && npm test && node test/frontend.js && node test/sections.js` (uses an in-memory database).


## Owner panel (see every account / control the server)
Set `OLC_ADMIN_KEY` on Render, redeploy, open `/admin`, type the key (it is sent in a header, never in the URL).
You can: see server totals; list every account with last activity, devices and data size; download any account's data; restore its backups;
sign it out everywhere; reset its password (shows a new password + recovery code once); delete it (type its exact username);
remove a shared medal/badge/division/rank for everyone; close or open new sign-ups; export the whole server.
Passwords are stored hashed, so nobody (including you) can read them — you can only reset them.

## Shared catalog
Ranks (XP thresholds), medals, badges and divisions are shared by ALL accounts on this server. Each account keeps its own progress,
earned achievements, times earned and which division is ON. Files (pictures/PDFs) are shared by content as well.
Deploy order: backend first, then the frontend.
