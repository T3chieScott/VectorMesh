import { constants as fsConstants, promises as fs } from "node:fs";
import { pool } from "../db";
import { getUploadRoot } from "../fileStorage";
import { getMicrosoftEntraStatus } from "../microsoftOAuth";

export type HealthCheckStatus = "ok" | "degraded" | "fail";
export type HealthCheckGroup = "dependency" | "capability";

export const HEALTH_CAPABILITY_COVERAGE = {
  authentication:
    "Checks login prerequisites only; it does not perform a login or create a session.",
  screenManagement:
    "Checks screen-management schema prerequisites only; it does not create, pair, update, refresh, or delete screens.",
} as const;

export type HealthCheckCoverage =
  (typeof HEALTH_CAPABILITY_COVERAGE)[keyof typeof HEALTH_CAPABILITY_COVERAGE];

export interface HealthCheckRunResult {
  status: HealthCheckStatus;
  /**
   * Messages must be one of the short, fixed, operator-safe strings used by
   * the deep-health handler. Never return provider errors, paths, URLs, or
   * credentials from a check.
   */
  message?: string;
}

export interface HealthCheck {
  /** Stable identifier for external uptime monitors. */
  name: string;
  /** A failed critical check makes the endpoint return HTTP 503. */
  critical: boolean;
  /** Dependencies and application capabilities are reported separately. */
  group?: HealthCheckGroup;
  /** A fixed, operator-safe explanation of what a capability check proves. */
  coverage?: HealthCheckCoverage;
  /** All checks are read-only and receive cancellation from their timeout. */
  run: (context: { signal: AbortSignal }) => Promise<HealthCheckRunResult>;
}

export interface HealthCheckDependencies {
  /**
   * A read-only database readiness probe. The signal lets the handler stop
   * awaiting a stalled database operation at its hard deadline.
   */
  queryDatabase: (signal: AbortSignal) => Promise<void>;
  queryAuthenticationPrerequisites: (
    signal: AbortSignal,
  ) => Promise<AuthenticationPrerequisites>;
  queryScreenManagementPrerequisites: (
    signal: AbortSignal,
  ) => Promise<ScreenManagementPrerequisites>;
  getUploadRoot: () => Promise<string>;
  stat: (path: string) => Promise<{ isDirectory: () => boolean }>;
  access: (path: string, mode: number) => Promise<void>;
  getMicrosoftEntraStatus: () => Promise<{ connected: boolean }>;
}

export interface AuthenticationPrerequisites {
  usersTableReady: boolean;
  usersColumnsReady: boolean;
  sessionsTableReady: boolean;
  sessionsColumnsReady: boolean;
}

export interface ScreenManagementPrerequisites {
  screensTableReady: boolean;
  screensColumnsReady: boolean;
}

interface HealthQueryResult<T> {
  rows: T[];
}

interface HealthDatabaseClient {
  query: (config: {
    text: string;
    query_timeout: number;
  }) => Promise<HealthQueryResult<unknown>>;
  release: (destroy?: boolean) => void;
}

const DATABASE_QUERY_TIMEOUT_MS = 2_500;

const MICROSOFT_ENVIRONMENT_KEYS = [
  "MICROSOFT_TENANT_ID",
  "MICROSOFT_CLIENT_ID",
  "MICROSOFT_CLIENT_SECRET",
  "MICROSOFT_REDIRECT_URI",
  "MICROSOFT_TOKEN_ENCRYPTION_KEY",
] as const;

function isNonBlank(value: string | undefined): boolean {
  return Boolean(value?.trim());
}

/**
 * Microsoft Graph is optional. Register its local connector-readiness check
 * only when the application has enough configuration to enable it. The check
 * never calls Graph, downloads a workbook, or refreshes OAuth credentials.
 */
export function isMicrosoftHealthCheckEnabled(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  const entraConfigured = MICROSOFT_ENVIRONMENT_KEYS.every((key) =>
    isNonBlank(env[key]),
  );
  const replitDevConnectorConfigured =
    env.NODE_ENV !== "production" &&
    isNonBlank(env.REPLIT_CONNECTORS_HOSTNAME) &&
    (isNonBlank(env.REPL_IDENTITY) || isNonBlank(env.WEB_REPL_RENEWAL));

  return entraConfigured || replitDevConnectorConfigured;
}

function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) {
    throw new DOMException("Health check aborted", "AbortError");
  }
}

function abortable<T>(operation: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) {
    return Promise.reject(new DOMException("Health check aborted", "AbortError"));
  }

  return new Promise<T>((resolve, reject) => {
    const onAbort = () =>
      reject(new DOMException("Health check aborted", "AbortError"));
    signal.addEventListener("abort", onAbort, { once: true });
    operation.then(
      (value) => {
        signal.removeEventListener("abort", onAbort);
        resolve(value);
      },
      (error) => {
        signal.removeEventListener("abort", onAbort);
        reject(error);
      },
    );
  });
}

/**
 * Bound database probes beyond the HTTP-level timeout. node-postgres's
 * query_timeout only stops the caller waiting; destroying the isolated client
 * on any abort/error also closes its connection, so a stalled catalog query
 * cannot linger in the shared pool and accumulate across monitor rounds.
 */
export async function runBoundedReadOnlyQuery<T>(
  acquireClient: () => Promise<HealthDatabaseClient>,
  text: string,
  signal: AbortSignal,
  queryTimeoutMs = DATABASE_QUERY_TIMEOUT_MS,
): Promise<HealthQueryResult<T>> {
  const pendingClient = acquireClient();
  let client: HealthDatabaseClient | undefined;

  try {
    client = await abortable(pendingClient, signal);
  } catch (error) {
    // A pool checkout may complete after the caller has timed out. Destroy the
    // late client as soon as it arrives so it cannot be used to run a stale
    // health query.
    void pendingClient.then(
      (lateClient) => lateClient.release(true),
      () => undefined,
    );
    throw error;
  }

  try {
    const query = client.query({ text, query_timeout: queryTimeoutMs });
    return (await abortable(query, signal)) as HealthQueryResult<T>;
  } catch (error) {
    client.release(true);
    client = undefined;
    throw error;
  } finally {
    client?.release();
  }
}

function areAuthenticationPrerequisitesReady(
  prerequisites: AuthenticationPrerequisites,
): boolean {
  return (
    prerequisites.usersTableReady &&
    prerequisites.usersColumnsReady &&
    prerequisites.sessionsTableReady &&
    prerequisites.sessionsColumnsReady
  );
}

function areScreenManagementPrerequisitesReady(
  prerequisites: ScreenManagementPrerequisites,
): boolean {
  return prerequisites.screensTableReady && prerequisites.screensColumnsReady;
}

async function queryHealthDatabase<T>(
  text: string,
  signal: AbortSignal,
): Promise<HealthQueryResult<T>> {
  return runBoundedReadOnlyQuery<T>(
    async () => {
      const client = await pool.connect();
      return {
        query: (config) => client.query(config as any),
        release: (destroy) => client.release(destroy),
      };
    },
    text,
    signal,
  );
}

const runtimeDependencies: HealthCheckDependencies = {
  queryDatabase: async (signal) => {
    await queryHealthDatabase("SELECT 1", signal);
  },
  queryAuthenticationPrerequisites: async (signal) => {
    const result = await queryHealthDatabase<AuthenticationPrerequisites>(
      `
        SELECT
          EXISTS (
            SELECT 1
            FROM pg_catalog.pg_class relation
            JOIN pg_catalog.pg_namespace namespace
              ON namespace.oid = relation.relnamespace
            WHERE namespace.nspname = 'public'
              AND relation.relname = 'users'
              AND relation.relkind IN ('r', 'p')
          ) AS "usersTableReady",
          (
            SELECT count(DISTINCT column_name) = 7
            FROM information_schema.columns
            WHERE table_schema = 'public'
              AND table_name = 'users'
              AND column_name IN (
                'id', 'email', 'password_hash', 'is_active',
                'two_factor_enabled', 'two_factor_secret', 'last_login_at'
              )
          ) AS "usersColumnsReady",
          EXISTS (
            SELECT 1
            FROM pg_catalog.pg_class relation
            JOIN pg_catalog.pg_namespace namespace
              ON namespace.oid = relation.relnamespace
            WHERE namespace.nspname = 'public'
              AND relation.relname = 'sessions'
              AND relation.relkind IN ('r', 'p')
          ) AS "sessionsTableReady",
          (
            SELECT count(DISTINCT column_name) = 3
            FROM information_schema.columns
            WHERE table_schema = 'public'
              AND table_name = 'sessions'
              AND column_name IN ('sid', 'sess', 'expire')
          ) AS "sessionsColumnsReady"
      `,
      signal,
    );
    return (
      result.rows[0] ?? {
        usersTableReady: false,
        usersColumnsReady: false,
        sessionsTableReady: false,
        sessionsColumnsReady: false,
      }
    );
  },
  queryScreenManagementPrerequisites: async (signal) => {
    const result = await queryHealthDatabase<ScreenManagementPrerequisites>(
      `
        SELECT
          EXISTS (
            SELECT 1
            FROM pg_catalog.pg_class relation
            JOIN pg_catalog.pg_namespace namespace
              ON namespace.oid = relation.relnamespace
            WHERE namespace.nspname = 'public'
              AND relation.relname = 'screens'
              AND relation.relkind IN ('r', 'p')
          ) AS "screensTableReady",
          (
            SELECT count(DISTINCT column_name) = 6
            FROM information_schema.columns
            WHERE table_schema = 'public'
              AND table_name = 'screens'
              AND column_name IN (
                'id', 'name', 'client_id', 'pairing_code',
                'device_token', 'is_paired'
              )
          ) AS "screensColumnsReady"
      `,
      signal,
    );
    return (
      result.rows[0] ?? {
        screensTableReady: false,
        screensColumnsReady: false,
      }
    );
  },
  getUploadRoot,
  stat: (path) => fs.stat(path),
  access: (path, mode) => fs.access(path, mode),
  getMicrosoftEntraStatus,
};

/**
 * Build the concrete registry for dependencies VectorMesh really uses.
 *
 * Cache readiness is covered by the PostgreSQL check because the shared L2
 * cache is PostgreSQL-backed and the L1 cache is in-process. There is no
 * Redis, queue, or object-storage dependency to probe.
 */
export function createHealthChecks(
  env: NodeJS.ProcessEnv = process.env,
  dependencies: HealthCheckDependencies = runtimeDependencies,
): HealthCheck[] {
  const checks: HealthCheck[] = [
    {
      name: "database",
      critical: true,
      group: "dependency",
      run: async ({ signal }) => {
        throwIfAborted(signal);
        // Minimal, read-only PostgreSQL readiness probe. Do not touch an
        // application table or run a scan.
        await dependencies.queryDatabase(signal);
        throwIfAborted(signal);
        return { status: "ok" };
      },
    },
    {
      name: "file-storage",
      critical: true,
      group: "dependency",
      run: async ({ signal }) => {
        throwIfAborted(signal);
        // getUploadRoot resolves the configured local storage root. stat and
        // access are read-only: no probe file or directory is created here.
        const root = await dependencies.getUploadRoot();
        const stats = await dependencies.stat(root);
        if (!stats.isDirectory()) {
          return { status: "fail", message: "storage unavailable" };
        }
        await dependencies.access(root, fsConstants.R_OK | fsConstants.W_OK);
        throwIfAborted(signal);
        return { status: "ok" };
      },
    },
    {
      name: "authentication",
      critical: true,
      group: "capability",
      coverage: HEALTH_CAPABILITY_COVERAGE.authentication,
      run: async ({ signal }) => {
        throwIfAborted(signal);
        // Do not call the login route: it regenerates/saves a session and
        // records user activity. This validates only its safe prerequisites.
        if (!isNonBlank(env.SESSION_SECRET)) {
          return { status: "fail", message: "authentication unavailable" };
        }
        const prerequisites =
          await dependencies.queryAuthenticationPrerequisites(
          signal,
        );
        throwIfAborted(signal);
        return areAuthenticationPrerequisitesReady(prerequisites)
          ? { status: "ok" }
          : { status: "fail", message: "authentication unavailable" };
      },
    },
    {
      name: "screen-management",
      critical: true,
      group: "capability",
      coverage: HEALTH_CAPABILITY_COVERAGE.screenManagement,
      run: async ({ signal }) => {
        throwIfAborted(signal);
        // Do not call POST /api/screens or other screen mutations. The query
        // checks the schema that those routes require without creating data,
        // issuing pairing codes, sending refreshes, or writing audit records.
        const prerequisites =
          await dependencies.queryScreenManagementPrerequisites(
          signal,
        );
        throwIfAborted(signal);
        return areScreenManagementPrerequisitesReady(prerequisites)
          ? { status: "ok" }
          : { status: "fail", message: "screen management unavailable" };
      },
    },
  ];

  if (isMicrosoftHealthCheckEnabled(env)) {
    checks.push({
      name: "microsoft-graph",
      critical: false,
      group: "dependency",
      run: async ({ signal }) => {
        throwIfAborted(signal);
        // Read local Entra credential state only. Calling Graph or forcing a
        // silent refresh would consume provider capacity and may mutate its
        // token cache, neither of which is safe for a recurring probe.
        const status = await dependencies.getMicrosoftEntraStatus();
        throwIfAborted(signal);
        return status.connected
          ? { status: "ok" }
          : { status: "degraded", message: "not connected" };
      },
    });
  }

  return checks;
}