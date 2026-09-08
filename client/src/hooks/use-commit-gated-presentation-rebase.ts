import { useEffect, useRef } from "react";
import {
  claimPresentationRebase,
  createPresentationRebaseState,
} from "@/lib/frame-transition";

/**
 * Applies the shared-clock join/recovery position once, after a presentation
 * sequence has visibly committed. Subsequent frame commits belong to the
 * Player's local dwell/Agenda coordinator until the sequence changes.
 */
export function useCommitGatedPresentationRebase(
  presentationSequenceIdentity: string,
  isPresentationCommitted: boolean,
  applyWallClockIndex: () => void,
): void {
  const rebaseStateRef = useRef(createPresentationRebaseState());
  const applyWallClockIndexRef = useRef(applyWallClockIndex);

  // The effect below deliberately does not depend on this callback. A poll or
  // rerender may create a fresh closure, but must never earn another rebase.
  useEffect(() => {
    applyWallClockIndexRef.current = applyWallClockIndex;
  }, [applyWallClockIndex]);

  useEffect(() => {
    if (claimPresentationRebase(
      rebaseStateRef.current,
      presentationSequenceIdentity,
      isPresentationCommitted,
    )) {
      applyWallClockIndexRef.current();
    }
  }, [presentationSequenceIdentity, isPresentationCommitted]);
}
