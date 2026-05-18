import test from "node:test";
import assert from "node:assert/strict";
import { normalizeGoogleSheetsCsvUrl } from "../server/agendaSync";

// Operators paste the URL from their browser address bar, which
// serves the HTML editor — not CSV. The sync engine has to rewrite
// these into the export-as-csv form before fetching, otherwise the
// parser sees HTML and reports "ok" with zero items and a wall of
// "Invalid startsAt" warnings.

const SHEET_ID = "1SXfI-xeHqgkeG2kD8lFqcvG5imu2b1Id1e2Abvahcpg";

test("normalizeGoogleSheetsCsvUrl — /edit?gid=...#gid=... → export?format=csv&gid=...", () => {
  const input = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/edit?gid=997501812#gid=997501812`;
  const out = normalizeGoogleSheetsCsvUrl(input);
  assert.equal(
    out,
    `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=997501812`,
  );
});

test("normalizeGoogleSheetsCsvUrl — gid lives only in the fragment", () => {
  const input = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/edit#gid=42`;
  const out = normalizeGoogleSheetsCsvUrl(input);
  assert.equal(
    out,
    `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=42`,
  );
});

test("normalizeGoogleSheetsCsvUrl — /edit?usp=sharing (no gid) → export?format=csv", () => {
  const input = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/edit?usp=sharing`;
  const out = normalizeGoogleSheetsCsvUrl(input);
  assert.equal(
    out,
    `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv`,
  );
});

test("normalizeGoogleSheetsCsvUrl — already an export URL is left alone", () => {
  const input = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=997501812`;
  assert.equal(normalizeGoogleSheetsCsvUrl(input), input);
});

test("normalizeGoogleSheetsCsvUrl — published (/pub) and gviz URLs are left alone", () => {
  const pub = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/pub?output=csv`;
  assert.equal(normalizeGoogleSheetsCsvUrl(pub), pub);
  const gviz = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv`;
  assert.equal(normalizeGoogleSheetsCsvUrl(gviz), gviz);
});

test("normalizeGoogleSheetsCsvUrl — non-Google URLs pass through unchanged", () => {
  const ics = "https://example.com/agenda.csv";
  assert.equal(normalizeGoogleSheetsCsvUrl(ics), ics);
  const other = "https://drive.google.com/file/d/abc/view";
  assert.equal(normalizeGoogleSheetsCsvUrl(other), other);
});

test("normalizeGoogleSheetsCsvUrl — malformed input is returned as-is", () => {
  assert.equal(normalizeGoogleSheetsCsvUrl("not-a-url"), "not-a-url");
  assert.equal(normalizeGoogleSheetsCsvUrl(""), "");
});
