export const MIN_AGENDA_POLL_SECONDS = 5;
export const DEFAULT_AGENDA_POLL_SECONDS = 30;

/** Build a unique no-cache URL without losing the optional preview instant. */
export function buildAgendaDisplayPollUrl(
  configId: string,
  atIso: string | null,
  requestSequence: number,
): string {
  const params = new URLSearchParams();
  if (atIso) params.set("at", atIso);
  params.set("_vmr", String(requestSequence));
  return `/api/agenda/display/${encodeURIComponent(configId)}?${params.toString()}`;
}

/** Successful payloads control the very next poll, subject to the 5s floor. */
export function agendaPollDelayMs(refreshIntervalSeconds?: number | null): number {
  const seconds = Number.isFinite(refreshIntervalSeconds)
    ? Number(refreshIntervalSeconds)
    : DEFAULT_AGENDA_POLL_SECONDS;
  return Math.max(MIN_AGENDA_POLL_SECONDS, seconds) * 1_000;
}

export interface AgendaPollSnapshot<T> {
  data: T | null;
  error: string | null;
  retired: boolean;
}

export type AgendaPollOutcome<T> =
  | { type: "success"; data: T }
  | { type: "failure"; error: string }
  | { type: "not-found" };

/** Pure specification for the public display's last-valid-frame policy. */
export function reduceAgendaPoll<T>(
  previous: AgendaPollSnapshot<T>,
  outcome: AgendaPollOutcome<T>,
): AgendaPollSnapshot<T> {
  if (outcome.type === "success") {
    return { data: outcome.data, error: null, retired: false };
  }
  if (outcome.type === "not-found") {
    return { data: null, error: null, retired: true };
  }
  return previous.data
    ? previous
    : { ...previous, error: outcome.error };
}

export function isCurrentAgendaPoll(
  responseGeneration: number,
  currentGeneration: number,
  cancelled: boolean,
): boolean {
  return !cancelled && responseGeneration === currentGeneration;
}
