import "./setup-jsdom";

import test from "node:test";
import assert from "node:assert/strict";
import * as React from "react";
import { cleanup, render } from "@testing-library/react";
import { useCommitGatedPresentationRebase } from "../client/src/hooks/use-commit-gated-presentation-rebase";

function RebaseHarness({
  sequenceIdentity,
  committed,
  onRebase,
}: {
  sequenceIdentity: string;
  committed: boolean;
  onRebase: () => void;
}) {
  useCommitGatedPresentationRebase(sequenceIdentity, committed, onRebase);
  return null;
}

test("mounted hook claims once per current sequence occurrence and ignores callback rerenders", () => {
  const calls: string[] = [];
  const view = render(<RebaseHarness
    sequenceIdentity="r1"
    committed={false}
    onRebase={() => calls.push("preparing")}
  />);
  try {
    // Preparing, skipped, and stale candidates all remain uncommitted.
    view.rerender(<RebaseHarness sequenceIdentity="r1" committed={false} onRebase={() => calls.push("skipped")} />);
    view.rerender(<RebaseHarness sequenceIdentity="r1" committed={false} onRebase={() => calls.push("stale")} />);
    assert.deepEqual(calls, []);

    view.rerender(<RebaseHarness sequenceIdentity="r1" committed onRebase={() => calls.push("initial")} />);
    assert.deepEqual(calls, ["initial"]);

    // An equivalent poll creates a new callback closure, but does not rebase.
    view.rerender(<RebaseHarness sequenceIdentity="r1" committed onRebase={() => calls.push("equivalent")} />);
    view.rerender(<RebaseHarness sequenceIdentity="r1" committed={false} onRebase={() => calls.push("handoff")} />);
    view.rerender(<RebaseHarness sequenceIdentity="r1" committed onRebase={() => calls.push("wrapped")} />);
    assert.deepEqual(calls, ["initial"]);

    // r2 arrives while r1's old frame is still visible. Player passes false
    // here because its committed sequence remains r1, so r2 cannot claim.
    view.rerender(<RebaseHarness
      sequenceIdentity="r2"
      committed={false}
      onRebase={() => calls.push("r2-old-r1-frame")}
    />);
    assert.deepEqual(calls, ["initial"]);

    // An accepted r2 frame commit makes the sequence eligible once.
    view.rerender(<RebaseHarness sequenceIdentity="r2" committed onRebase={() => calls.push("r2")} />);
    assert.deepEqual(calls, ["initial", "r2"]);

    // Returning to r1 after r2 starts a new occurrence and claims once.
    view.rerender(<RebaseHarness sequenceIdentity="r1" committed onRebase={() => calls.push("r1-return")} />);
    view.rerender(<RebaseHarness sequenceIdentity="r1" committed={false} onRebase={() => calls.push("r1-handoff")} />);
    view.rerender(<RebaseHarness sequenceIdentity="r1" committed onRebase={() => calls.push("r1-repeat")} />);
    assert.deepEqual(calls, ["initial", "r2", "r1-return"]);

    // Further semantic identities each earn one rebase after their own commit.
    for (const identity of ["epoch-2", "playlist-2", "sequence-2"]) {
      view.rerender(<RebaseHarness sequenceIdentity={identity} committed={false} onRebase={() => calls.push(`${identity}-early`)} />);
      view.rerender(<RebaseHarness sequenceIdentity={identity} committed onRebase={() => calls.push(identity)} />);
      view.rerender(<RebaseHarness sequenceIdentity={identity} committed onRebase={() => calls.push(`${identity}-repeat`)} />);
    }
    assert.deepEqual(calls, ["initial", "r2", "r1-return", "epoch-2", "playlist-2", "sequence-2"]);
  } finally {
    cleanup();
  }
});
