import { test } from "node:test";
import assert from "node:assert/strict";
import {
  getDefaultScheduleTimezone,
  resetDefaultScheduleTimezoneCache,
} from "../server/scheduleTimezone";

function withEnv(value: string | undefined, fn: () => void) {
  const saved = process.env.DEFAULT_SCHEDULE_TIMEZONE;
  if (value === undefined) {
    delete process.env.DEFAULT_SCHEDULE_TIMEZONE;
  } else {
    process.env.DEFAULT_SCHEDULE_TIMEZONE = value;
  }
  resetDefaultScheduleTimezoneCache();
  try {
    fn();
  } finally {
    if (saved === undefined) {
      delete process.env.DEFAULT_SCHEDULE_TIMEZONE;
    } else {
      process.env.DEFAULT_SCHEDULE_TIMEZONE = saved;
    }
    resetDefaultScheduleTimezoneCache();
  }
}

test("getDefaultScheduleTimezone falls back to Europe/London when env is unset", () => {
  withEnv(undefined, () => {
    assert.equal(getDefaultScheduleTimezone(), "Europe/London");
  });
});

test("getDefaultScheduleTimezone honours a valid env override", () => {
  withEnv("America/New_York", () => {
    assert.equal(getDefaultScheduleTimezone(), "America/New_York");
  });
});

test("getDefaultScheduleTimezone trims surrounding whitespace before validating", () => {
  withEnv("  Asia/Tokyo  ", () => {
    assert.equal(getDefaultScheduleTimezone(), "Asia/Tokyo");
  });
});

test("getDefaultScheduleTimezone falls back when env names a bogus zone", () => {
  withEnv("Mars/Olympus_Mons", () => {
    assert.equal(getDefaultScheduleTimezone(), "Europe/London");
  });
});

test("getDefaultScheduleTimezone falls back on empty string", () => {
  withEnv("   ", () => {
    assert.equal(getDefaultScheduleTimezone(), "Europe/London");
  });
});

test("getDefaultScheduleTimezone caches the result for the process", () => {
  withEnv("America/New_York", () => {
    assert.equal(getDefaultScheduleTimezone(), "America/New_York");
    // Mutate env without resetting the cache; expected to keep returning the cached value.
    process.env.DEFAULT_SCHEDULE_TIMEZONE = "Asia/Tokyo";
    assert.equal(getDefaultScheduleTimezone(), "America/New_York");
  });
});
