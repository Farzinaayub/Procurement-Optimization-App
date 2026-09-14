# Procurement Optimizer

An interactive procurement decision-support workspace that runs the existing PuLP model and explains supplier allocation, cost, and delivery impact.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: FastAPI + Uvicorn
- Optimization: Python + PuLP
- Frontend: React + Vite
- Database: PostgreSQL + Drizzle ORM (available for future persistence; not required for the current scenario workflow)
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `artifacts/procurement-optimizer` — responsive React workspace and results UI.
- `artifacts/api-server/backend/optimizer.py` — source-of-truth PuLP model.
- `artifacts/api-server/backend/main.py` — FastAPI wrapper for defaults, health, and optimization endpoints.
- `lib/api-spec/openapi.yaml` — source of truth for the API contract.
- `lib/api-client-react/src/generated` — generated React Query client and types.

## Architecture decisions

- The optimization equations remain in the Python module; the API only validates inputs, invokes the model, and returns structured results.
- Model defaults are exposed from the Python function signature so the frontend does not duplicate business inputs.
- Scenarios are intentionally not persisted; each run is an explicit, user-controlled decision scenario.
- The frontend uses generated API hooks and never implements optimization logic.

## Product

- Procurement professionals can edit demand, capacity, cost, shipping, and delivery inputs.
- The workspace can run the model and show allocation by supplier/product, total cost, average delivery, capacity utilization, and supplier activation.
- Loading, validation, service error, infeasible-scenario, empty, success, and responsive mobile states are supported.

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

- The API workflow runs with `artifacts/api-server` as its working directory, so its Uvicorn command must use `backend/main.py`, not a workspace-root-prefixed path.
- Regenerate the API client after changing `lib/api-spec/openapi.yaml`.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
