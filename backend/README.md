# OLC backend — Vercel + existing Neon database

This deployment moves the Node API off the suspended Render workspace. It keeps the PostgreSQL schema and login system, so use the **same Neon database** to retain existing OLC accounts and saved entries.

## Deploy the API on Vercel Hobby

1. Sign in to Vercel and import the `Operation-Life-Change-OLC` GitHub repository.
2. In Project Settings → General, set **Root Directory** to `backend`.
3. In Project Settings → Environment Variables, add:
   - `DATABASE_URL` — the connection string for the existing Neon database.
   - `OLC_ADMIN_KEY` — the existing admin key, if you use the owner panel.
   - `OLC_CATALOG_EDIT` — optional; use `anyone` or `owner`.
4. Set the Vercel Function region close to the Neon database region. This reduces the database round-trip time.
5. Deploy. Open `https://YOUR-VERCEL-DOMAIN/api/health`; it should report `"storage":"postgres"`.

Do not create a new database unless you intend to migrate data. A blank replacement database will not contain your existing accounts.

## Point the website at Vercel

After Vercel gives the API a `*.vercel.app` domain, edit `frontend/cloud-config.js` and replace the Render URL with that domain. Upload the updated `frontend/` folder to the GitHub Pages branch/source. The service-worker cache version was advanced so each device can download the new API setting; close and reopen OLC once after the site updates.

The website remains local-first. Daily state is compressed before syncing. File uploads use 4 MiB chunks so they fit Vercel's request limit; downloads are also chunked. The app's existing 40 MiB per-file limit remains.

## Keep your existing data

The API uses the existing PostgreSQL tables and does not reset accounts on deploy. Before changing `DATABASE_URL`, confirm the Neon project is active and that the connection string points to the database that contains your accounts. Do not delete or reset the Neon project during this move.

Vercel Hobby includes 1 million function invocations per month and allows a maximum 60-second function duration without Fluid Compute. The live-sync stream reconnects after a function ends. Free platform quotas still apply. If you later replace Neon, migrate the PostgreSQL data first, including account hashes, sessions, states, backups, catalog entries, and files.
