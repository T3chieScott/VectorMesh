import test, { describe } from "node:test";
import assert from "node:assert/strict";
import {
  agendaPollDelayMs,
  buildAgendaDisplayPollUrl,
  isCurrentAgendaPoll,
  reduceAgendaPoll,
} from "../client/src/lib/agendaDisplayPolling";

describe("agenda display polling", () => {
  test("a successful 5 second payload schedules the next poll at 5 seconds", () => {
    assert.equal(agendaPollDelayMs(5), 5_000);
    assert.equal(agendaPollDelayMs(1), 5_000);
    assert.equal(agendaPollDelayMs(12), 12_000);
  });

  test("every request is cache-busted while preserving preview time", () => {
    const at = "2026-05-04T09:30:00.000Z";
    const first = buildAgendaDisplayPollUrl("config/a", at, 1);
    const second = buildAgendaDisplayPollUrl("config/a", at, 2);
    assert.notEqual(first, second);
    assert.match(first, /^\/api\/agenda\/display\/config%2Fa\?/);
    const params = new URL(first, "https://example.test").searchParams;
    assert.equal(params.get("at"), at);
    assert.equal(params.get("_vmr"), "1");
  });

  test("live polls also receive a unique cache buster", () => {
    const url = buildAgendaDisplayPollUrl("abc", null, 42);
    const params = new URL(url, "https://example.test").searchParams;
    assert.equal(params.has("at"), false);
    assert.equal(params.get("_vmr"), "42");
  });

  test("a successful second empty payload replaces the first nonempty payload", () => {
    const first = reduceAgendaPoll(
      { data: null, error: null, retired: false },
      { type: "success", data: { items: [{ id: "old" }] } },
    );
    const empty = reduceAgendaPoll(first, {
      type: "success",
      data: { items: [] as Array<{ id: string }> },
    });
    assert.deepEqual(empty.data?.items, []);
    assert.equal(empty.retired, false);
  });

  test("5xx retains valid data while 404 is a distinct terminal outcome", () => {
    const valid = {
      data: { items: [{ id: "a" }] },
      error: null,
      retired: false,
    };
    assert.deepEqual(
      reduceAgendaPoll(valid, { type: "failure", error: "HTTP 500" }),
      valid,
    );
    assert.deepEqual(
      reduceAgendaPoll(valid, { type: "not-found" }),
      { data: null, error: null, retired: true },
    );
  });

  test("an old config generation cannot apply after a route change", () => {
    assert.equal(isCurrentAgendaPoll(1, 2, false), false);
    assert.equal(isCurrentAgendaPoll(2, 2, true), false);
    assert.equal(isCurrentAgendaPoll(2, 2, false), true);
  });
});