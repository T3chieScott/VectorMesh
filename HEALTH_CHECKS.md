# Deep health checks

## Endpoint and authentication

External uptime monitoring can call:

```text
GET /internal/health/deep
```

Every request must send the `X-Health-Token` header. Its value is compared
using a timing-safe SHA-256 digest comparison with the deployment's
`HEALTH_CHECK_TOKEN` secret.

Do not put the token in a URL, query string, cookie, or request body. URLs
are frequently retained in browser history, server logs, proxy logs, and
monitoring dashboards.

Example:

```sh
curl --fail-with-body \
  -H 'X-Health-Token: replace-with-your-long-random-token' \
  https://display.example.com/internal/health/deep
```

Missing or invalid tokens receive an empty `401` response. When
`HEALTH_CHECK_TOKEN` is unset or blank, every request receives a generic
configuration `503` response and no checks run. The application emits one
clear warning at startup in that case.

## Status and response behavior

The response is JSON with a whole-request `durationMs` plus an entry for each
enabled check. `checks` remains the complete flat list for compatibility.
Authenticated responses also group the same results into `dependencies` and
`capabilities`, so an operator can quickly distinguish supporting services
from application-readiness checks.

Every runtime result includes its `critical` flag and `group`. Capability
results also include a fixed `coverage` explanation describing exactly what
the check proves. Individual and overall statuses are:

- `ok` — all enabled checks passed.
- `degraded` — a check is degraded, or an optional check failed or timed out.
- `fail` — a critical check failed or timed out.

`ok` and `degraded` return HTTP `200`; `fail` returns HTTP `503`. Authenticated
requests receive the complete structured result even for HTTP `503`.

The endpoint sends `Cache-Control: no-store` and `Pragma: no-cache`. It is not
part of VectorMesh's verbose `/api` request/response logger and it does not use
the user-facing session/authentication or monitor-bootstrap rate limiter.

## Registered checks

| Name | Critical | What it verifies |
| --- | --- | --- |
| `database` | Yes | PostgreSQL accepts read-only `SELECT 1` through an isolated short-lived client. |
| `file-storage` | Yes | The configured local media-storage root is an accessible directory. The check only uses read-only `stat` and `access`; it never creates a probe file. |
| `microsoft-graph` | No | Added only when Entra OAuth or the development connector is configured. It reads local credential-connectivity state only; it does not call Microsoft Graph, download workbooks, or refresh tokens. |

VectorMesh uses PostgreSQL as its shared cache and in-process caches for local
data, so the database check covers cache readiness. There is no Redis, queue,
or cloud object-storage dependency to check.

Weather, transport, Sportmonks, OpenSky, Google, email, and other feature
providers are intentionally not actively polled. They either have no safe
quota-free health endpoint or their normal calls are business/data operations.
The deep endpoint must not send email, make provider-data calls, refresh OAuth,
or perform a transaction just to prove a provider is available.

Unconfigured optional integrations are omitted from the response rather than
reported as failures.

## Application capability checks

| Name | Critical | What it verifies | What it intentionally does not do |
| --- | --- | --- | --- |
| `authentication` | Yes | `SESSION_SECRET` is configured, and the required base-table and column metadata exists for `users` (`password_hash`, 2FA, and `last_login_at`) and PostgreSQL `sessions`. These are the prerequisites for the password, 2FA, and session login flow. | It does not submit credentials, perform 2FA, regenerate or save a session, update `lastLoginAt`, or write an audit event. |
| `screen-management` | Yes | The required base-table and column metadata exists for `screens`, including its identity, site, pairing, device-token, and paired-state fields. | It does not call `POST /api/screens`, create or duplicate a screen, issue a pairing code, refresh a player, modify a screen, or leave test data behind. |

A green capability result means VectorMesh's safe prerequisites are ready. It
does **not** mean a real login or a screen-creation request has just been run
successfully. Those routes are intentionally covered by regular integration
and browser tests instead of a recurring uptime probe.

## Timeouts and concurrency

All enabled checks start concurrently with `Promise.allSettled`. Each receives
an `AbortSignal` and has a 3-second hard timeout. PostgreSQL probes use a
short client read timeout and destroy their isolated client if an abort or
query error occurs, so a stalled metadata query cannot remain in the shared
pool after the response returns. The handler has a 10-second outer deadline,
which aborts unfinished checks even when a check ignores its own cancellation
signal. A concurrent request reuses the single in-flight execution so
overlapping monitor polls cannot multiply probes.

Responses only contain short, fixed operator-safe messages. They never expose
credentials, connection strings, paths, hostnames, provider URLs, stack traces,
or raw exceptions.

## Adding a safe check

Only add a registry entry for a real external dependency or a critical
availability capability. A check must be read-only, have a stable name, accept
the supplied `AbortSignal`, and return only a safe fixed message.

```ts
healthChecks.push({
  name: "example-provider",
  critical: false,
  run: async ({ signal }) => checkExampleProvider({ signal }),
});
```

Do not add an entry for every public route. For a mutating route, add a
capability check only when its prerequisites can be verified safely and make
the response/documentation explicit about what was not executed. Route
contracts belong in integration tests; this registry monitors dependencies and
core availability. Never add recurring probes that write, send notifications,
refresh credentials, create synthetic data, or consume business-operation
quota.