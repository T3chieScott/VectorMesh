/**
 * The monitor's bounded, local view of the server-authenticated Player lease.
 * It is intentionally constant-space: one accepted lease is enough to decide
 * whether the monitor follows the Player or returns to deterministic fallback.
 */
export const MONITOR_AUTHORITY_TTL_MS = 45_000;
export type MonitorCandidateRetryKey = "retry-a" | "retry-b";

export function nextMonitorCandidateRetryKey(
  current: MonitorCandidateRetryKey,
): MonitorCandidateRetryKey {
  return current === "retry-a" ? "retry-b" : "retry-a";
}

export function buildMonitorFrameIdentity(
  sceneIdentity: string,
  retryKey: MonitorCandidateRetryKey,
): string {
  return `${sceneIdentity}:${retryKey}`;
}

export type MonitorAuthorityReport = {
  processId: string;
  revision: string;
  activationEpoch: number;
  sceneId: string;
  processGeneration: number;
  sequence: number;
  sceneGeneration: number;
  sceneActivationEpoch?: number;
  source?: string;
  playlistId?: string;
  agenda?: Array<{ zoneId: string; stage: string; page: number; cycle: number }>;
  /** Existing server receipt epoch for the physical report. */
  reportedAt: number;
};

export type MonitorAuthorityState = {
  report: MonitorAuthorityReport | null;
  receivedAt: number | null;
  expiresAt: number | null;
};

export function createMonitorAuthorityState(): MonitorAuthorityState {
  return { report: null, receivedAt: null, expiresAt: null };
}

export function observeMonitorAuthority(
  state: MonitorAuthorityState,
  candidate: unknown,
  receivedAt: number,
  serverTime = receivedAt,
): MonitorAuthorityState {
  const current = readFreshMonitorAuthority(state, receivedAt);
  if (!isMonitorAuthorityReport(candidate)) {
    // A null observation can mean an already-expired server lease or a
    // transient read failure. It must not evict a lease that this monitor
    // already authenticated and still considers fresh.
    return current ? state : createMonitorAuthorityState();
  }
  const report = candidate;
  if (!current || isNewerReport(report, current)) {
    // reportedAt and serverTime share the server clock. Convert only the
    // remaining lease duration onto the receipt clock; this is robust to
    // browser/server epoch skew and never gives an aged report a fresh TTL.
    if (!Number.isSafeInteger(serverTime) || serverTime < 0) {
      return current ? state : createMonitorAuthorityState();
    }
    const serverAge = Math.max(0, serverTime - report.reportedAt);
    const remaining = Math.max(0, MONITOR_AUTHORITY_TTL_MS - serverAge);
    if (remaining === 0) {
      return current ? state : createMonitorAuthorityState();
    }
    return { report, receivedAt, expiresAt: receivedAt + remaining };
  }
  if (isSameReport(report, current)) {
    // Do not renew local authority from a duplicate. The server's lease age is
    // not in the observation payload, so renewing here could outlive the
    // physical Player's 45-second lease indefinitely.
    return state;
  }
  // Delayed, duplicated-with-different-content, and colliding-process polls
  // do not extend or replace the authority lease.
  return state;
}

export function readFreshMonitorAuthority(
  state: MonitorAuthorityState,
  now: number,
): MonitorAuthorityReport | undefined {
  return state.report !== null && state.expiresAt !== null &&
    now <= state.expiresAt
    ? state.report
    : undefined;
}

function isNewerReport(next: MonitorAuthorityReport, previous: MonitorAuthorityReport): boolean {
  if (next.processGeneration !== previous.processGeneration) {
    return next.processGeneration > previous.processGeneration;
  }
  if (next.processId !== previous.processId) return false;
  return next.sequence > previous.sequence &&
    next.sceneGeneration >= previous.sceneGeneration;
}

function isSameReport(next: MonitorAuthorityReport, previous: MonitorAuthorityReport): boolean {
  return next.processGeneration === previous.processGeneration &&
    next.processId === previous.processId &&
    next.sequence === previous.sequence &&
    next.sceneGeneration === previous.sceneGeneration &&
    next.revision === previous.revision &&
    next.activationEpoch === previous.activationEpoch &&
    next.sceneId === previous.sceneId &&
    next.sceneActivationEpoch === previous.sceneActivationEpoch;
}

function isMonitorAuthorityReport(value: unknown): value is MonitorAuthorityReport {
  const report = value as Partial<MonitorAuthorityReport> | null;
  return !!report &&
    typeof report.processId === "string" && report.processId.length > 0 &&
    typeof report.revision === "string" && report.revision.length > 0 &&
    Number.isSafeInteger(report.activationEpoch) && (report.activationEpoch as number) >= 0 &&
    typeof report.sceneId === "string" && report.sceneId.length > 0 &&
    Number.isSafeInteger(report.processGeneration) && (report.processGeneration as number) > 0 &&
    Number.isSafeInteger(report.sequence) && (report.sequence as number) > 0 &&
    Number.isSafeInteger(report.sceneGeneration) && (report.sceneGeneration as number) > 0 &&
    Number.isSafeInteger(report.reportedAt) && (report.reportedAt as number) >= 0;
}