import { constants as fsConstants, promises as fs } from "node:fs";
import { pool } from "../db";
import { getUploadRoot } from "../fileStorage";
import { getMicrosoftEntraStatus } from "../microsoftOAuth";

export type HealthCheckStatus = "ok" | "degraded" | "fail";

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
  /** All checks are read-only and receive cancellation from their timeout. */
  run: (context: { signal: AbortSignal }) => Promise<HealthCheckRunResult>;
}

export interface HealthCheckDependencies {
  /**
   * A read-only database readiness probe. The signal lets the handler stop
   * awaiting a stalled database operation at its hard deadline.
   */
  queryDatabase: (signal: AbortSignal) => Promise<void>;
  getUploadRoot: () => Promise<string>;
  stat: (path: string) => Promise<{ isDirectory: () => boolean }>;
  access: (path: string, mode: number) => Promise<void>;
  getMicrosoftEntraStatus: () => Promise<{ connected: boolean }>;
}

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

const runtimeDependencies: HealthCheckDependencies = {
  queryDatabase: async (signal) => {
    // node-postgres does not expose AbortSignal in this installed version.
    // Race the read-only query with the handler's signal so a deadline stops
    // this health execution from awaiting a stalled connection.
    await abortable(pool.query("SELECT 1"), signal);
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
  ];

  if (isMicrosoftHealthCheckEnabled(env)) {
    checks.push({
      name: "microsoft-graph",
      critical: false,
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