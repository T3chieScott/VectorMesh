// Task #401 — agenda scenes need cycle-aware feedback without changing
// the existing media or ordinary-scene copy.
import "./setup-jsdom";

import test from "node:test";
import assert from "node:assert/strict";
import * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import {
  ItemEditorDialog,
  SortablePlaylistItem,
  layoutHasAgendaZone,
} from "../client/src/pages/playlists";
import type { LayoutTemplate, PlaylistItem } from "../shared/schema";

function layout(id: string, zones: unknown[]): LayoutTemplate {
  return {
    id,
    name: id,
    aspectRatio: "16:9",
    zones,
  } as LayoutTemplate;
}

test("detects agenda zones from the selected layout only", () => {
  assert.equal(layoutHasAgendaZone(layout("agenda", [{ type: "agenda" }])), true);
  assert.equal(layoutHasAgendaZone(layout("mixed", [{ type: "media" }, { type: "agenda" }])), true);
  assert.equal(layoutHasAgendaZone(layout("ordinary", [{ type: "media" }])), false);
  assert.equal(layoutHasAgendaZone(layout("empty", [])), false);
  assert.equal(layoutHasAgendaZone(undefined), false);
  assert.equal(layoutHasAgendaZone({ zones: null } as unknown as LayoutTemplate), false);
});

async function render(element: React.ReactElement): Promise<{ root: Root; container: HTMLDivElement }> {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  await act(async () => root.render(
    <QueryClientProvider client={queryClient}>{element}</QueryClientProvider>,
  ));
  return { root, container };
}

function sceneItem(id: string, layoutTemplateId: string): PlaylistItem {
  return {
    id,
    playlistId: "playlist-1",
    layoutTemplateId,
    mediaAssetId: null,
    duration: 30,
    order: 0,
  } as PlaylistItem;
}

test("shows cycle-aware minimum-duration feedback for agenda scene rows and dialogs", async () => {
  const agendaLayout = layout("agenda", [{ type: "agenda" }]);
  const item = sceneItem("agenda-item", agendaLayout.id);
  const dialog = await render(
    <ItemEditorDialog
      playlistId="playlist-1"
      item={item}
      mediaAssets={[]}
      layouts={[agendaLayout]}
      open
      onOpenChange={() => {}}
      onSubmit={() => {}}
    />,
  );
  assert.match(document.body.textContent ?? "", /Duration \(seconds\) — minimum display time/);
  assert.match(document.body.textContent ?? "", /Agenda-aware · waits for one complete cycle/);
  await act(async () => dialog.root.unmount());
  dialog.container.remove();

  const row = await render(
    <SortablePlaylistItem
      item={item}
      layoutTemplate={agendaLayout}
      onEdit={() => {}}
      onDelete={() => {}}
    />,
  );
  assert.match(row.container.textContent ?? "", /Agenda-aware · waits for one complete cycle/);
  await act(async () => row.root.unmount());
  row.container.remove();
});

test("keeps ordinary scene duration feedback unchanged", async () => {
  const ordinaryLayout = layout("ordinary", [{ type: "media" }]);
  const mounted = await render(
    <ItemEditorDialog
      playlistId="playlist-1"
      item={sceneItem("ordinary-item", ordinaryLayout.id)}
      mediaAssets={[]}
      layouts={[ordinaryLayout]}
      open
      onOpenChange={() => {}}
      onSubmit={() => {}}
    />,
  );
  const text = document.body.textContent ?? "";
  assert.match(text, /Duration \(seconds\) — how long to show this scene/);
  assert.match(text, /How many seconds to display this scene before rotating to the next item/);
  assert.doesNotMatch(text, /Agenda-aware/);
  await act(async () => mounted.root.unmount());
  mounted.container.remove();
});