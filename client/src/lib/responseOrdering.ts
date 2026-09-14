/**
 * Small, host-neutral ordering primitive for polling endpoints.
 *
 * A response is ordered by when its request started, not by when it
 * completed.  This is intentionally separate from AbortController: aborting
 * a fetch is best effort and a response (or an error) can still win the
 * race with cleanup.  Callers must check isCurrent before every observable
 * mutation.
 */
export type RequestSequence = number;

export interface LatestStartedOrdering {
  begin(): RequestSequence;
  isCurrent(sequence: RequestSequence): boolean;
  latest(): RequestSequence;
}

export function createLatestStartedOrdering(): LatestStartedOrdering {
  let latestSequence = 0;
  return {
    begin() {
      latestSequence += 1;
      return latestSequence;
    },
    isCurrent(sequence) {
      return sequence === latestSequence;
    },
    latest() {
      return latestSequence;
    },
  };
}

/** Pure form useful when a caller stores the latest sequence in a ref. */
export function isLatestStarted(
  latestSequence: RequestSequence,
  responseSequence: RequestSequence,
): boolean {
  return latestSequence === responseSequence;
}
