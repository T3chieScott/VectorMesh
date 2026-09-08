/**
 * Small, host-neutral guards for the two-phase render surface protocol.
 * A frame is allowed to affect host state only while it is still desired.
 */
export function acceptsCommittedFrame(
  desiredIdentity: string,
  reportedIdentity: string,
): boolean {
  return desiredIdentity === reportedIdentity;
}

/** Preserve the last visible identity when an async acknowledgement is stale. */
export function committedIdentityAfterReport(
  previousIdentity: string | null,
  desiredIdentity: string,
  reportedIdentity: string,
): string | null {
  return acceptsCommittedFrame(desiredIdentity, reportedIdentity)
    ? reportedIdentity
    : previousIdentity;
}

export function shouldAdvanceSkippedRotation({
  rotating,
  desiredIdentity,
  skippedIdentity,
  alreadyCommitted,
  itemCount,
}: {
  rotating: boolean;
  desiredIdentity: string;
  skippedIdentity: string;
  alreadyCommitted: boolean;
  itemCount: number;
}): boolean {
  return rotating &&
    desiredIdentity === skippedIdentity &&
    !alreadyCommitted &&
    itemCount > 1;
}

/**
 * Scene selection is safe to follow before the currently desired frame has
 * committed. Page/agenda follower state remains separately commit-gated.
 * The monitor endpoint has already authenticated and screen-scoped the report.
 */
export function observedRotationSelection(
  reportedSceneId: string | undefined,
  rotationSceneIds: readonly (string | null | undefined)[],
): number | null {
  if (!reportedSceneId) return null;
  const index = rotationSceneIds.indexOf(reportedSceneId);
  return index >= 0 ? index : null;
}

/** Return a presentation payload only when it describes the visible frame. */
export function visiblePresentationEmission<T>(
  committedIdentity: string | null,
  emissionIdentity: string,
  payload: T,
): T | null {
  return committedIdentity === emissionIdentity ? payload : null;
}

/** Lazily allocate an emission only after its identity is visibly committed. */
export function createVisiblePresentationEmission<T>(
  committedIdentity: string | null,
  emissionIdentity: string | null,
  create: () => T,
): T | undefined {
  return emissionIdentity && committedIdentity === emissionIdentity ? create() : undefined;
}

/** Heartbeats always carry video health; presentation is deliberately omitted until complete. */
export function buildHeartbeatErrorsPayload<V, P>(
  video: V,
  presentation: P | undefined,
): { video: V; presentation?: P } {
  return presentation === undefined ? { video } : { video, presentation };
}

/** Server lease fields that must exist before a heartbeat may own presentation state. */
export function isCompletePresentationReport(value: unknown): value is {
  revision: string; activationEpoch: number; sceneId: string; sceneGeneration: number;
} {
  const report = value as Record<string, unknown> | null;
  return !!report && typeof report.revision === "string" && report.revision.length > 0 &&
    Number.isSafeInteger(report.activationEpoch) && typeof report.sceneId === "string" &&
    report.sceneId.length > 0 && Number.isSafeInteger(report.sceneGeneration) &&
    (report.sceneGeneration as number) > 0;
}