import test from "node:test";
import assert from "node:assert/strict";
import {
  applyGlobalHideOverride,
  parseGlobalHideValue,
  GLOBAL_HIDE_NO_CONTENT_MESSAGE_KEY,
} from "../server/globalHideOverride";

test("GLOBAL_HIDE_NO_CONTENT_MESSAGE_KEY matches the documented setting key", () => {
  assert.equal(GLOBAL_HIDE_NO_CONTENT_MESSAGE_KEY, "global_hide_no_content_message");
});

test("parseGlobalHideValue: 'true' (lowercase) is true", () => {
  assert.equal(parseGlobalHideValue("true"), true);
});

test("parseGlobalHideValue: ' TRUE ' (mixed case w/ whitespace) is true", () => {
  assert.equal(parseGlobalHideValue(" TRUE "), true);
});

test("parseGlobalHideValue: 'false' is false", () => {
  assert.equal(parseGlobalHideValue("false"), false);
});

test("parseGlobalHideValue: empty string is false", () => {
  assert.equal(parseGlobalHideValue(""), false);
});

test("parseGlobalHideValue: undefined is false", () => {
  assert.equal(parseGlobalHideValue(undefined), false);
});

test("parseGlobalHideValue: null is false", () => {
  assert.equal(parseGlobalHideValue(null), false);
});

test("parseGlobalHideValue: garbage value is false", () => {
  assert.equal(parseGlobalHideValue("yes"), false);
  assert.equal(parseGlobalHideValue("1"), false);
});

test("applyGlobalHideOverride: global off + per-screen off => false (unchanged)", () => {
  const screen = { id: "a", hideNoContentMessage: false };
  const out = applyGlobalHideOverride(screen, false);
  assert.equal(out.hideNoContentMessage, false);
  assert.equal(out, screen, "should return the same object reference when no change");
});

test("applyGlobalHideOverride: global off + per-screen on => true (unchanged)", () => {
  const screen = { id: "a", hideNoContentMessage: true };
  const out = applyGlobalHideOverride(screen, false);
  assert.equal(out.hideNoContentMessage, true);
  assert.equal(out, screen);
});

test("applyGlobalHideOverride: global on + per-screen off => true (overridden)", () => {
  const screen = { id: "a", hideNoContentMessage: false, otherField: "keep" };
  const out = applyGlobalHideOverride(screen, true);
  assert.equal(out.hideNoContentMessage, true);
  assert.equal(out.otherField, "keep");
  assert.notEqual(out, screen, "should return a copy, not mutate input");
  assert.equal(screen.hideNoContentMessage, false, "input must not be mutated");
});

test("applyGlobalHideOverride: global on + per-screen on => true (no copy needed)", () => {
  const screen = { id: "a", hideNoContentMessage: true };
  const out = applyGlobalHideOverride(screen, true);
  assert.equal(out.hideNoContentMessage, true);
  assert.equal(out, screen, "no copy needed when already true");
});

test("applyGlobalHideOverride: global on + per-screen null/undefined => true", () => {
  const screenNull = { id: "a", hideNoContentMessage: null as boolean | null };
  const outNull = applyGlobalHideOverride(screenNull, true);
  assert.equal(outNull.hideNoContentMessage, true);
  assert.equal(screenNull.hideNoContentMessage, null, "input must not be mutated");

  const screenU: { id: string; hideNoContentMessage?: boolean } = { id: "b" };
  const outU = applyGlobalHideOverride(screenU, true);
  assert.equal(outU.hideNoContentMessage, true);
});
