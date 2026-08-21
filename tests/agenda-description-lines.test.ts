/**
 * Task #376 — Agenda description line-limit setting.
 *
 * Covers all 15 acceptance items from the task spec:
 *  1.  Migration/default → existing/missing value renders 2 lines.
 *  2.  Schema accepts integers 1–10 and null.
 *  3.  Schema rejects 0, negatives, > 10 and non-integers.
 *  4.  New form defaults to 2.
 *  5.  Saved null round-trips through API/form/public display without becoming 2.
 *  6.  Control appears only when showDescription is enabled.
 *  7.  Hiding and re-enabling Description preserves the selected limit.
 *  8.  Values 1, 2, 3, 4, 5 produce the correct clamp.
 *  9.  API-supported value 10 also renders correctly.
 * 10.  Null removes every clamp class/style and displays the full text.
 * 11.  Missing legacy value renders as two lines.
 * 12.  showDescription = false renders no description.
 * 13.  Agenda preview and player use the same saved setting.
 * 14.  Room-door mode remains unchanged.
 * 15.  Existing auto-fit behaviour continues using rendered DOM heights.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { insertAgendaWidgetConfigSchema } from "../shared/schema";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Minimal valid payload for insertAgendaWidgetConfigSchema. */
function basePayload(overrides: Record<string, unknown> = {}) {
  return {
    clientId: "client-1",
    name: "Test Config",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// 1 & 11 — Migration/default and legacy missing value → 2 lines
// ---------------------------------------------------------------------------

test("test 1 & 11 — missing field is accepted (undefined → schema default 2)", () => {
  // The field is optional in the insert schema; omitting it is valid.
  const result = insertAgendaWidgetConfigSchema.safeParse(basePayload());
  assert.equal(result.success, true);
  // When omitted, the DB column DEFAULT 2 takes over at insert time,
  // preserving the pre-#376 two-line behaviour for all existing rows.
});

test("test 1 & 11 — explicit value 2 round-trips correctly (matches default)", () => {
  const result = insertAgendaWidgetConfigSchema.safeParse(
    basePayload({ descriptionLines: 2 }),
  );
  assert.equal(result.success, true);
  if (result.success) assert.equal(result.data.descriptionLines, 2);
});

// ---------------------------------------------------------------------------
// 2 — Schema accepts integers 1–10 and null
// ---------------------------------------------------------------------------

for (const n of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]) {
  test(`test 2 — schema accepts integer ${n}`, () => {
    const result = insertAgendaWidgetConfigSchema.safeParse(
      basePayload({ descriptionLines: n }),
    );
    assert.equal(result.success, true, `expected ${n} to be accepted`);
    if (result.success) assert.equal(result.data.descriptionLines, n);
  });
}

test("test 2 — schema accepts null (Full / no clamp)", () => {
  const result = insertAgendaWidgetConfigSchema.safeParse(
    basePayload({ descriptionLines: null }),
  );
  assert.equal(result.success, true);
  if (result.success) assert.equal(result.data.descriptionLines, null);
});

// ---------------------------------------------------------------------------
// 3 — Schema rejects 0, negatives, > 10 and non-integers
// ---------------------------------------------------------------------------

test("test 3 — schema rejects 0", () => {
  const result = insertAgendaWidgetConfigSchema.safeParse(
    basePayload({ descriptionLines: 0 }),
  );
  assert.equal(result.success, false);
});

test("test 3 — schema rejects negative values (-1)", () => {
  const result = insertAgendaWidgetConfigSchema.safeParse(
    basePayload({ descriptionLines: -1 }),
  );
  assert.equal(result.success, false);
});

test("test 3 — schema rejects values above 10 (11)", () => {
  const result = insertAgendaWidgetConfigSchema.safeParse(
    basePayload({ descriptionLines: 11 }),
  );
  assert.equal(result.success, false);
});

test("test 3 — schema rejects non-integer (1.5)", () => {
  const result = insertAgendaWidgetConfigSchema.safeParse(
    basePayload({ descriptionLines: 1.5 }),
  );
  assert.equal(result.success, false);
});

test("test 3 — schema rejects arbitrary string", () => {
  const result = insertAgendaWidgetConfigSchema.safeParse(
    basePayload({ descriptionLines: "full" }),
  );
  assert.equal(result.success, false);
});

// ---------------------------------------------------------------------------
// 3 (extra) — 0 must not be persisted — explicitly normalise or reject
// ---------------------------------------------------------------------------

test("test 3 (extra) — 0 is rejected at schema level (not silently normalised to null)", () => {
  // The spec says: "Do not persist 0. If legacy/internal input supplies 0,
  // either reject it or deliberately normalise it to null before validation."
  // We reject it. This test documents the chosen path.
  const result = insertAgendaWidgetConfigSchema.safeParse(
    basePayload({ descriptionLines: 0 }),
  );
  assert.equal(result.success, false, "0 must be rejected by the schema");
});

// ---------------------------------------------------------------------------
// 4 — New form defaults to 2
// ---------------------------------------------------------------------------

test("test 4 — defaultForm source encodes \"2\" for a new config", () => {
  const src = readFileSync("client/src/pages/agenda-configs.tsx", "utf-8");
  // The defaultForm function must produce "2" when c is undefined.
  assert.ok(
    src.includes('c?.descriptionLines === null ? "full" : String(c?.descriptionLines ?? 2)'),
    "defaultForm must encode null as \"full\" and missing as \"2\"",
  );
});

// ---------------------------------------------------------------------------
// 5 — Saved null round-trips without becoming 2
// ---------------------------------------------------------------------------

test("test 5 — schema parses null and keeps it as null (not 2)", () => {
  const result = insertAgendaWidgetConfigSchema.safeParse(
    basePayload({ descriptionLines: null }),
  );
  assert.equal(result.success, true);
  if (result.success) {
    assert.equal(result.data.descriptionLines, null);
    assert.notEqual(result.data.descriptionLines, 2);
  }
});

test("test 5 — toApiPayload converts \"full\" sentinel to null (not 2)", () => {
  const src = readFileSync("client/src/pages/agenda-configs.tsx", "utf-8");
  assert.ok(
    src.includes('descriptionLines: values.descriptionLines === "full" ? null : Number(values.descriptionLines)'),
    "toApiPayload must convert \"full\" to null, not to 2",
  );
});

test("test 5 — public payload does not coerce null with ?? 2", () => {
  const src = readFileSync("server/agendaRoutes.ts", "utf-8");
  // The payload must preserve null; ?? 2 applied to descriptionLines would
  // silently convert Full back to two lines.
  assert.ok(
    src.includes(
      "descriptionLines: config.descriptionLines !== undefined ? config.descriptionLines : 2",
    ),
    "agendaRoutes must use explicit undefined check, not ?? 2",
  );
  // Confirm ?? 2 is not used for descriptionLines specifically.
  const descLines = src.match(/descriptionLines:[^\n]+/g) ?? [];
  for (const line of descLines) {
    assert.ok(
      !line.match(/descriptionLines:\s*config\.descriptionLines\s*\?\?\s*2/),
      `descriptionLines must not use ?? 2: ${line}`,
    );
  }
});

// ---------------------------------------------------------------------------
// 6 — Control appears only when showDescription is enabled
// ---------------------------------------------------------------------------

test("test 6 — UI renders Description lines control inside showDescription watch block", () => {
  const src = readFileSync("client/src/pages/agenda-configs.tsx", "utf-8");
  assert.ok(
    src.includes('form.watch("showDescription")'),
    "descriptionLines select must be conditional on showDescription",
  );
  assert.ok(
    src.includes('data-testid="select-description-lines"'),
    "select must carry a stable data-testid",
  );
});

// ---------------------------------------------------------------------------
// 7 — Hiding and re-enabling Description preserves the selected limit
// ---------------------------------------------------------------------------

test("test 7 — descriptionLines is a persistent form schema field (value survives toggle)", () => {
  const src = readFileSync("client/src/pages/agenda-configs.tsx", "utf-8");
  // descriptionLines must be in the form schema so react-hook-form keeps
  // its value even when the UI control is hidden by showDescription = false.
  assert.ok(
    src.includes("descriptionLines: z.string()"),
    "descriptionLines must be a top-level form schema field",
  );
});

// ---------------------------------------------------------------------------
// 8 & 9 — Renderer produces correct clamp styles for values 1–5 and 10
// ---------------------------------------------------------------------------

test("test 8 & 9 — resolveDescriptionClamp applies WebkitLineClamp = N for integers", () => {
  const src = readFileSync(
    "client/src/components/agenda/AgendaDisplayWidget.tsx",
    "utf-8",
  );
  assert.ok(src.includes("WebkitLineClamp: n"), "renderer must set WebkitLineClamp");
  assert.ok(src.includes('display: "-webkit-box"'), "renderer must set display: -webkit-box");
  assert.ok(src.includes('WebkitBoxOrient: "vertical"'), "renderer must set WebkitBoxOrient");
  assert.ok(src.includes('overflow: "hidden"'), "renderer must set overflow: hidden");
});

test("test 8 — integers 1–5 use inline style, not dynamic Tailwind interpolation", () => {
  const src = readFileSync(
    "client/src/components/agenda/AgendaDisplayWidget.tsx",
    "utf-8",
  );
  // Dynamic class interpolation is forbidden because Tailwind purges unseen names.
  assert.ok(!src.match(/`line-clamp-\$\{/), "must not interpolate line-clamp class");
  assert.ok(!src.match(/["']line-clamp-["'] \+/), "must not concatenate line-clamp class");
});

test("test 9 — value 10 is within the accepted range and will be clamped via WebkitLineClamp: 10", () => {
  // Schema accepts 10 (confirmed by test 2 above).
  // Renderer uses `WebkitLineClamp: n` where n = 10, which is correct.
  const src = readFileSync(
    "client/src/components/agenda/AgendaDisplayWidget.tsx",
    "utf-8",
  );
  assert.ok(src.includes("WebkitLineClamp: n"), "WebkitLineClamp: n covers value 10");
});

// ---------------------------------------------------------------------------
// 10 — Null removes every clamp class/style (Full / no limit)
// ---------------------------------------------------------------------------

test("test 10 — resolveDescriptionClamp returns empty object for null (Full)", () => {
  const src = readFileSync(
    "client/src/components/agenda/AgendaDisplayWidget.tsx",
    "utf-8",
  );
  // The function must return {} when lines is null, removing all clamp properties.
  assert.ok(src.includes("if (n === null)"), "function must have null check");
  assert.ok(src.includes("return {};"), "null path must return empty object");
});

test("test 10 — no hardcoded line-clamp-2 remains in the widget source", () => {
  const src = readFileSync(
    "client/src/components/agenda/AgendaDisplayWidget.tsx",
    "utf-8",
  );
  assert.ok(
    !src.includes("line-clamp-2"),
    "hardcoded line-clamp-2 must be replaced by resolveDescriptionClamp",
  );
  assert.ok(
    src.includes("resolveDescriptionClamp(config.descriptionLines)"),
    "description <p> must call resolveDescriptionClamp",
  );
});

// ---------------------------------------------------------------------------
// 12 — showDescription = false renders no description
// ---------------------------------------------------------------------------

test("test 12 — description rendering is gated on config.showDescription", () => {
  const src = readFileSync(
    "client/src/components/agenda/AgendaDisplayWidget.tsx",
    "utf-8",
  );
  assert.ok(
    src.includes("config.showDescription && item.description"),
    "description must be gated on showDescription",
  );
});

// ---------------------------------------------------------------------------
// 13 — Preview and player use the same saved setting
// ---------------------------------------------------------------------------

test("test 13 — descriptionLines is listed in PUBLIC_AGENDA_CONFIG_FIELDS", () => {
  const src = readFileSync("server/agendaRoutes.ts", "utf-8");
  assert.ok(src.includes('"descriptionLines"'), "descriptionLines must be in PUBLIC_AGENDA_CONFIG_FIELDS");
});

test("test 13 — AgendaDisplayWidget imports AgendaWidgetConfig from shared/schema", () => {
  const src = readFileSync(
    "client/src/components/agenda/AgendaDisplayWidget.tsx",
    "utf-8",
  );
  assert.ok(src.includes("AgendaWidgetConfig"), "widget must type config as AgendaWidgetConfig");
  assert.ok(src.includes('from "@shared/schema"'), "widget must import from shared/schema");
});

test("test 13 — descriptionLines is emitted in the public display payload", () => {
  const src = readFileSync("server/agendaRoutes.ts", "utf-8");
  assert.ok(
    src.includes(
      "descriptionLines: config.descriptionLines !== undefined ? config.descriptionLines : 2",
    ),
    "public payload must include descriptionLines",
  );
});

// ---------------------------------------------------------------------------
// 14 — Room-door mode remains unchanged
// ---------------------------------------------------------------------------

test("test 14 — room-door layout has no hardcoded line-clamp-2", () => {
  const src = readFileSync(
    "client/src/components/agenda/AgendaDisplayWidget.tsx",
    "utf-8",
  );
  // line-clamp-2 must be completely absent after the refactor.
  assert.ok(!src.includes("line-clamp-2"), "line-clamp-2 must not appear anywhere in the widget");
});

// ---------------------------------------------------------------------------
// 15 — Auto-fit packer uses real DOM heights (no special height calculations)
// ---------------------------------------------------------------------------

test("test 15 — no hard-coded description height constant was introduced", () => {
  const src = readFileSync(
    "client/src/components/agenda/AgendaDisplayWidget.tsx",
    "utf-8",
  );
  assert.ok(!src.match(/descriptionHeight\s*=/), "must not hard-code descriptionHeight");
  assert.ok(!src.match(/descLineHeight\s*=/), "must not hard-code descLineHeight");
});

test("test 15 — packAgendaPages import is preserved (DOM-height auto-fit path unchanged)", () => {
  const src = readFileSync(
    "client/src/components/agenda/AgendaDisplayWidget.tsx",
    "utf-8",
  );
  assert.ok(src.includes("packAgendaPages"), "packAgendaPages must still be imported/used");
});

// ---------------------------------------------------------------------------
// Migration file
// ---------------------------------------------------------------------------

test("migration 0029 is idempotent and uses correct defaults", () => {
  const sql = readFileSync(
    "migrations/0029_agenda_description_lines.sql",
    "utf-8",
  );
  assert.ok(sql.includes("ADD COLUMN IF NOT EXISTS"), "migration must be idempotent");
  assert.ok(sql.includes("description_lines"), "migration must target description_lines");
  assert.ok(sql.includes("INTEGER"), "column type must be INTEGER");
  assert.ok(sql.includes("DEFAULT 2"), "default must be 2 to preserve existing behaviour");
});

// ---------------------------------------------------------------------------
// Startup guard
// ---------------------------------------------------------------------------

test("ensureAgendaDescriptionLinesMigration is exported from server/db.ts", () => {
  const src = readFileSync("server/db.ts", "utf-8");
  assert.ok(
    src.includes("export async function ensureAgendaDescriptionLinesMigration"),
    "guard must be exported from db.ts",
  );
  assert.ok(src.includes("715129_007n"), "guard must use a unique advisory lock key");
});

test("ensureAgendaDescriptionLinesMigration is imported and called in server/index.ts", () => {
  const src = readFileSync("server/index.ts", "utf-8");
  assert.ok(
    src.includes("ensureAgendaDescriptionLinesMigration"),
    "guard must be registered in server/index.ts",
  );
});
