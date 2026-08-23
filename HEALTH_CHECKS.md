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
enabled check. Individual and overall statuses are:

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
| `database` | Yes | PostgreSQL accepts read-only `SELECT 1`. |
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

## Timeouts and concurrency

All enabled checks start concurrently with `Promise.allSettled`. Each receives
an `AbortSignal` and has a 3-second hard timeout. The handler has a 10-second
outer deadline, which aborts unfinished checks even when a check ignores its
own cancellation signal. A concurrent request reuses the single in-flight
execution so overlapping monitor polls cannot multiply probes.

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

Do not add an entry for every public route. Route contracts belong in
integration tests; this registry monitors dependencies and core availability.
Never add recurring probes that write, send notifications, refresh credentials,
create synthetic data, or consume business-operation quota.