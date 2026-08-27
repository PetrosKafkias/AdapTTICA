# Deployment handover

## How the two backends fit together

`src/local-api.js` intercepts `fetch("/api/v1/...")` in the browser. What it does depends on `VITE_USE_REMOTE_API`:

- **Unset/false** (offline/demo mode): every request is answered from an in-memory object persisted to `localStorage`. No backend process, no network calls, no server-side enforcement of anything — fine for a design review or an offline demo, not for anything resembling production use.
- **`true`** (real backend, the default in `.env.example`): requests pass through untouched to the network, where they must reach the real Express + SQLite server in `server/`. The vendored frontend bundle (`public/assets/*.js`) hardcodes `credentials: "same-origin"` on every request, so that server **must** be reachable on the same origin as the frontend — see the two modes below. There is no way to point this bundle at a different-origin API and still have session cookies work.

## Local development

```powershell
npm install
Copy-Item .env.example .env.local
# generate a real value for SESSION_SECRET in .env.local:
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
npm run db:migrate
npm run db:seed
npm run dev
```

`npm run dev` runs the Vite dev server and the API together (`concurrently`). Vite proxies `/api/v1` to the API port (`vite.config.js`), so the browser sees one origin and the session cookie survives. `db:seed` creates an admin account (`SEED_ADMIN_EMAIL`/`SEED_ADMIN_PASSWORD` in `.env.local`, defaulting to `admin@adapttica.local` / `ChangeMe123!`) plus a handful of demo case studies and resources — change that password after first login.

## Production: one combined server

```powershell
npm run build
npm run db:migrate
npm run start
```

`npm run start` runs `server/src/index.js` with `NODE_ENV=production`, which serves the built `dist/` alongside `/api/v1` from the same process — still one origin, no CORS configuration needed anywhere. This is the path that's actually been run and verified end-to-end in this repo; treat it as the primary deployment target.

**This mode requires HTTPS.** The session cookie is set `Secure` whenever `NODE_ENV=production`, so a browser will not send it back over plain HTTP — logging in over `http://localhost:8787` directly will silently fail to persist the session (no `Set-Cookie` at all; `cookie-session` suppresses it). Put a TLS-terminating reverse proxy in front of the app in production (`app.set("trust proxy", 1)` is already set so `req.secure` reflects `X-Forwarded-Proto` from that proxy), or test this mode locally over HTTPS. For local HTTP testing, use `npm run dev` instead, where the cookie is not `Secure`.

Set in the environment (never as `VITE_*`, which Vite inlines into client code):

- `SESSION_SECRET` — required, a long random string.
- `API_PORT` (default `8787`).
- `DATABASE_FILE` — defaults to `server/data/adapttica.sqlite`. Back this file up; it is the entire database.
- `UPLOAD_DIR` — defaults to `server/uploads/`. Uploaded files live on local disk; there is no object-storage integration.

### Static-hosting frontend + separately hosted API

If the frontend is deployed to Vercel/Netlify/Cloudflare Pages as a static site (the platform-specific config files are still present: `vercel.json`, `netlify.toml`), the API must be reachable at the exact same origin via that platform's own reverse-proxy/rewrite feature (e.g. a Netlify redirect or Vercel rewrite for `/api/v1/*` to the API's real address) — not a separate domain, for the cookie reason above. This is more moving parts than the combined-server path and hasn't been exercised in this repo; prefer the combined server unless there's a specific reason to split them.

## What's real and what's a stand-in

- **Database**: real, migration-driven SQLite (`server/migrations/sqlite/`, run via `npm run db:migrate`). `server/migrations/001_initial.sql` is a Postgres reference schema kept for a possible future migration to a shared Postgres deployment — nothing in this repo runs it. Moving to Postgres would mean swapping `server/src/db.js`'s driver and adapting the SQLite-specific migration syntax (`strftime`, `TEXT CHECK` enums, the FTS5 search table) to that schema's `jsonb`/`enum`/`text[]`/GIN equivalents.
- **File uploads**: real, stored on local disk under `UPLOAD_DIR`, streamed back through `/api/v1/files/:id` with an ownership check. No object storage (S3-compatible or otherwise) is wired up.
- **Email**: not wired up. `POST /cases/:id/invitations` creates a real invitation row and token and logs a shareable link to the server console instead of sending it — see the comment in `server/src/routes/cases.js`. Wiring a real provider is a matter of adding SMTP credentials via env and replacing that `console.log`.
- **AFFiNE**: not a real integration. The "connect AFFiNE sync" UI in the bundle is simulated client-side state; `PATCH /cases/:id/workspace` just stores an opaque JSON blob per case.
- **Rate limiting**: a minimal in-memory per-IP limiter on `/auth/*` only (`server/src/lib/rateLimit.js`) — fine for a single instance, not for a multi-instance deployment behind a load balancer (replace with a shared store like Redis first).

## Accessibility widget

The UserWay account is optional. Set `VITE_USERWAY_ACCOUNT_ID` to load the hosted widget; with no account ID, the bundled keyboard-accessible local controls are used (`src/runtime-enhancements.js`).
