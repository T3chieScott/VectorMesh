import assert from "node:assert/strict";
import test from "node:test";
import {
  createLatestStartedOrdering,
  isLatestStarted,
} from "../client/src/lib/responseOrdering";

test("latest-started ordering ignores a deferred earlier completion", async () => {
  const ordering = createLatestStartedOrdering();
  const first = ordering.begin();
  const second = ordering.begin();
  const applied: string[] = [];

  await Promise.resolve().then(() => {
    if (ordering.isCurrent(first)) applied.push("first");
  });
  await Promise.resolve().then(() => {
    if (ordering.isCurrent(second)) applied.push("second");
  });

  assert.deepEqual(applied, ["second"]);
  assert.equal(isLatestStarted(ordering.latest(), first), false);
  assert.equal(isLatestStarted(ordering.latest(), second), true);
});

test("content and authority streams can retain separate ordering", () => {
  const content = createLatestStartedOrdering();
  const authority = createLatestStartedOrdering();
  const contentOne = content.begin();
  const authorityOne = authority.begin();
  const contentTwo = content.begin();

  assert.equal(content.isCurrent(contentOne), false);
  assert.equal(content.isCurrent(contentTwo), true);
  assert.equal(authority.isCurrent(authorityOne), true);
});
