# VectorMesh — Verification Baseline

This document describes the repeatable verification baseline for the VectorMesh codebase.  
Verification is split between GitHub Actions and the Replit development environment. Database-backed and browser checks run only in Replit against the development database — **never the hosted production database**.

---

## Purpose

The verification baseline ensures that:

- TypeScript types are consistent across the full monorepo.
- Unit and integration tests continue passing after every change.
- The production build compiles without error and produces the correct entry point.
- End-to-end browser tests confirm key user flows work against the live dev server.

A green baseline is required before merging any pull request. It does **not** authorise a production deployment. Production deployment follows the separate procedure in `DEPLOYMENT.md`.

---

## Verification gates

| Gate | Checks | When | Where |
|---|---|---|---|
| Static CI (`verify.yml`) | `typecheck` + `build` | Every PR and push to `main` | GitHub Actions |
| Unit and integration tests | `npm run test:unit` | Before merging | Replit development environment |
| End-to-end browser tests | `npm run test:e2e` | Before merging | Replit development environment |
| Full local baseline | `npm run verify` | On demand | Replit development environment |

**A green static CI check is a necessary gate, not a sufficient one.** It does not replace `npm run verify` and E2E verification in Replit, and does not authorise deployment.

### GitHub Actions — static verification (`verify.yml`)

The workflow runs `typecheck` and `build` only. It does not require PostgreSQL, does not set `DATABASE_URL` or `SESSION_SECRET`, and does not run unit tests, E2E tests, migrations, `db:push`, or any start or deploy command.

Commands executed by GitHub Actions, in order:

```bash
npm ci
npm run typecheck
npm run build
```

That is the complete list. Nothing else runs.

**Why unit tests are not in GitHub Actions (yet)**

`npm run test:unit` connects to PostgreSQL and requires an existing schema. The unit test suite has no built-in schema bootstrap — it relies on the Replit development database, which is already initialised by `db:push` during project setup. Giving GitHub Actions a safe database requires a migration-backed schema initialisation that creates the full schema from the committed migration files rather than from `db:push`.

Phase 1C should establish that mechanism. Once a clean, migration-backed disposable database is available in CI, unit tests can be added to GitHub Actions without risk of concealing inconsistent migration files.

**Why E2E tests are not in GitHub Actions**

Playwright E2E requires:
- the running development server (`npm run dev`);
- Chromium installed at the path configured in `.replit`;
- the Replit development database with `ENABLE_TEST_AUTH_BYPASS=1`;
- the `TEST_ADMIN_EMAIL` account present in the database.

These dependencies are only available in the Replit development environment.

**Rule: no GitHub Actions workflow may use `db:push`**

Using `db:push` in CI would derive the ephemeral schema directly from the current ORM code, bypassing the migration files. This conceals missing, incomplete, or inconsistent migrations rather than surfacing them. Even against an ephemeral database, `db:push` is not an appropriate migration-verification mechanism.

---

## Commands

### `npm run typecheck`

Runs `tsc` (the TypeScript compiler) in check-only mode using `tsconfig.json`.  
Validates types across `client/`, `server/`, and `shared/`. Test files are excluded
from the main `tsconfig.json`; they are executed through the configured test runner
(`npm run test:unit`), which uses `tsconfig.test.json` instead.
Exits non-zero on any type error.

Alias: `npm run check` (identical command, both preserved for compatibility).

### `npm run test:unit`

Runs unit and integration tests using Node's built-in test runner via `tsx`:

```bash
TSX_TSCONFIG_PATH=tsconfig.test.json tsx --test --test-force-exit \
  tests/*.test.ts tests/*.test.tsx
```

**Requires PostgreSQL.** Tests connect to the database identified by `DATABASE_URL`.  
Before running, confirm `DATABASE_URL` points to the Replit development database, not production.  
Do not print the connection string or credentials in logs or reports.

Covers: schema logic, resolver logic, content derivation, player heartbeat, video health,  
agenda deduplication, sweepstake progression, zone fingerprinting, and more.

### `npm run test:e2e`

Runs the Playwright end-to-end test suite:

```bash
playwright test --reporter=list
```

**Requires the dev server to be running** on `http://127.0.0.1:5000` (the "Start application" workflow).  
**Requires `ENABLE_TEST_AUTH_BYPASS=1`** so the test-only login endpoint is mounted.  
Tests drive real browser sessions (Chromium) against the running application.

Covers: screen create/regenerate, player pairing, schedule blocks, programme publishing,  
canvas video-wall geometry, monitor geometry, folder management, and more.

### `npm run build`

Compiles the production bundle:

```bash
tsx script/build.ts
```

Produces:
- `dist/index.cjs` — the server entry point (Node.js, CommonJS)
- `dist/public/` — compiled frontend assets (HTML, CSS, JS, images)

The production entry point **must** remain `dist/index.cjs`. Any change to this path is a blocker.  
Do not require byte-for-byte equality between successive builds — frontend asset hashes legitimately differ.

### `npm run verify`

Convenience alias that runs all non-browser checks in sequence:

```bash
npm run typecheck && npm run test:unit && npm run build
```

This is the recommended pre-merge gate. It does not run E2E tests (those require a live server).

---

## Replit-specific requirements

### `127.0.0.1` not `localhost`

Playwright **must** use `http://127.0.0.1:5000` as its base URL, not `http://localhost:5000`.  
On the Replit container, `localhost` resolves to IPv6 `::1`, but the dev server binds to IPv4 only.  
A `localhost` base URL causes intermittent `EAFNOSUPPORT` errors.  
This is enforced in `playwright.config.ts` and must not be changed.

### Playwright browser path

On Replit, Playwright browsers are pre-installed at a non-default path.  
The E2E workflow must prefix the command with:

```bash
PLAYWRIGHT_BROWSERS_PATH=/home/runner/workspace/.cache/ms-playwright
```

Alternatively, if `REPLIT_PLAYWRIGHT_CHROMIUM_EXECUTABLE` is set in the environment,  
`playwright.config.ts` will use it as the `executablePath` for the Chromium project.  
Do not remove this fallback from `playwright.config.ts`.

### Test auth bypass

The E2E tests authenticate by calling `POST /api/auth/test-login`, a route that bypasses  
password and 2FA. This route is registered **only** when both of the following are true:
- `NODE_ENV !== "production"`
- `ENABLE_TEST_AUTH_BYPASS=1`

The Replit development environment sets `ENABLE_TEST_AUTH_BYPASS=1` in `.replit`.  
The hosted production server must never set this variable. Production deploys are safe by default.

---

## Which tests require PostgreSQL

All of:
- `npm run test:unit` (the full unit/integration suite)
- `npm run test:e2e` (which hits the live server, which connects to the DB)

Do not require PostgreSQL:
- `npm run typecheck` (compile-time only)
- `npm run build` (compile-time only, no DB connection)

---

## Required development environment variables

| Variable | Required for | Notes |
|---|---|---|
| `DATABASE_URL` | `test:unit`, `test:e2e` | Must be the Replit dev DB, never production |
| `SESSION_SECRET` | `test:e2e` | Any non-empty string works for development |
| `ENABLE_TEST_AUTH_BYPASS` | `test:e2e` | Must be `"1"` for the auth-bypass route to mount |
| `PORT` | `test:e2e` | Defaults to `5000`; Playwright base URL must match |

Optional variables (`SMTP_*`, `APP_URL`, `UPLOAD_DIR`, `OPENSKY_CLIENT_ID`, `OPENSKY_CLIENT_SECRET`, `AERODATABOX_RAPIDAPI_KEY`, `SPORTMONKS_API_TOKEN`, etc.) are not required for the test suite to pass but may cause specific widget tests or integrations to fail if absent.

Do not print the value of `DATABASE_URL`, `SESSION_SECRET`, or any credential in logs, reports, or documentation. Confirm a variable is present by checking its existence only.

---

## Replit development vs hosted production

| Concern | Replit development | Hosted production |
|---|---|---|
| Build command | `npm run build` (via Replit workflow or shell) | `npm run build` (identical) |
| Start command | `NODE_OPTIONS=--max-old-space-size=4096 npm run dev` | `npm run start` → `node dist/index.cjs` |
| Server entry point | `server/index.ts` (via `tsx`) | `dist/index.cjs` (compiled) |
| Database | Replit-managed PostgreSQL (dev DB) | Self-hosted or managed PostgreSQL |
| Secrets source | Replit Secrets + `.replit` environment | Server environment variables / `.env` |
| Media storage | `./data/uploads` (ephemeral container FS) | Persistent volume configured via `UPLOAD_DIR` |
| Reverse proxy | Replit internal proxy (mTLS, iframe) | Nginx (or similar) with TLS termination |
| Test auth bypass | `ENABLE_TEST_AUTH_BYPASS=1` (set in `.replit`) | Never set — route never mounted |
| Process manager | Replit workflow runner | PM2 or systemd (see `DEPLOYMENT.md`) |

The npm scripts themselves (`typecheck`, `test:unit`, `test:e2e`, `build`, `verify`) are portable and produce the same results on either environment, given equivalent dependencies and a non-production database.

Hosted production secrets (database password, session secret, SMTP credentials, API keys) must be configured independently from Replit Secrets. They must never appear in source control, logs, or documentation.

---

## Rules for recording a pre-existing failure

If a verification command fails before your change, classify it as one of:

- **Existing application failure** — a genuine bug present before your change; do not fix it as part of this task unless it is in scope.
- **Test-environment failure** — the test environment is misconfigured (missing env var, wrong DB, wrong browser path).
- **Flaky test** — non-deterministic failure; re-run to confirm; document the failure mode.
- **Order-dependent test** — fails only after a specific prior test; document the dependency.
- **Unknown** — requires investigation.

Do not change application source, test code, database state, or behaviour merely to produce a green baseline. Record the failure honestly.

---

## How to confirm `dist/index.cjs` is the production entry point

After `npm run build`:

```bash
test -f dist/index.cjs
ls -lh dist/index.cjs
```

The file must exist and must be the target of `npm run start`:

```json
"start": "NODE_ENV=production node dist/index.cjs"
```

The Replit deployment configuration (`[deployment]` in `.replit`) must also reference this file:

```toml
run = ["node", "./dist/index.cjs"]
```

Any divergence between these three references is a blocker.

---

## Rule: `npm run db:push` must not be part of verification

`npm run db:push` (Drizzle Kit schema push) modifies the database schema. It must never run as part of automated verification. It must never run against the production database outside a controlled migration procedure.

---

## Rule: a green build does not authorise deployment

Passing `npm run verify` confirms that the code compiles, types check, unit tests pass, and a production bundle is produced. It does not confirm:

- End-to-end browser flows work.
- The production server starts and handles requests.
- Migrations have been applied to the production database.
- The hosted environment has all required secrets.
- Performance or load characteristics are acceptable.

Deployment follows the separate procedure in `DEPLOYMENT.md` and requires explicit architectural review sign-off.
