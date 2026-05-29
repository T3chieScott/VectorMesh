// Task #243: pure helper that resolves which clientId a media upload
// launched from inside the layout editor's media-zone dialog should be
// attached to. Lifted out of client/src/pages/layouts.tsx so
// tests/layout-upload-client-id.test.ts can pin the resolution order
// without rendering the (very large) ZoneEditorDialog component.
//
// The bug this fixes: ZoneEditorDialog previously derived the client id
// ONLY from layout.eventId. A layout that isn't linked to an event (a
// standalone/template layout) produced an empty client id, so the
// upload posted to POST /api/uploads with no clientId and the server
// rejected it with `400 clientId is required`. The Media Library page
// never hit this because it falls back to the selected site and then to
// the only-available client.
//
// Resolution order (first match wins):
//   1. the layout's own clientId (layouts carry a direct clientId)
//   2. the clientId of the event the layout is linked to
//   3. the globally selected site (same as the Media Library)
//   4. the only client, when exactly one exists
//   5. null — no site context; the caller must disable Upload
//
// Keep this file dependency-free of React so it can be imported
// directly from node:test without a DOM/JSX environment.

export interface LayoutUploadClientIdInput {
  layout: { clientId?: string | null; eventId?: string | null };
  events?: Array<{ id: string; clientId?: string | null }> | null;
  selectedClientId?: string | null;
  clients?: Array<{ id: string }> | null;
}

export function resolveLayoutUploadClientId({
  layout,
  events,
  selectedClientId,
  clients,
}: LayoutUploadClientIdInput): string | null {
  if (layout.clientId) return layout.clientId;

  if (layout.eventId) {
    const event = events?.find((e) => e.id === layout.eventId);
    if (event?.clientId) return event.clientId;
  }

  if (selectedClientId) return selectedClientId;

  if (clients && clients.length === 1) return clients[0].id;

  return null;
}
