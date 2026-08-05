# AdapTTICA local project

This repository is a self-contained, deployable version of the provided AdapTTICA website. It preserves the supplied site's pages, responsive layout, bilingual navigation and interactive prototype, while removing its dependency on the original hosting environment.

## Requirements

- Node.js 18 or newer (Node 22 LTS is recommended)
- npm 9 or newer

## Install and run

```powershell
cd C:\DEV-Codex\AdapTTICA
npm install
Copy-Item .env.example .env.local
npm run dev
```

Open `http://localhost:5173`. The existing views remain available through the same query parameter routes, for example:

- `/?view=home`
- `/?view=cases`
- `/?view=case`
- `/?view=toolkit`
- `/?view=knowledge`
- `/?view=guide`
- `/?view=login`
- `/?view=profile`
- `/?view=admin`

The development server reloads automatically after source changes.

## Production build

```powershell
npm run build
npm run preview
```

The optimized site is written to `dist/`. To serve it from a conventional web server, publish that directory and configure unknown routes to fall back to `index.html`. A quick local static-server check can be run with:

```powershell
npx serve -s dist
```

## Deployment

### Vercel

The included `vercel.json` sets the build and output directory.

```powershell
npm install -g vercel
vercel --prod
```

### Netlify

The included `netlify.toml` configures the build and single-page fallback.

```powershell
npm install -g netlify-cli
netlify deploy --prod --dir=dist
```

### Cloudflare Pages

Create a Pages project with build command `npm run build` and output directory `dist`, or deploy from the command line:

```powershell
npm install
npm run build
npx wrangler pages deploy dist --project-name adapttica
```

### Standard web server

Upload the contents of `dist/` and enable an `index.html` fallback. The application uses query-string routes, so no server-side application runtime is required.

## Data and API configuration

By default, accounts, session state, profile preferences, notifications and uploaded-file metadata are provided by `src/local-api.js` and persist in the browser's `localStorage`. This makes the full interface portable and usable without external credentials or services.

For a multi-user production deployment, configure a compatible backend in `.env.local`:

```dotenv
VITE_API_BASE_URL=https://api.example.org
```

The adapter forwards requests from `/api/v1/*` to that base URL. Never place private credentials in `VITE_*` variables because Vite exposes them to client code. Store secrets only in the backend or the deployment platform's server-side secret store.

## Project structure

```text
AdapTTICA/
├─ index.html                 # Application document and preserved SSR markup
├─ src/
│  ├─ app-entry.js            # Local boot entry
│  ├─ local-api.js            # Portable API/session adapter
│  └─ local-overrides.css     # Font, focus and accessibility overrides
├─ public/
│  ├─ assets/                 # Preserved application runtime and styles
│  ├─ adapttica-case-atlas.png
│  ├─ favicon.svg
│  └─ _redirects
├─ .env.example
├─ vite.config.js
├─ netlify.toml
└─ vercel.json
```

## Customization

- Global visual changes: edit `src/local-overrides.css`.
- Local authentication/API behaviour: edit `src/local-api.js`.
- Branding assets: replace the files under `public/` while retaining their paths, or update their references in the stylesheet.
- External data: set `VITE_API_BASE_URL` and implement the endpoints expected under `/api/v1`.

The recovered runtime files in `public/assets/` preserve the exact supplied interface. Treat them as vendored build artifacts; make maintainable local extensions in `src/` rather than editing minified bundles directly.

## Quality checks

Before deployment run:

```powershell
npm run check
```

Also verify both languages and the main views at desktop, tablet and mobile widths. The project includes responsive CSS, visible keyboard focus, reduced-motion handling, local persistence, favicon, font assets and SPA fallback configuration.
