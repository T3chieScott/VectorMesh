import crypto from "node:crypto";
import type { Express, Request, Response } from "express";
import type {
  HealthCheck,
  HealthCheckCoverage,
  HealthCheckGroup,
  HealthCheckRunResult,
  HealthCheckStatus,
} from "./checks";
import { HEALTH_CAPABILITY_COVERAGE } from "./checks";

export const DEEP_HEALTH_PATH = "/internal/health/deep";
export const CHECK_TIMEOUT_MS = 3_000;
export const HANDLER_TIMEOUT_MS = 10_000;

export interface DeepHealthCheckResult {
  name: string;
  status: HealthCheckStatus;
  durationMs: number;
  /**
   * Present on authenticated runtime checks. The unconfigured-token response
   * intentionally keeps its established minimal configuration-check shape.
   */
  critical?: boolean;
  group?: HealthCheckGroup;
  coverage?: HealthCheckCoverage;
  message?: string;
}

export interface DeepHealthResult {
  status: HealthCheckStatus;
  durationMs: number;
  /**
   * Backwards-compatible complete flat list. Use dependencies/capabilities
   * for grouped operator-facing reporting.
   */
  checks: DeepHealthCheckResult[];
  dependencies?: DeepHealthCheckResult[];
  capabilities?: DeepHealthCheckResult[];
}

export interface DeepHealthRouteOptions {
  getHealthToken: () => string | undefined;
  getChecks: () => readonly HealthCheck[];
  checkTimeoutMs?: number;
  handlerTimeoutMs?: number;
  logFailure?: (message: string) => void;
}

const CONFIGURATION_FAILURE: DeepHealthResult = {
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
};

const SAFE_MESSAGES = new Set([
  "check failed",
  "check timed out",
  "health check timed out",
  "health check unavailable",
  "authentication unavailable",
  "not connected",
  "not configured",
  "screen management unavailable",
  "service unavailable",
  "storage unavailable",
]);

function durationMs(start: number): number {
  return Math.max(0, Math.round(performance.now() - start));
}

function isConfigured(token: string | undefined): token is string {
  return typeof token === "string" && token.trim().length > 0;
}

function safeMessage(message: string | undefined, fallback: string): string {
  return message && SAFE_MESSAGES.has(message) ? message : fallback;
}

function statusForFailedCheck(check: HealthCheck): HealthCheckStatus {
  return check.critical ? "fail" : "degraded";
}

const SAFE_CAPABILITY_COVERAGE = new Set<string>(
  Object.values(HEALTH_CAPABILITY_COVERAGE),
);

function checkMetadata(
  check: HealthCheck,
): Pick<DeepHealthCheckResult, "critical" | "group" | "coverage"> {
  const group = check.group ?? "dependency";
  const coverage =
    group === "capability" &&
    check.coverage &&
    SAFE_CAPABILITY_COVERAGE.has(check.coverage)
      ? check.coverage
      : undefined;

  return {
    critical: check.critical,
    group,
    ...(coverage ? { coverage } : {}),
  };
}

function normaliseReturnedStatus(
  check: HealthCheck,
  result: HealthCheckRunResult,
): { status: HealthCheckStatus; message?: string } {
  if (result.status === "ok") return { status: "ok" };
  if (result.status === "degraded") {
    return {
      status: "degraded",
      message: safeMessage(result.message, "service unavailable"),
    };
  }

  return {
    status: statusForFailedCheck(check),
    message: safeMessage(result.message, "check failed"),
  };
}

/**
 * Hash both values before timingSafeEqual. SHA-256 always produces a
 * fixed-length digest, so a malformed or short header cannot make
 * timingSafeEqual throw and create a distinguishable authentication failure.
 */
export function hasValidHealthToken(
  suppliedToken: string | undefined,
  configuredToken: string | undefined,
): boolean {
  if (!isConfigured(configuredToken)) return false;
  const suppliedDigest = crypto
    .createHash("sha256")
    .update(suppliedToken ?? "")
    .digest();
  const configuredDigest = crypto
    .createHash("sha256")
    .update(configuredToken)
    .digest();
  return crypto.timingSafeEqual(suppliedDigest, configuredDigest);
}

/**
 * Warn at startup only. Kept separate from route mounting so test imports do
 * not produce warnings and so the warning cannot be emitted per request.
 */
export function warnIfHealthTokenUnavailable(
  token: string | undefined = process.env.HEALTH_CHECK_TOKEN,
): void {
  if (!isConfigured(token)) {
    console.warn(
      "[deep-health] HEALTH_CHECK_TOKEN is unset or blank; /internal/health/deep will return 503",
    );
  }
}

function withAbort(
  signal: AbortSignal,
  callback: () => void,
): () => void {
  if (signal.aborted) {
    callback();
    return () => {};
  }
  signal.addEventListener("abort", callback, { once: true });
  return () => signal.removeEventListener("abort", callback);
}

async function runCheck(
  check: HealthCheck,
  parentSignal: AbortSignal,
  timeoutMs: number,
  logFailure: (message: string) => void,
): Promise<DeepHealthCheckResult> {
  const started = performance.now();
  const controller = new AbortController();
  const removeParentAbort = withAbort(parentSignal, () => controller.abort());
  let timeout: ReturnType<typeof setTimeout> | undefined;

  const completion = Promise.resolve()
    .then(() => check.run({ signal: controller.signal }))
    .then(
      (result) => ({ kind: "result" as const, result }),
      () => ({ kind: "error" as const }),
    );
  // completion always handles the rejection. If a check ignores its abort
  // signal and later fails after the timeout race settled, it cannot become an
  // unhandled rejection.

  const timedOut = new Promise<{ kind: "timeout" }>((resolve) => {
    timeout = setTimeout(() => {
      controller.abort();
      resolve({ kind: "timeout" });
    }, timeoutMs);
  });

  let removeHandlerAbort = () => {};
  const parentAborted = new Promise<{ kind: "handler-timeout" }>((resolve) => {
    removeHandlerAbort = withAbort(parentSignal, () =>
      resolve({ kind: "handler-timeout" }),
    );
  });

  try {
    const outcome = await Promise.race([completion, timedOut, parentAborted]);
    if (outcome.kind === "result") {
      const normalised = normaliseReturnedStatus(check, outcome.result);
      return {
        name: check.name,
        status: normalised.status,
        durationMs: durationMs(started),
        ...checkMetadata(check),
        ...(normalised.message ? { message: normalised.message } : {}),
      };
    }

    if (outcome.kind === "error") {
      logFailure(`[deep-health] ${check.name} check failed`);
      return {
        name: check.name,
        status: statusForFailedCheck(check),
        durationMs: durationMs(started),
        ...checkMetadata(check),
        message: "check failed",
      };
    }

    const message =
      outcome.kind === "handler-timeout"
        ? "health check timed out"
        : "check timed out";
    logFailure(`[deep-health] ${check.name} ${message}`);
    return {
      name: check.name,
      status: statusForFailedCheck(check),
      durationMs: durationMs(started),
      ...checkMetadata(check),
      message,
    };
  } catch {
    // Kept as a final safety net. No raw exception details are placed in the
    // response, and the log line intentionally contains no token or provider
    // data.
    logFailure(`[deep-health] ${check.name} check failed`);
    return {
      name: check.name,
      status: statusForFailedCheck(check),
      durationMs: durationMs(started),
      ...checkMetadata(check),
      message: "check failed",
    };
  } finally {
    if (timeout) clearTimeout(timeout);
    removeParentAbort();
    removeHandlerAbort();
  }
}

function overallStatus(checks: readonly DeepHealthCheckResult[]): HealthCheckStatus {
  if (checks.some((check) => check.status === "fail")) return "fail";
  if (checks.some((check) => check.status === "degraded")) return "degraded";
  return "ok";
}

/**
 * Execute all registered checks concurrently. Every check has a hard timeout;
 * the parent AbortController provides a final deadline even if a check ignores
 * its own cancellation signal.
 */
export async function runDeepHealthChecks(
  checks: readonly HealthCheck[],
  {
    checkTimeoutMs = CHECK_TIMEOUT_MS,
    handlerTimeoutMs = HANDLER_TIMEOUT_MS,
    logFailure = console.error,
  }: Pick<
    DeepHealthRouteOptions,
    "checkTimeoutMs" | "handlerTimeoutMs" | "logFailure"
  > = {},
): Promise<DeepHealthResult> {
  const started = performance.now();
  const controller = new AbortController();
  const handlerDeadline = setTimeout(
    () => controller.abort(),
    handlerTimeoutMs,
  );

  try {
    const settled = await Promise.allSettled(
      checks.map((check) =>
        runCheck(check, controller.signal, checkTimeoutMs, logFailure),
      ),
    );
    const results = settled.map((result, index) => {
      if (result.status === "fulfilled") return result.value;
      // runCheck catches its own errors, but preserve a safe result if an
      // unexpected implementation fault still escapes.
      const check = checks[index]!;
      logFailure(`[deep-health] ${check.name} check failed`);
      return {
        name: check.name,
        status: statusForFailedCheck(check),
        durationMs: 0,
        ...checkMetadata(check),
        message: "check failed",
      } satisfies DeepHealthCheckResult;
    });

    const dependencies = results.filter(
      (check) => check.group === "dependency",
    );
    const capabilities = results.filter(
      (check) => check.group === "capability",
    );

    return {
      status: overallStatus(results),
      durationMs: durationMs(started),
      checks: results,
      dependencies,
      capabilities,
    };
  } finally {
    clearTimeout(handlerDeadline);
  }
}

export function mountDeepHealthRoute(
  app: Express,
  options: DeepHealthRouteOptions,
): void {
  let inFlight: Promise<DeepHealthResult> | undefined;

  app.get(DEEP_HEALTH_PATH, async (req: Request, res: Response) => {
    res.set({
      "Cache-Control": "no-store",
      Pragma: "no-cache",
    });

    const configuredToken = options.getHealthToken();
    // Configuration takes precedence: a token cannot be validated if there is
    // no configured value. Do not execute checks in this mode.
    if (!isConfigured(configuredToken)) {
      return res.status(503).json(CONFIGURATION_FAILURE);
    }

    // Read only this header. Query values, cookies, and request bodies are
    // deliberately ignored. Both missing and invalid values get the identical
    // empty 401 response.
    const suppliedToken = req.header("X-Health-Token") ?? undefined;
    if (!hasValidHealthToken(suppliedToken, configuredToken)) {
      return res.status(401).end();
    }

    if (!inFlight) {
      inFlight = runDeepHealthChecks(options.getChecks(), options).finally(() => {
        inFlight = undefined;
      });
    }

    const result = await inFlight;
    return res.status(result.status === "fail" ? 503 : 200).json(result);
  });
}