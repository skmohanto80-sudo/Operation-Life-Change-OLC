# OLC Backend

A tiny Node/Express server that gives Operation Life Change real
cross-device accounts and data storage, plus a simple admin viewer.

Storage is a single `db.json` file next to this script — no external
database to set up. You can open it, back it up, or edit it directly.

## Run locally

```bash
npm install
OLC_ADMIN_KEY=pickASecretKey npm start
```

- API: http://localhost:4000
- Admin viewer: http://localhost:4000/admin?key=pickASecretKey

## Deploy (pick one — all free-tier friendly)

**Render.com**
1. Push this `backend/` folder to a GitHub repo (or a subfolder of your main repo).
2. New → Web Service → connect the repo → set "Root Directory" to `backend` if needed.
3. Build command: `npm install`  ·  Start command: `npm start`
4. Add environment variable `OLC_ADMIN_KEY` = a secret you choose.
5. Deploy. You'll get a URL like `https://olc-backend.onrender.com`.

**Railway.app** — similar: new project from repo, set root to `backend`,
add `OLC_ADMIN_KEY`, deploy.

**Your own VPS** — `npm install && OLC_ADMIN_KEY=... npm start`, put it
behind nginx/Caddy for HTTPS, keep it running with `pm2` or `systemd`.

> GitHub Pages **cannot** run this — Pages only serves static files.
> Host `frontend/` (the OLC website) on Pages, and this backend somewhere
> that runs Node (Render, Railway, a VPS, etc).

## Connect the frontend

In `frontend/app.js`, find:

```js
const API_BASE_URL = '';
```

and set it to your deployed backend URL, e.g.:

```js
const API_BASE_URL = 'https://olc-backend.onrender.com';
```

Leave it empty to keep the site fully static/offline (localStorage only —
still multi-account, just per-device instead of cross-device).

## API

| Method | Path                          | Purpose                              |
|--------|-------------------------------|---------------------------------------|
| POST   | /api/signup                   | `{codename, codeid}` → create/find account |
| POST   | /api/login                    | `{codename, codeid}` → fetch account + state |
| GET    | /api/state/:accountId         | Get a saved state                    |
| PUT    | /api/state/:accountId         | Save (overwrite) a state             |
| GET    | /api/admin/accounts?key=...   | List all accounts (admin)            |
| GET    | /api/admin/state/:id?key=...  | View one account's raw state (admin) |
| DELETE | /api/admin/account/:id?key=...| Delete an account + its data (admin) |
| GET    | /admin?key=...                | Human-readable admin dashboard       |

Nothing here is bank-grade security — Codename + Code ID is a simple
identity, not a password. Treat `db.json` and your `OLC_ADMIN_KEY` as
sensitive, and don't expose the admin routes without the key.
