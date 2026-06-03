---
name: Dev server OOM (heap ceiling)
description: Why the "Start application" dev workflow crashes with "JavaScript heap out of memory" and the durable fix.
---

# Dev server OOM — Node heap ceiling

The `Start application` dev workflow runs `tsx server/index.ts` with Vite in
middleware mode (server + Vite in one process). Under normal use this process
climbs toward Node's default old-space ceiling (~2GB on nodejs-20 here) and
eventually aborts with `FATAL ERROR: ... JavaScript heap out of memory`. It is a
**runtime** OOM (crashes minutes after a clean boot, not at startup) and is not
caused by app boot logic.

**Symptom signature in logs:** clean boot lines, then `<--- Last few GCs --->`
with heap pinned near ~2040/2078 MB, then the FATAL OOM + native stack trace.

## Fix (durable)
Raise the heap limit via `NODE_OPTIONS` on the **workflow command**, not by
editing `package.json` (forbidden by fullstack-js rules):

`configureWorkflow({ name: "Start application", command: "NODE_OPTIONS=--max-old-space-size=4096 npm run dev", waitForPort: 5000, outputType: "webview" })`

tsx's child node process inherits `NODE_OPTIONS`; verify with
`tr '\0' '\n' < /proc/<pid>/environ | rg NODE_OPTIONS` on both the tsx parent
and its child. `--max-old-space-size` is allowed inside `NODE_OPTIONS`.

**Why this over a plain restart:** a restart clears accumulated memory but the
process climbs back to 2GB again (seen recurring in ~2 min under light traffic),
so a restart alone is not durable. Raising the V8 limit doesn't pre-reserve RAM;
it just lets GC recover instead of self-aborting at 2GB.

**How to apply:** if OOM recurs even at 4GB, that points to a genuine leak worth
deeper investigation rather than another bump.
