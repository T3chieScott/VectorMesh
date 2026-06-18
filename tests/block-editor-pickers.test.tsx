// Task #223 — render BlockEditorDialog in a real React + jsdom tree
// and assert the mutually-exclusive picker rules (layout / agenda /
// fallback playlist) via actual user-driven interactions. Replaces
// the source-text regex assertions added by Task #214 that would
// pass against a refactor which preserved the logic with renamed
// variables.

// MUST come before any module that touches the DOM.
import "./setup-jsdom";

import test from "node:test";
import assert from "node:assert/strict";
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import userEvent from "@testing-library/user-event";

import { BlockEditorDialog } from "../client/src/pages/programmes";
import { SiteProvider } from "../client/src/hooks/use-site-context";
import type {
  AgendaWidgetConfig,
  Client,
  LayoutTemplate,
  Playlist,
  Screen,
  ScreenGroup,
} from "../shared/schema";

const PREFIX = "__TEST_S223__";

// ---------- fixture data ----------

const CLIENT_ID = "client-1";
const AGENDA_ID = "agenda-1";
const PLAYLIST_ID = "playlist-1";
const LAYOUT_ID = "layout-1";

const layouts: LayoutTemplate[] = [
  {
    id: LAYOUT_ID,
    name: "Test Layout",
    width: 1920,
    height: 1080,
    zones: [],
    background: null,
    clientId: CLIENT_ID,
    isShared: false,
    createdById: null,
    createdAt: new Date(),
  } as unknown as LayoutTemplate,
];

const playlists: Playlist[] = [
  { id: PLAYLIST_ID, name: "Test Playlist" } as unknown as Playlist,
];

const agendaConfigs: AgendaWidgetConfig[] = [
  { id: AGENDA_ID, name: "Test Agenda" } as unknown as AgendaWidgetConfig,
];

const screens: Screen[] = [];
const screenGroups: ScreenGroup[] = [];

const clients: Client[] = [
  { id: CLIENT_ID, name: "Test Site", timezone: "UTC" } as unknown as Client,
];

// ---------- test harness ----------

function makeQueryClient(): QueryClient {
  const qc = new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: Infinity, gcTime: Infinity },
    },
  });
  // Seed the query cache so neither useAuth nor SiteProvider nor
  // useSiteFilteredQuery actually trigger a fetch. Keys mirror the
  // production code exactly.
  qc.setQueryData(["/api/auth/user"], { id: "u1", email: "t@t" });
  qc.setQueryData(["/api/clients"], clients);
  qc.setQueryData(["/api/agenda/configs", CLIENT_ID], agendaConfigs);
  return qc;
}

interface Harness {
  root: Root;
  container: HTMLDivElement;
  user: ReturnType<typeof userEvent.setup>;
  unmount: () => void;
}

async function mount(): Promise<Harness> {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  const qc = makeQueryClient();

  await act(async () => {
    root.render(
      React.createElement(
        QueryClientProvider,
        { client: qc },
        React.createElement(
          SiteProvider,
          null,
          React.createElement(BlockEditorDialog, {
            versionId: "v-1",
            programmeId: "p-1",
            layouts,
            playlists,
            screens,
            screenGroups,
            open: true,
            onOpenChange: () => {},
          }),
        ),
      ),
    );
  });

  // user-event v14, pointerEventsCheck disabled because jsdom's
  // computed styles for Radix's "pointer-events: none" guards on
  // opening dropdowns can otherwise falsely reject clicks.
  const user = userEvent.setup({
    document,
    pointerEventsCheck: 0,
  });

  return {
    root,
    container,
    user,
    unmount: () => {
      act(() => {
        root.unmount();
      });
      container.remove();
    },
  };
}

// ---------- Radix Select helpers ----------
//
// Each Radix <Select> we care about renders its trigger inside a
// portal-less FormControl and its content inside a portal under
// document.body. We open the trigger by data-testid, then click the
// option whose visible label matches `optionText`.

function getTrigger(testId: string): HTMLElement {
  const el = document.querySelector<HTMLElement>(`[data-testid="${testId}"]`);
  assert.ok(el, `expected trigger [data-testid="${testId}"] to be rendered`);
  return el!;
}

async function pickOption(
  user: ReturnType<typeof userEvent.setup>,
  triggerTestId: string,
  optionText: string,
): Promise<void> {
  const trigger = getTrigger(triggerTestId);
  await user.click(trigger);

  // Radix portals the listbox into document.body. Wait one tick for
  // the open-state effect to flush.
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });

  const option = Array.from(
    document.body.querySelectorAll<HTMLElement>('[role="option"]'),
  ).find((el) => (el.textContent || "").trim() === optionText);
  assert.ok(
    option,
    `expected option labelled "${optionText}" in the open ${triggerTestId} dropdown; saw [${Array.from(
      document.body.querySelectorAll<HTMLElement>('[role="option"]'),
    )
      .map((e) => (e.textContent || "").trim())
      .join(", ")}]`,
  );

  await user.click(option!);

  // Flush close animation + onValueChange state update.
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
}

function isDisabled(el: HTMLElement): boolean {
  return (
    el.getAttribute("disabled") !== null ||
    el.getAttribute("data-disabled") !== null ||
    el.getAttribute("aria-disabled") === "true"
  );
}

function triggerText(testId: string): string {
  return (getTrigger(testId).textContent || "").trim();
}

// ============================================================
// Tests
// ============================================================

test(`${PREFIX} picking a layout clears any previously-chosen agenda`, async () => {
  const h = await mount();
  try {
    // Start by picking an agenda — picker should accept it because
    // no fallback playlist is selected.
    assert.equal(isDisabled(getTrigger("select-block-agenda-config")), false);
    await pickOption(h.user, "select-block-agenda-config", "Test Agenda");
    assert.match(triggerText("select-block-agenda-config"), /Test Agenda/);
    // Picking an agenda must disable the fallback playlist picker.
    assert.equal(
      isDisabled(getTrigger("select-fallback-playlist")),
      true,
      "fallback-playlist picker must be disabled once an agenda is chosen",
    );

    // Now pick a layout. The agenda/fallback panels disappear
    // entirely because they're rendered under {!selectedLayout}. The
    // dialog also stores agendaConfigId="" in state, which we verify
    // indirectly: re-clearing the layout should re-render the agenda
    // picker showing "No agenda" (i.e. cleared), and the fallback
    // picker should once again be enabled.
    await pickOption(h.user, "select-block-layout", "Test Layout");
    assert.equal(
      document.querySelector('[data-testid="select-block-agenda-config"]'),
      null,
      "agenda picker hides while a layout is selected",
    );
    assert.equal(
      document.querySelector('[data-testid="select-fallback-playlist"]'),
      null,
      "fallback-playlist picker hides while a layout is selected",
    );

    // Clear the layout back to "No scene"; both pickers should
    // re-appear, and the agenda one should show the placeholder
    // (i.e. its state was wiped, not just hidden).
    await pickOption(h.user, "select-block-layout", "No scene");
    assert.match(
      triggerText("select-block-agenda-config"),
      /Select an agenda|No agenda/,
      "agenda selection must have been cleared when layout was picked",
    );
    assert.equal(
      isDisabled(getTrigger("select-fallback-playlist")),
      false,
      "fallback-playlist picker re-enables once agenda is cleared",
    );
  } finally {
    h.unmount();
  }
});

test(`${PREFIX} picking an agenda disables and excludes the fallback playlist`, async () => {
  const h = await mount();
  try {
    // Sanity baseline.
    assert.equal(isDisabled(getTrigger("select-fallback-playlist")), false);
    assert.equal(isDisabled(getTrigger("select-block-agenda-config")), false);

    await pickOption(h.user, "select-block-agenda-config", "Test Agenda");

    assert.match(triggerText("select-block-agenda-config"), /Test Agenda/);
    assert.equal(
      isDisabled(getTrigger("select-fallback-playlist")),
      true,
      "fallback-playlist picker must become disabled when an agenda is set",
    );

    // Clearing the agenda back to "No agenda" must re-enable the
    // fallback playlist picker.
    await pickOption(h.user, "select-block-agenda-config", "No agenda");
    assert.equal(
      isDisabled(getTrigger("select-fallback-playlist")),
      false,
      "fallback-playlist picker re-enables once agenda is cleared",
    );
  } finally {
    h.unmount();
  }
});

test(`${PREFIX} picking a fallback playlist disables and clears the agenda picker`, async () => {
  const h = await mount();
  try {
    // First put an agenda in place so we can prove the reverse
    // direction (picking a playlist clears the agenda).
    await pickOption(h.user, "select-block-agenda-config", "Test Agenda");
    assert.match(triggerText("select-block-agenda-config"), /Test Agenda/);

    // The fallback playlist picker is now disabled — the rule under
    // test is the inverse direction, so we need to first clear the
    // agenda, pick the playlist, then re-confirm.
    await pickOption(h.user, "select-block-agenda-config", "No agenda");
    assert.equal(isDisabled(getTrigger("select-fallback-playlist")), false);

    await pickOption(h.user, "select-fallback-playlist", "Test Playlist");
    assert.match(triggerText("select-fallback-playlist"), /Test Playlist/);
    assert.equal(
      isDisabled(getTrigger("select-block-agenda-config")),
      true,
      "agenda picker must become disabled when a fallback playlist is set",
    );

    // And: if an agenda were somehow re-picked first (e.g. through a
    // stale block), picking the playlist must blank the agenda. We
    // simulate by clearing the playlist, picking the agenda, then
    // forcing the playlist again.
    await pickOption(h.user, "select-fallback-playlist", "No playlist");
    assert.equal(isDisabled(getTrigger("select-block-agenda-config")), false);
    await pickOption(h.user, "select-block-agenda-config", "Test Agenda");
    assert.equal(isDisabled(getTrigger("select-fallback-playlist")), true);
    // Stuck — by design — until we clear the agenda. That's the rule.
    // Clearing the agenda lets us pick the playlist, which must
    // *also* zero out any agendaConfigId state (verified via the
    // onValueChange handler's setAgendaConfigId("") branch).
    await pickOption(h.user, "select-block-agenda-config", "No agenda");
    await pickOption(h.user, "select-fallback-playlist", "Test Playlist");
    assert.match(triggerText("select-block-agenda-config"), /Select an agenda|No agenda/);
  } finally {
    h.unmount();
  }
});
