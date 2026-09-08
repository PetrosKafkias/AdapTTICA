# AdapTTICA local project

This repository is a self-contained, deployable version of the provided AdapTTICA website, plus a real Express + SQLite backend (`server/`) that implements the platform's full `/api/v1` contract — authentication, cases, decisions/comments/votes, resources, notifications, uploads and admin user/role management — with server-side role enforcement, password hashing, audit logging and migrations. See [docs/API.md](docs/API.md) for the contract and [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) for how it's deployed.

The original browser-only, localStorage-backed adapter (`src/local-api.js`) is still available as an offline/demo fallback with no backend required — see [Data and API configuration](#data-and-api-configuration).

## Requirements

- Node.js 18.18 or newer (Node 22 LTS is recommended; some dev-tooling packages warn below that even though they still run)
- npm 9 or newer

## Install and run

```powershell
cd C:\DEV-Codex\AdapTTICA
npm install
Copy-Item .env.example .env.local
```

Generate a real session secret and put it in `.env.local` (`SESSION_SECRET=`):

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Then set up the database and start both the frontend and API together:

```powershell
npm run db:migrate
npm run db:seed
npm run dev
```

Open `http://localhost:5173` (or whichever port Vite prints). `db:seed` creates an admin account — `admin@adapttica.local` / `ChangeMe123!` by default, overridable via `SEED_ADMIN_EMAIL`/`SEED_ADMIN_PASSWORD` in `.env.local` — plus participant and organisation-representative demo accounts used by the sign-in role cards (`participant@demo.adapttica.local` and `representative@demo.adapttica.local`, password `Demo123!`, overridable with `SEED_DEMO_PASSWORD`). It also adds demo case studies and resources so the platform is not empty on first run. **Change or disable all demo credentials before deployment.**

The existing views remain available through the same query-parameter routes. The full set actually wired up in the frontend bundle:

- `/?view=home`
- `/?view=login`
- `/?view=profile`
- `/?view=dashboard`
- `/?view=cases`
- `/?view=case`
- `/?view=create`
- `/?view=toolkit`
- `/?view=board`
- `/?view=knowledge`
- `/?view=resource-create`
- `/?view=review`
- `/?view=guide`
- `/?view=admin`

The development server reloads automatically after frontend source changes. Backend changes under `server/` require restarting `npm run dev` (there is no server-side hot reload).

## Production build

```powershell
npm run build
npm run db:migrate
npm run start
```

`npm run start` runs the API and serves the built `dist/` from the same process (`NODE_ENV=production`), so the frontend and API share one origin with no CORS configuration needed — see [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) for why that matters and for the static-hosting alternative (Vercel/Netlify/Cloudflare Pages configs are still included for a frontend-only deploy, but need a same-origin rewrite to a separately hosted API).

## Data and API configuration

Set in `.env.local`:

```dotenv
VITE_USE_REMOTE_API=true   # use the real backend under server/ (default)
```

With `VITE_USE_REMOTE_API` unset or `false`, the app falls back to `src/local-api.js`: accounts, session state, profile preferences, notifications and uploaded-file metadata are all kept in the browser's `localStorage`, with no backend process required at all — useful for a design review or an offline demo, but with no real password check and no server-side permission enforcement.

With the real backend, roles (`user`, `representative`, `coordinator`, `admin`) are stored server-side and derived from the authenticated session on every request — never trusted from the browser. Public registration can only create `user` or `representative`; `admin` can only be granted by an existing administrator through the admin screen (`PATCH /api/v1/admin/users/:id`).

To use a provisioned UserWay account instead of the bundled local accessibility controls:

```dotenv
VITE_USERWAY_ACCOUNT_ID=your-public-widget-account-id
VITE_USERWAY_SCRIPT_URL=https://cdn.userway.org/widget.js
```

Never place private credentials in `VITE_*` variables — Vite inlines them into client-visible code. Backend secrets (`SESSION_SECRET`, `SEED_ADMIN_PASSWORD`) go in `.env.local`/the hosting platform's server-side secret store, read only by `server/`.

## Project structure

```text
AdapTTICA/
├─ index.html                 # Application document and preserved SSR markup
├─ src/
│  ├─ app-entry.js            # Local boot entry
│  ├─ local-api.js            # Portable API/session adapter (offline fallback)
│  ├─ runtime-enhancements.js # DOM patches over the vendored bundle (i18n, a11y, role selector)
│  └─ local-overrides.css     # Font, focus and accessibility overrides
├─ server/
│  ├─ src/                    # Express app, routes, auth/db/audit helpers
│  ├─ migrations/sqlite/      # Migrations actually applied (npm run db:migrate)
│  ├─ migrations/001_initial.sql  # Postgres reference schema for a future shared deployment
│  ├─ test/                   # Vitest + supertest integration tests
│  ├─ data/                   # SQLite database file (gitignored)
│  └─ uploads/                # Uploaded files (gitignored)
├─ public/
│  ├─ assets/                 # Preserved application runtime and styles
│  ├─ adapttica-case-atlas.png
│  ├─ favicon.svg
│  └─ _redirects
├─ .env.example
├─ vite.config.js
├─ eslint.config.js
├─ tsconfig.json
├─ netlify.toml
└─ vercel.json
```

## Customization

- Global visual changes: edit `src/local-overrides.css`.
- Backend behaviour: edit routes under `server/src/routes/`; add a new file under `server/migrations/sqlite/` for schema changes and run `npm run db:migrate`.
- Offline/demo-mode behaviour: edit `src/local-api.js`.
- Branding assets: replace the files under `public/` while retaining their paths, or update their references in the stylesheet.

The recovered runtime files in `public/assets/` preserve the exact supplied interface. Treat them as vendored build artifacts; make maintainable local extensions in `src/` and `server/` rather than editing minified bundles directly.

The API contract and production handover are in [docs/API.md](docs/API.md) and [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md). The Union flag is stored locally at `public/flags/union-jack.svg`. User Guide demonstrations under `public/guide/` are generated from captures of the running application in Greek and English; `scripts/generate-guide-demos.py` rebuilds them when the interface changes.

## Quality checks

```powershell
npm run check
```

Runs, in order: `eslint` over `src/`, `server/` and `scripts/`; a `tsc --checkJs` static-analysis pass (no build step, no `.ts` conversion — see `tsconfig.json`); the Vitest + supertest integration suite under `server/test/` (auth, role enforcement, the full decision/comment/vote/status flow, admin role changes, file uploads — each against a throwaway SQLite database); and the production `vite build`.

The seed also creates a fully connected acceptance journey named **Flood resilience**. It links Built Environment (primary), Urban Flooding, Floods, Water, Transport, Health and Civil Protection, and includes one item in every co-creation stage through **Pathway 1**. This is deliberately stored once through foreign keys; System and Impact pages aggregate it dynamically. `server/test/connected-journey.test.js` verifies linked visibility, edit propagation, inherited Pathway taxonomy, administrator-only deletion and removal from every parent view.

For a clean-machine verification:

```powershell
Remove-Item -Recurse -Force node_modules, dist, server\data\adapttica.sqlite
npm ci
npm run check
npm run db:migrate
npm run db:seed
npm run start
```

Also verify both languages and the main views at desktop, tablet and mobile widths, and exercise the participant/representative/admin roles end to end (register, browse a case, comment and vote on a decision, then as an admin create a case, invite a member and change a user's role from `/?view=admin`). The project includes responsive CSS, visible keyboard focus, reduced-motion handling, persistent sessions, favicon, font assets and SPA fallback configuration.
