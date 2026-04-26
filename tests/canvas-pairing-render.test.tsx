// Task #175 regression: render-level lock for the owner-only pairing
// controls on canvas walls. Whereas tests/canvas-pairing-ui-gating.test.ts
// pins only the gating predicates, this suite renders the *actual JSX*
// that ScreenCard mounts (CanvasPairingPanel, CanvasPairingInheritsMessage,
// CanvasPairingMenuItems from client/src/pages/canvas-pairing-elements.tsx)
// to a static HTML string via react-dom/server and asserts the resulting
// DOM-level test IDs and copy. This is the "or equivalent" coverage path
// for Playwright — package.json is locked, but react-dom is already a
// runtime dep, so we can drive React → HTML in node:test without any
// extra installs and without a real browser.
//
// What this catches that the predicate test cannot:
//   * a refactor that removes the `data-testid="..."` from the panel
//   * a refactor that swaps the inherits-message copy
//   * a refactor that wires the wrong gating boolean to a JSX branch
//   * a refactor that re-exposes Regenerate / Unpair menu items on
//     siblings even though the predicate stays right
//
// Cleanup follows the same PREFIX pattern as the sibling DB-backed
// tests so dev data is left untouched.

import test from "node:test";
import assert from "node:assert/strict";
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import * as React from "react";
import { like } from "drizzle-orm";
import { renderToStaticMarkup } from "react-dom/server";
import { db } from "../server/db";
import { clients, screens, type Screen } from "../shared/schema";
import {
  getCanvasPairingGating,
  groupScreensByCanvas,
  siblingsOnCanvas,
} from "../shared/canvas-groups";
import {
  CanvasPairingPanel,
  CanvasPairingInheritsMessage,
  CanvasPairingMenuItems,
} from "../client/src/pages/canvas-pairing-elements";

const PREFIX = "__TEST_CVRENDER__";

async function cleanup() {
  await db.delete(screens).where(like(screens.name, `${PREFIX}%`));
  await db.delete(clients).where(like(clients.name, `${PREFIX}%`));
}

async function makeClient(label: string): Promise<string> {
  const [c] = await db
    .insert(clients)
    .values({ name: `${PREFIX}${label}` })
    .returning();
  return c.id;
}

interface MakeScreenOpts {
  name: string;
  clientId: string;
  createdAt: Date;
  canvasX?: number;
  isPaired?: boolean;
  pairingCode?: string | null;
  isOnline?: boolean;
  deviceToken?: string | null;
}

async function makeCanvasScreen(opts: MakeScreenOpts): Promise<Screen> {
  const values: typeof screens.$inferInsert = {
    name: `${PREFIX}${opts.name}`,
    clientId: opts.clientId,
    canvasEnabled: true,
    canvasWidth: 3840,
    canvasHeight: 1080,
    canvasX: opts.canvasX ?? 0,
    canvasY: 0,
    isPaired: opts.isPaired ?? false,
    isOnline: opts.isOnline ?? false,
    pairingCode: opts.pairingCode ?? null,
    deviceToken: opts.deviceToken ?? null,
    createdAt: opts.createdAt,
  };
  const [row] = await db.insert(screens).values(values).returning();
  return row;
}

// Render the same three JSX surfaces ScreenCard mounts for a given
// screen + its real siblings. Returns a single HTML blob covering the
// pairing-code panel, the inherits message, and the menu items. The
// menu items use a stub `<button>`-based ItemComponent so we don't need
// Radix DropdownMenu context to render them to HTML — the conditional
// JSX wiring around the predicates is what we're locking.
async function renderForScreen(target: Screen): Promise<string> {
  const all = await db.select().from(screens);
  const groups = groupScreensByCanvas(all);
  const siblings = siblingsOnCanvas(target, groups);
  const gating = getCanvasPairingGating(target, siblings);

  // The same shadcn/Radix DropdownMenuItem accepts onSelect and a
  // children prop, so this stub matches its public surface.
  function StubItem({
    children,
    onSelect,
    "data-testid": testId,
  }: {
    children?: React.ReactNode;
    onSelect?: () => void;
    "data-testid"?: string;
  }) {
    return (
      <button type="button" data-testid={testId} onClick={() => onSelect?.()}>
        {children}
      </button>
    );
  }

  return renderToStaticMarkup(
    <div>
      <CanvasPairingPanel
        screen={target}
        gating={gating}
        siblingCount={siblings.length}
        onCopy={() => undefined}
      />
      <CanvasPairingInheritsMessage screen={target} gating={gating} />
      <ul>
        <CanvasPairingMenuItems
          screen={target}
          gating={gating}
          onRegenerate={() => undefined}
          onUnpair={() => undefined}
          ItemComponent={StubItem}
        />
      </ul>
    </div>,
  );
}

test.before(cleanup);
test.after(cleanup);

// ─── Two-tile canvas: UNPAIRED state ───────────────────────────────
// Task #179 update: while the owner is unpaired, the sibling DOM
// must NOT contain the inherits-message node. Operators reported
// the lingering "Inherits pairing from <owner>" copy after they
// unpaired the lead screen as misleading — there is nothing to
// inherit. Sibling falls back to its no-owner empty UI.
test("DOM render — 2-tile canvas, unpaired: owner card markup shows pairing code + Regenerate Code; sibling card markup hides the inherits message (Task #179)", async () => {
  const clientId = await makeClient("ren-unpaired");
  const t0 = new Date("2026-08-01T00:00:00Z");
  const ownerRow = await makeCanvasScreen({
    name: "renOwner",
    clientId,
    createdAt: t0,
    canvasX: 0,
    isPaired: false,
    pairingCode: "WALL01",
  });
  const siblingRow = await makeCanvasScreen({
    name: "renSibling",
    clientId,
    createdAt: new Date(t0.getTime() + 1000),
    canvasX: 1920,
    isPaired: false,
    pairingCode: "WALL01",
  });

  const ownerHtml = await renderForScreen(ownerRow);
  assert.match(
    ownerHtml,
    new RegExp(`data-testid="text-pairing-code-${ownerRow.id}"`),
    "owner card must render the pairing-code panel testid",
  );
  assert.match(ownerHtml, /WALL01/, "owner panel must render the actual code");
  assert.match(
    ownerHtml,
    new RegExp(`data-testid="button-regenerate-pairing-${ownerRow.id}"`),
    "owner card must render the Regenerate Code menu item",
  );
  assert.match(ownerHtml, /Regenerate Code/);
  assert.ok(
    !ownerHtml.includes(`data-testid="button-unpair-${ownerRow.id}"`),
    "owner card must NOT render Unpair Device while wall is unpaired",
  );
  assert.ok(
    !ownerHtml.includes(`data-testid="text-inherits-pairing-${ownerRow.id}"`),
    "owner card must NOT render the inherits message",
  );

  const siblingHtml = await renderForScreen(siblingRow);
  assert.ok(
    !siblingHtml.includes(`data-testid="text-pairing-code-${siblingRow.id}"`),
    "sibling card must NOT render the pairing-code panel even when its row carries a code",
  );
  assert.ok(
    !siblingHtml.includes(`data-testid="text-inherits-pairing-${siblingRow.id}"`),
    "Task #179: sibling card must NOT render the inherits-message node while the owner is unpaired",
  );
  assert.ok(
    !/Inherits pairing from/.test(siblingHtml),
    "Task #179: sibling card copy must NOT read 'Inherits pairing from' while the owner is unpaired",
  );
  assert.ok(
    !siblingHtml.includes(`data-testid="button-regenerate-pairing-${siblingRow.id}"`),
    "sibling dropdown must NOT contain Regenerate Code",
  );
  assert.ok(
    !siblingHtml.includes(`data-testid="button-unpair-${siblingRow.id}"`),
    "sibling dropdown must NOT contain Unpair Device",
  );
});

// ─── Two-tile canvas: PAIRED state ─────────────────────────────────
test("DOM render — 2-tile canvas, paired: owner card markup shows Unpair Device; sibling card markup shows Inherits message and no controls", async () => {
  const clientId = await makeClient("ren-paired");
  const t0 = new Date("2026-08-02T00:00:00Z");
  const ownerRow = await makeCanvasScreen({
    name: "renOwnerP",
    clientId,
    createdAt: t0,
    canvasX: 0,
    isPaired: true,
    pairingCode: "WALL02",
    deviceToken: "tok-shared",
    isOnline: true,
  });
  const siblingRow = await makeCanvasScreen({
    name: "renSiblingP",
    clientId,
    createdAt: new Date(t0.getTime() + 1000),
    canvasX: 1920,
    isPaired: true,
    pairingCode: "WALL02",
    deviceToken: "tok-shared",
    isOnline: true,
  });

  const ownerHtml = await renderForScreen(ownerRow);
  assert.ok(
    !ownerHtml.includes(`data-testid="text-pairing-code-${ownerRow.id}"`),
    "owner pairing-code panel must hide once the wall is paired",
  );
  assert.ok(
    !ownerHtml.includes(`data-testid="text-inherits-pairing-${ownerRow.id}"`),
    "owner card must never render the inherits message",
  );
  assert.match(
    ownerHtml,
    new RegExp(`data-testid="button-unpair-${ownerRow.id}"`),
    "owner card must render Unpair Device once paired",
  );
  assert.match(ownerHtml, /Unpair Device/);
  assert.ok(
    !ownerHtml.includes(`data-testid="button-regenerate-pairing-${ownerRow.id}"`),
    "owner Regenerate Code must hide once paired",
  );

  const siblingHtml = await renderForScreen(siblingRow);
  assert.ok(
    !siblingHtml.includes(`data-testid="text-pairing-code-${siblingRow.id}"`),
    "sibling card must NOT render the pairing-code panel in paired state",
  );
  assert.match(
    siblingHtml,
    new RegExp(`data-testid="text-inherits-pairing-${siblingRow.id}"`),
    "sibling card must still render the inherits message in paired state",
  );
  assert.match(siblingHtml, /Inherits pairing from/);
  assert.match(siblingHtml, new RegExp(`>${ownerRow.name}<`));
  assert.ok(
    !siblingHtml.includes(`data-testid="button-unpair-${siblingRow.id}"`),
    "sibling dropdown must NOT contain Unpair Device — only the owner can unpair the wall",
  );
  assert.ok(
    !siblingHtml.includes(`data-testid="button-regenerate-pairing-${siblingRow.id}"`),
    "sibling dropdown must NOT contain Regenerate Code in paired state",
  );
});
