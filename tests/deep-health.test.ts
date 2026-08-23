import assert from "node:assert/strict";
import { once } from "node:events";
import http from "node:http";
import type { AddressInfo } from "node:net";
import test from "node:test";
import express from "express";
import {
  createHealthChecks,
  HEALTH_CAPABILITY_COVERAGE,
  isMicrosoftHealthCheckEnabled,
  runBoundedReadOnlyQuery,
  type HealthCheck,
  type HealthCheckDependencies,
} from "../server/health/checks";
import {
  CHECK_TIMEOUT_MS,
  DEEP_HEALTH_PATH,
  HANDLER_TIMEOUT_MS,
  hasValidHealthToken,
  mountDeepHealthRoute,
  runDeepHealthChecks,
} from "../server/health/deepHealth";

const TOKEN = "a-test-health-token-that-is-long-enough";

function okCheck(
  name = "database",
  critical = true,
): HealthCheck {
  return {
    name,
    critical,
    run: async () => ({ status: "ok" }),
  };
}

function makeApp(options: {
  token?: string | undefined;
  checks?: HealthCheck[];
} = {}) {
  const token = Object.hasOwn(options, "token") ? options.token : TOKEN;
  const checks = options.checks ?? [okCheck()];
  const app = express();
  app.use(express.json());
  mountDeepHealthRoute(app, {
    getHealthToken: () => token,
    getChecks: () => checks,
    checkTimeoutMs: 40,
    handlerTimeoutMs: 120,
    logFailure: () => {},
  });
  return app;
}

async function requestWithGetBody(
  app: express.Express,
  body: string,
): Promise<{ status: number; body: string }> {
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address() as AddressInfo;
  try {
    return await new Promise((resolve, reject) => {
      const req = http.request(
        {
          hostname: "127.0.0.1",
          port: address.port,
          path: DEEP_HEALTH_PATH,
          method: "GET",
          headers: {
            "Content-Type": "application/json",
            "Content-Length": Buffer.byteLength(body),
          },
        },
        (res) => {
          let responseBody = "";
          res.setEncoding("utf8");
          res.on("data", (chunk) => {
            responseBody += chunk;
          });
          res.on("end", () =>
            resolve({ status: res.statusCode ?? 0, body: responseBody }),
          );
        },
      );
      req.on("error", reject);
      req.end(body);
    });
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
}

async function request(
  app: express.Express,
  path = DEEP_HEALTH_PATH,
  init: RequestInit = {},
): Promise<Response> {
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address() as AddressInfo;
  try {
    return await fetch(`http://127.0.0.1:${address.port}${path}`, init);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
}

function tick(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

function makeRegistryDependencies(
  overrides: Partial<HealthCheckDependencies> = {},
): HealthCheckDependencies {
  return {
    queryDatabase: async () => {},
    queryAuthenticationPrerequisites: async () => ({
      usersTableReady: true,
      usersColumnsReady: true,
      sessionsTableReady: true,
      sessionsColumnsReady: true,
    }),
    queryScreenManagementPrerequisites: async () => ({
      screensTableReady: true,
      screensColumnsReady: true,
    }),
    getUploadRoot: async () => "/safe-media-root",
    stat: async () => ({ isDirectory: () => true }),
    access: async () => {},
    getMicrosoftEntraStatus: async () => ({ connected: true }),
    ...overrides,
  };
}

test("deep health registry: production probes use only exact read-only database and storage operations", async () => {
  const calls: Array<{ name: string; args: unknown[] }> = [];
  const dependencies = makeRegistryDependencies({
    queryDatabase: async (signal) => {
      calls.push({ name: "database", args: [signal] });
    },
    queryAuthenticationPrerequisites: async (signal) => {
      calls.push({ name: "authentication", args: [signal] });
      return {
        usersTableReady: true,
        usersColumnsReady: true,
        sessionsTableReady: true,
        sessionsColumnsReady: true,
      };
    },
    queryScreenManagementPrerequisites: async (signal) => {
      calls.push({ name: "screen-management", args: [signal] });
      return { screensTableReady: true, screensColumnsReady: true };
    },
    getUploadRoot: async () => {
      calls.push({ name: "getUploadRoot", args: [] });
      return "/safe-media-root";
    },
    stat: async (path) => {
      calls.push({ name: "stat", args: [path] });
      return { isDirectory: () => true };
    },
    access: async (path, mode) => {
      calls.push({ name: "access", args: [path, mode] });
    },
  });
  const checks = createHealthChecks(
    {
      NODE_ENV: "production",
      SESSION_SECRET: "test-session-secret",
    } as NodeJS.ProcessEnv,
    dependencies,
  );

  assert.deepEqual(
    checks.map((check) => [check.name, check.critical]),
    [
      ["database", true],
      ["file-storage", true],
      ["authentication", true],
      ["screen-management", true],
    ],
  );

  const databaseSignal = new AbortController().signal;
  const storageSignal = new AbortController().signal;
  const authSignal = new AbortController().signal;
  const screensSignal = new AbortController().signal;
  await checks[0]!.run({ signal: databaseSignal });
  await checks[1]!.run({ signal: storageSignal });
  await checks[2]!.run({ signal: authSignal });
  await checks[3]!.run({ signal: screensSignal });

  assert.deepEqual(
    calls.map((call) => call.name),
    [
      "database",
      "getUploadRoot",
      "stat",
      "access",
      "authentication",
      "screen-management",
    ],
  );
  assert.equal(calls[0]?.args[0], databaseSignal);
  assert.equal(calls[2]?.args[0], "/safe-media-root");
  assert.equal(calls[3]?.args[0], "/safe-media-root");
  assert.equal(calls[4]?.args[0], authSignal);
  assert.equal(calls[5]?.args[0], screensSignal);
  // R_OK | W_OK: checks readiness without creating, modifying, or deleting a
  // storage object. The dependency interface intentionally exposes no write,
  // provider-call, token-refresh, or notification operation.
  assert.equal(calls[3]?.args[1], 6);
});

test("deep health registry: capability checks report safe readiness without executing login or screen mutations", async () => {
  let authenticationQueries = 0;
  let screenQueries = 0;
  const env = {
    NODE_ENV: "production",
    SESSION_SECRET: "test-session-secret",
  } as NodeJS.ProcessEnv;
  const checks = createHealthChecks(
    env,
    makeRegistryDependencies({
      queryAuthenticationPrerequisites: async () => {
        authenticationQueries += 1;
        return {
          usersTableReady: true,
          usersColumnsReady: true,
          sessionsTableReady: true,
          sessionsColumnsReady: true,
        };
      },
      queryScreenManagementPrerequisites: async () => {
        screenQueries += 1;
        return { screensTableReady: true, screensColumnsReady: true };
      },
    }),
  );
  const authentication = checks.find((check) => check.name === "authentication");
  const screenManagement = checks.find(
    (check) => check.name === "screen-management",
  );

  assert.ok(authentication);
  assert.ok(screenManagement);
  assert.equal(authentication!.group, "capability");
  assert.equal(
    authentication!.coverage,
    HEALTH_CAPABILITY_COVERAGE.authentication,
  );
  assert.equal(screenManagement!.group, "capability");
  assert.equal(
    screenManagement!.coverage,
    HEALTH_CAPABILITY_COVERAGE.screenManagement,
  );
  assert.deepEqual(
    await authentication!.run({ signal: new AbortController().signal }),
    { status: "ok" },
  );
  assert.deepEqual(
    await screenManagement!.run({ signal: new AbortController().signal }),
    { status: "ok" },
  );
  assert.equal(authenticationQueries, 1);
  assert.equal(screenQueries, 1);
});

test("deep health registry: missing auth configuration and failed schemas are safely reported", async () => {
  const missingSecretChecks = createHealthChecks(
    { NODE_ENV: "production", SESSION_SECRET: " " } as NodeJS.ProcessEnv,
    makeRegistryDependencies({
      queryAuthenticationPrerequisites: async () => {
        throw new Error("must not query when the session secret is missing");
      },
    }),
  );
  const missingSecretResult = await missingSecretChecks
    .find((check) => check.name === "authentication")!
    .run({ signal: new AbortController().signal });
  assert.deepEqual(missingSecretResult, {
    status: "fail",
    message: "authentication unavailable",
  });

  const failedSchemaChecks = createHealthChecks(
    {
      NODE_ENV: "production",
      SESSION_SECRET: "test-session-secret",
    } as NodeJS.ProcessEnv,
    makeRegistryDependencies({
      queryAuthenticationPrerequisites: async () => ({
        usersTableReady: true,
        usersColumnsReady: false,
        sessionsTableReady: true,
        sessionsColumnsReady: true,
      }),
      queryScreenManagementPrerequisites: async () => ({
        screensTableReady: false,
        screensColumnsReady: false,
      }),
    }),
  );
  const authResult = await failedSchemaChecks
    .find((check) => check.name === "authentication")!
    .run({ signal: new AbortController().signal });
  const screenResult = await failedSchemaChecks
    .find((check) => check.name === "screen-management")!
    .run({ signal: new AbortController().signal });
  assert.deepEqual(authResult, {
    status: "fail",
    message: "authentication unavailable",
  });
  assert.deepEqual(screenResult, {
    status: "fail",
    message: "screen management unavailable",
  });
});

test("deep health registry: missing login columns or a view in place of a table cannot report ready", async () => {
  const env = {
    NODE_ENV: "production",
    SESSION_SECRET: "test-session-secret",
  } as NodeJS.ProcessEnv;
  const missingTwoFactorColumns = createHealthChecks(
    env,
    makeRegistryDependencies({
      queryAuthenticationPrerequisites: async () => ({
        usersTableReady: true,
        usersColumnsReady: false,
        sessionsTableReady: true,
        sessionsColumnsReady: true,
      }),
    }),
  );
  const viewInsteadOfScreensTable = createHealthChecks(
    env,
    makeRegistryDependencies({
      queryScreenManagementPrerequisites: async () => ({
        screensTableReady: false,
        screensColumnsReady: true,
      }),
    }),
  );

  assert.deepEqual(
    await missingTwoFactorColumns
      .find((check) => check.name === "authentication")!
      .run({ signal: new AbortController().signal }),
    { status: "fail", message: "authentication unavailable" },
  );
  assert.deepEqual(
    await viewInsteadOfScreensTable
      .find((check) => check.name === "screen-management")!
      .run({ signal: new AbortController().signal }),
    { status: "fail", message: "screen management unavailable" },
  );
});

test("deep health registry: aborting a database query destroys its isolated client", async () => {
  let releaseArgument: boolean | undefined;
  let queryStarted = false;
  let resolveQuery!: (value: { rows: unknown[] }) => void;
  const controller = new AbortController();
  const execution = runBoundedReadOnlyQuery(
    async () => ({
      query: async () => {
        queryStarted = true;
        return new Promise<{ rows: unknown[] }>((resolve) => {
          resolveQuery = resolve;
        });
      },
      release: (destroy) => {
        releaseArgument = destroy;
      },
    }),
    "SELECT 1",
    controller.signal,
    10,
  );

  await tick();
  assert.equal(queryStarted, true);
  controller.abort();
  await assert.rejects(execution, { name: "AbortError" });
  assert.equal(releaseArgument, true);
  resolveQuery({ rows: [] });
});

test("deep health registry: optional Microsoft readiness is conditional and local-only", async () => {
  const productionEnv = {
    NODE_ENV: "production",
    MICROSOFT_TENANT_ID: "tenant",
    MICROSOFT_CLIENT_ID: "client",
    MICROSOFT_CLIENT_SECRET: "secret",
    MICROSOFT_REDIRECT_URI: "https://app.example/callback",
    MICROSOFT_TOKEN_ENCRYPTION_KEY: "encryption-key",
  } as NodeJS.ProcessEnv;
  let localStatusReads = 0;
  const checks = createHealthChecks(
    productionEnv,
    makeRegistryDependencies({
      getMicrosoftEntraStatus: async () => {
        localStatusReads += 1;
        return { connected: false };
      },
    }),
  );
  const microsoftCheck = checks.find(
    (check) => check.name === "microsoft-graph",
  );

  assert.equal(isMicrosoftHealthCheckEnabled(productionEnv), true);
  assert.ok(microsoftCheck);
  const result = await microsoftCheck!.run({
    signal: new AbortController().signal,
  });
  assert.deepEqual(result, { status: "degraded", message: "not connected" });
  assert.equal(localStatusReads, 1);

  const unconfigured = createHealthChecks(
    { NODE_ENV: "production" } as NodeJS.ProcessEnv,
    makeRegistryDependencies(),
  );
  assert.equal(isMicrosoftHealthCheckEnabled({ NODE_ENV: "production" }), false);
  assert.equal(
    unconfigured.some((check) => check.name === "microsoft-graph"),
    false,
  );
});

test("deep health: correct token receives complete no-cache health response", async () => {
  const response = await request(makeApp(), DEEP_HEALTH_PATH, {
    headers: { "X-Health-Token": TOKEN },
  });

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(response.headers.get("pragma"), "no-cache");
  const body = await response.json();
  assert.equal(body.status, "ok");
  assert.equal(body.checks[0].name, "database");
  assert.equal(body.checks[0].status, "ok");
  assert.equal(body.checks[0].group, "dependency");
  assert.equal(body.checks[0].critical, true);
  assert.deepEqual(body.dependencies.map((check: { name: string }) => check.name), [
    "database",
  ]);
  assert.deepEqual(body.capabilities, []);
  assert.equal(Number.isInteger(body.durationMs), true);
});

test("deep health: capability output is grouped and documents safe coverage", async () => {
  const response = await request(
    makeApp({
      checks: [
        okCheck("database"),
        {
          name: "authentication",
          critical: true,
          group: "capability",
          coverage: HEALTH_CAPABILITY_COVERAGE.authentication,
          run: async () => ({ status: "ok" }),
        },
        {
          name: "screen-management",
          critical: true,
          group: "capability",
          coverage: HEALTH_CAPABILITY_COVERAGE.screenManagement,
          run: async () => ({ status: "ok" }),
        },
      ],
    }),
    DEEP_HEALTH_PATH,
    { headers: { "X-Health-Token": TOKEN } },
  );

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.deepEqual(
    body.dependencies.map((check: { name: string }) => check.name),
    ["database"],
  );
  assert.deepEqual(
    body.capabilities.map((check: { name: string; critical: boolean }) => [
      check.name,
      check.critical,
    ]),
    [
      ["authentication", true],
      ["screen-management", true],
    ],
  );
  assert.deepEqual(
    body.capabilities.map((check: { coverage?: string }) => check.coverage),
    [
      HEALTH_CAPABILITY_COVERAGE.authentication,
      HEALTH_CAPABILITY_COVERAGE.screenManagement,
    ],
  );
});

test("deep health: missing and incorrect tokens return identical empty 401 responses", async () => {
  const app = makeApp();
  const missing = await request(app);
  const incorrect = await request(app, DEEP_HEALTH_PATH, {
    headers: { "X-Health-Token": "incorrect" },
  });

  assert.equal(missing.status, 401);
  assert.equal(incorrect.status, 401);
  assert.equal(await missing.text(), "");
  assert.equal(await incorrect.text(), "");
});

test("deep health: token lengths are safely rejected without throwing", () => {
  assert.equal(hasValidHealthToken("x", TOKEN), false);
  assert.equal(hasValidHealthToken("x".repeat(10_000), TOKEN), false);
  assert.equal(hasValidHealthToken(undefined, TOKEN), false);
  assert.equal(hasValidHealthToken(TOKEN, TOKEN), true);
});

test("deep health: query, cookie, and request-body token values are ignored", async () => {
  const app = makeApp();
  const query = await request(app, `${DEEP_HEALTH_PATH}?token=${TOKEN}`);
  const cookie = await request(app, DEEP_HEALTH_PATH, {
    headers: { Cookie: `X-Health-Token=${TOKEN}` },
  });
  const body = await requestWithGetBody(app, JSON.stringify({ token: TOKEN }));

  assert.equal(query.status, 401);
  assert.equal(cookie.status, 401);
  assert.equal(body.status, 401);
  assert.equal(await query.text(), "");
  assert.equal(await cookie.text(), "");
  assert.equal(body.body, "");
});

test("deep health: unset or blank config returns generic 503 and runs no checks", async () => {
  for (const token of [undefined, "", "   "]) {
    let checksStarted = 0;
    const response = await request(
      makeApp({
        token,
        checks: [
          {
            ...okCheck(),
            run: async () => {
              checksStarted += 1;
              return { status: "ok" };
            },
          },
        ],
      }),
      DEEP_HEALTH_PATH,
      { headers: { "X-Health-Token": TOKEN } },
    );

    assert.equal(response.status, 503);
    assert.equal(checksStarted, 0);
    assert.deepEqual(await response.json(), {
      status: "fail",
      durationMs: 0,
      checks: [
        {
          name: "configuration",
          status: "fail",
          durationMs: 0,
          message: "health check unavailable",
        },
      ],
    });
  }
});

test("deep health: all checks start concurrently and each receives an AbortSignal", async () => {
  let started = 0;
  let release!: () => void;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  const signals: AbortSignal[] = [];
  const checks = ["database", "file-storage", "microsoft-graph"].map(
    (name, index): HealthCheck => ({
      name,
      critical: index < 2,
      run: async ({ signal }) => {
        started += 1;
        signals.push(signal);
        await pending;
        return { status: "ok" };
      },
    }),
  );

  const execution = runDeepHealthChecks(checks, {
    checkTimeoutMs: 100,
    handlerTimeoutMs: 200,
    logFailure: () => {},
  });
  await tick();
  assert.equal(started, 3, "all checks should have started before any resolves");
  assert.equal(signals.every((signal) => signal instanceof AbortSignal), true);
  release();

  const result = await execution;
  assert.equal(result.status, "ok");
});

test("deep health: check timeout aborts the check and follows criticality", async () => {
  let criticalSignal: AbortSignal | undefined;
  let optionalSignal: AbortSignal | undefined;
  const never = (name: string, critical: boolean, save: (signal: AbortSignal) => void): HealthCheck => ({
    name,
    critical,
    run: async ({ signal }) => {
      save(signal);
      await new Promise<void>(() => {});
      return { status: "ok" };
    },
  });

  const result = await runDeepHealthChecks(
    [
      never("database", true, (signal) => {
        criticalSignal = signal;
      }),
      never("microsoft-graph", false, (signal) => {
        optionalSignal = signal;
      }),
    ],
    { checkTimeoutMs: 15, handlerTimeoutMs: 100, logFailure: () => {} },
  );

  assert.equal(result.status, "fail");
  assert.equal(criticalSignal?.aborted, true);
  assert.equal(optionalSignal?.aborted, true);
  assert.deepEqual(
    result.checks.map((check) => [check.name, check.status, check.message]),
    [
      ["database", "fail", "check timed out"],
      ["microsoft-graph", "degraded", "check timed out"],
    ],
  );
});

test("deep health: outer deadline resolves even when a check ignores cancellation", async () => {
  const started = performance.now();
  const result = await runDeepHealthChecks(
    [
      {
        name: "database",
        critical: true,
        run: async () => {
          await new Promise<void>(() => {});
          return { status: "ok" };
        },
      },
    ],
    { checkTimeoutMs: 1_000, handlerTimeoutMs: 15, logFailure: () => {} },
  );

  assert.equal(result.status, "fail");
  assert.equal(result.checks[0]?.message, "health check timed out");
  assert.ok(
    performance.now() - started < 250,
    "outer deadline must not wait for a check that ignores cancellation",
  );
});

test("deep health: ok, degraded, critical fail, and optional fail map to expected HTTP statuses", async () => {
  const scenarios: Array<{
    checks: HealthCheck[];
    expectedBody: string;
    expectedHttp: number;
  }> = [
    {
      checks: [okCheck()],
      expectedBody: "ok",
      expectedHttp: 200,
    },
    {
      checks: [
        {
          name: "microsoft-graph",
          critical: false,
          run: async () => ({ status: "degraded", message: "service unavailable" }),
        },
      ],
      expectedBody: "degraded",
      expectedHttp: 200,
    },
    {
      checks: [
        {
          name: "database",
          critical: true,
          run: async () => ({ status: "fail" }),
        },
      ],
      expectedBody: "fail",
      expectedHttp: 503,
    },
    {
      checks: [
        {
          name: "microsoft-graph",
          critical: false,
          run: async () => ({ status: "fail" }),
        },
      ],
      expectedBody: "degraded",
      expectedHttp: 200,
    },
  ];

  for (const scenario of scenarios) {
    const response = await request(
      makeApp({ checks: scenario.checks }),
      DEEP_HEALTH_PATH,
      { headers: { "X-Health-Token": TOKEN } },
    );
    assert.equal(response.status, scenario.expectedHttp);
    assert.equal((await response.json()).status, scenario.expectedBody);
  }
});

test("deep health: thrown and unsafe returned errors are normalised", async () => {
  const response = await request(
    makeApp({
      checks: [
        {
          name: "database",
          critical: true,
          run: async () => {
            throw new Error("postgres://username:password@private-host/internal");
          },
        },
        {
          name: "microsoft-graph",
          critical: false,
          run: async () => ({
            status: "degraded",
            message: "https://secret-provider.example/private-details",
          }),
        },
      ],
    }),
    DEEP_HEALTH_PATH,
    { headers: { "X-Health-Token": TOKEN } },
  );

  assert.equal(response.status, 503);
  const body = await response.json();
  const serialised = JSON.stringify(body);
  assert.equal(serialised.includes("postgres://"), false);
  assert.equal(serialised.includes("private-host"), false);
  assert.equal(serialised.includes("secret-provider"), false);
  assert.deepEqual(
    body.checks.map((check: { message?: string }) => check.message),
    ["check failed", "service unavailable"],
  );
});

test("deep health: overlapping authenticated requests reuse one in-flight probe", async () => {
  let runs = 0;
  let firstCheckStarted!: () => void;
  const firstCheckStart = new Promise<void>((resolve) => {
    firstCheckStarted = resolve;
  });
  let secondRequestEntered!: () => void;
  const secondRequestEntry = new Promise<void>((resolve) => {
    secondRequestEntered = resolve;
  });
  let requestCount = 0;
  let release!: () => void;
  const waitForRelease = new Promise<void>((resolve) => {
    release = resolve;
  });
  const app = express();
  app.use(express.json());
  app.use((_req, _res, next) => {
    requestCount += 1;
    if (requestCount === 2) secondRequestEntered();
    next();
  });
  mountDeepHealthRoute(app, {
    getHealthToken: () => TOKEN,
    getChecks: () => [
      {
        name: "database",
        critical: true,
        run: async () => {
          runs += 1;
          firstCheckStarted();
          await waitForRelease;
          return { status: "ok" };
        },
      },
    ],
    checkTimeoutMs: 500,
    handlerTimeoutMs: 1_000,
    logFailure: () => {},
  });
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const { port } = server.address() as AddressInfo;
  const url = `http://127.0.0.1:${port}${DEEP_HEALTH_PATH}`;

  try {
    const first = fetch(url, { headers: { "X-Health-Token": TOKEN } });
    await firstCheckStart;
    const second = fetch(url, { headers: { "X-Health-Token": TOKEN } });
    await secondRequestEntry;
    assert.equal(runs, 1);
    release();
    const [firstResponse, secondResponse] = await Promise.all([first, second]);
    assert.equal(firstResponse.status, 200);
    assert.equal(secondResponse.status, 200);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});

test("deep health defaults retain required production timeout constants", () => {
  assert.equal(CHECK_TIMEOUT_MS, 3_000);
  assert.equal(HANDLER_TIMEOUT_MS, 10_000);
});