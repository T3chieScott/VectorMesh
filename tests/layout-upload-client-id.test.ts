// Task #243: regression coverage for the layout-editor media-zone
// upload client-id resolution. The original bug was that uploads from
// inside ZoneEditorDialog derived the clientId ONLY from layout.eventId,
// so a standalone/template layout produced an empty id and the server
// rejected the upload with `400 clientId is required`.
//
// These tests pin the resolution order of the pure helper that backs
// the dialog so the regression cannot silently come back.

import test from "node:test";
import assert from "node:assert/strict";
import { resolveLayoutUploadClientId } from "../client/src/lib/layoutUploadClientId";

const clientsTwo = [{ id: "client-A" }, { id: "client-B" }];

test("event-linked layout resolves to the linked event's client", () => {
  const result = resolveLayoutUploadClientId({
    layout: { clientId: null, eventId: "evt-1" },
    events: [
      { id: "evt-1", clientId: "client-A" },
      { id: "evt-2", clientId: "client-B" },
    ],
    selectedClientId: null,
    clients: clientsTwo,
  });
  assert.equal(result, "client-A");
});

test("standalone layout under a selected site resolves to that site", () => {
  const result = resolveLayoutUploadClientId({
    layout: { clientId: null, eventId: null },
    events: [],
    selectedClientId: "client-B",
    clients: clientsTwo,
  });
  assert.equal(result, "client-B");
});

test("no resolvable site returns null (Upload disabled)", () => {
  const result = resolveLayoutUploadClientId({
    layout: { clientId: null, eventId: null },
    events: [],
    selectedClientId: null,
    clients: clientsTwo, // more than one client, none selected → ambiguous
  });
  assert.equal(result, null);
});

test("layout's own clientId takes precedence over everything else", () => {
  const result = resolveLayoutUploadClientId({
    layout: { clientId: "client-OWN", eventId: "evt-1" },
    events: [{ id: "evt-1", clientId: "client-A" }],
    selectedClientId: "client-B",
    clients: clientsTwo,
  });
  assert.equal(result, "client-OWN");
});

test("falls back to the only client when exactly one exists", () => {
  const result = resolveLayoutUploadClientId({
    layout: { clientId: null, eventId: null },
    events: [],
    selectedClientId: null,
    clients: [{ id: "client-ONLY" }],
  });
  assert.equal(result, "client-ONLY");
});

test("event lookup that misses falls through to selected site", () => {
  const result = resolveLayoutUploadClientId({
    layout: { clientId: null, eventId: "evt-missing" },
    events: [{ id: "evt-1", clientId: "client-A" }],
    selectedClientId: "client-B",
    clients: clientsTwo,
  });
  assert.equal(result, "client-B");
});
