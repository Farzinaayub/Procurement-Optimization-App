# Deploying to Cloudflare

Live: https://procurement-optimiser.farzinaayub266.workers.dev (Worker `procurement-optimiser`).

## How the Cloudflare build works

Cloudflare Workers can't run the FastAPI/PuLP backend, so `cloudflare/` contains a Worker that
serves the same API in JavaScript, plus the unchanged React build as static assets:

- `cloudflare/solver.js` – JS port of `artifacts/api-server/backend/optimizer.py`. The model
  (2 products × 2 suppliers) is solved exactly by enumerating Supplier A's allocation; it matched
  PuLP on 150+ random scenarios, including infeasible ones.
- `cloudflare/worker.js` – `/api`, `/api/healthz`, `/api/optimization/defaults`,
  `/api/optimization/run` (same responses and error codes as `backend/main.py`); everything else
  is the static site.
- `cloudflare/wrangler.jsonc` – Worker config (assets with SPA fallback, `/api/*` runs the Worker first).

The Replit setup (FastAPI + PuLP) is untouched. If you change the Python model, update
`cloudflare/solver.js` to match.

## Redeploy (Wrangler, recommended)

```bash
pnpm install
npx wrangler login        # once, opens the browser
pnpm run cf:deploy        # = cf:build (vite build) + wrangler deploy
```

## Alternative: embedded build (no Wrangler login)

`pnpm run cf:build:embedded` packs the built site into the Worker as modules and writes
`cloudflare/.out/deploy-api.js`, an async function that can be run with the Cloudflare
connector's `execute` tool (it PUTs the Worker and enables its workers.dev URL). This is how
the site was first published. Output in `cloudflare/.out/` is gitignored.
