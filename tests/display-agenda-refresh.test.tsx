import "./setup-jsdom";
import test, { afterEach, describe } from "node:test";
import assert from "node:assert/strict";
import * as React from "react";
import { act, cleanup, render, waitFor } from "@testing-library/react";
import DisplayAgendaPage, {
  AGENDA_DISPLAY_REFRESH_EVENT,
} from "../client/src/pages/display-agenda";

const originalFetch = globalThis.fetch;
(globalThis as any).dispatchEvent = window.dispatchEvent.bind(window);
(globalThis as any).addEventListener = window.addEventListener.bind(window);
(globalThis as any).removeEventListener = window.removeEventListener.bind(window);

afterEach(() => {
  cleanup();
  globalThis.fetch = originalFetch;
});

function config() {
  return {
    id: "cfg-task404",
    clientId: "client",
    name: "Live agenda",
    displayMode: "full",
    layoutMode: "landscape",
    fontScale: "normal",
    density: "normal",
    theme: "dark",
    accentColor: "#0ea5e9",
    eventName: "Task404 event",
    showEventName: true,
    showCurrentTime: false,
    showDate: false,
    showDescription: true,
    showPresenter: true,
    showRoom: true,
    showStatus: true,
    maxItemsPerPage: 8,
    pageRotationSeconds: 30,
    rotationIntervalSeconds: 30,
    refreshIntervalSeconds: 30,
    roomFilter: [],
    trackFilter: [],
    statusFilter: [],
  };
}

function populated(title = "Last good session") {
  const now = Date.now();
  return {
    config: config(),
    items: [{
      id: "session",
      clientId: "client",
      title,
      description: "Description",
      room: "Hall",
      track: "Main",
      presenter: "Presenter",
      startsAt: new Date(now - 30 * 60_000),
      endsAt: new Date(now + 30 * 60_000),
      status: "scheduled",
      statusMessage: null,
    }],
    effectiveDay: null,
    client: { id: "client", name: "Client", timezone: "UTC" },
    serverTime: now,
  };
}

function response(payload: unknown, ok = true, status = 200) {
  return {
    ok,
    status,
    json: async () => payload,
  } as Response;
}

async function refresh() {
  await act(async () => {
    window.dispatchEvent(new Event(AGENDA_DISPLAY_REFRESH_EVENT));
  });
}

describe("standalone DisplayAgenda refresh policy", () => {
  test("successful populated then successful empty refresh clears the real display root", async () => {
    window.history.replaceState({}, "", "/display/agenda/cfg-task404");
    const queue = [
      response(populated("Visible before empty")),
      response({ ...populated(), items: [] }),
    ];
    globalThis.fetch = async () => queue.shift()!;
    const view = render(<DisplayAgendaPage />);
    await waitFor(() => assert.ok(view.getByText("Visible before empty")));
    assert.ok(view.getByTestId("agenda-display-root"));
    await refresh();
    await waitFor(() => assert.equal(view.queryByTestId("agenda-display-root"), null));
    assert.equal(view.queryByText("Visible before empty"), null);
  });

  test("failed refresh retains the last-good populated display", async () => {
    window.history.replaceState({}, "", "/display/agenda/cfg-task404");
    const queue = [
      response(populated()),
      response(null, false, 503),
    ];
    globalThis.fetch = async () => queue.shift()!;
    const view = render(<DisplayAgendaPage />);
    await waitFor(() => assert.ok(view.getByText("Last good session")));
    await refresh();
    await waitFor(() => assert.equal(queue.length, 0));
    assert.ok(view.getByTestId("agenda-display-root"));
    assert.ok(view.getByText("Last good session"));
    assert.equal(view.queryByTestId("agenda-display-error"), null);
  });

  test("an older populated response resolving after a newer empty response is ignored", async () => {
    window.history.replaceState({}, "", "/display/agenda/cfg-task404");
    let resolveOlder!: (value: Response) => void;
    const older = new Promise<Response>((resolve) => { resolveOlder = resolve; });
    let calls = 0;
    globalThis.fetch = async () => {
      calls += 1;
      if (calls === 1) return older;
      return response({ ...populated(), items: [] });
    };
    const view = render(<DisplayAgendaPage />);
    await waitFor(() => assert.equal(calls, 1));
    await refresh();
    await waitFor(() => {
      assert.equal(calls, 2);
      assert.equal(view.queryByTestId("agenda-display-loading"), null);
      assert.equal(view.queryByTestId("agenda-display-root"), null);
    });
    await act(async () => resolveOlder(response(populated("Stale older session"))));
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(view.queryByText("Stale older session"), null);
    assert.equal(view.queryByTestId("agenda-display-root"), null);
  });
});