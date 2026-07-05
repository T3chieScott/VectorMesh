---
name: E2E / test environment quirks
description: Container-specific gotchas that make Playwright e2e and node:test DB tests flaky or fail only in the full suite.
---

# E2E / test env quirks

## Playwright baseURL must be IPv4, not `localhost`
This container's `localhost` resolves to IPv6 `::1`, but the dev server only
binds IPv4. A `localhost` baseURL intermittently fails with
`connect EAFNOSUPPORT ::1:5000`. Use `http://127.0.0.1:5000` in
`playwright.config.ts` (or set `E2E_BASE_URL`).

**How to apply:** any new Playwright config / direct fetch in tests should target
127.0.0.1, never `localhost`.

## Agenda display specs: navigate with `waitUntil: "domcontentloaded"`
The player/display pages register a Service Worker and start poll loops on mount;
under full-suite load the `load` event can lag past the 15s navigationTimeout.
Assertions only need React mounted, so `page.goto(url, { waitUntil: "domcontentloaded" })`
is the correct wait — the sibling `display-agenda-flow.spec.ts` already does this.

## Drizzle: don't hand-write `sql\`col = ANY(${jsArray})\``
Interpolating a JS string[] into a raw `sql\`... = ANY(${arr})\`` template
mis-serializes and throws Postgres `22P02 malformed array literal` (the array is
flattened / not wrapped as `{...}`). Use the `inArray(col, arr)` helper instead —
it emits `col in ($1,$2,...)`.

**Why this hides in isolation:** a bug like this in a test's `after` hook that
only runs when a snapshot array is non-empty (e.g. ambient `isOnline` screens)
passes when the file runs alone (empty snapshot) and only fails in the full
`test` suite once earlier files leave matching rows behind. Reproduce suite-order
bugs by running the whole suite, not the single file.
