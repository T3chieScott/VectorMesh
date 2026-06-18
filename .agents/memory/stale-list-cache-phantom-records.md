---
name: Stale list cache → phantom records + write failures
description: Why long-open tabs show deleted screens/records and why add/delete then "throws errors"
---

# Stale client cache makes deleted records linger and writes "fail"

Symptom seen from users: "I can no longer add or delete a screen — both throw errors,"
while pointing at a record (e.g. a "poster screen") that **does not exist in the DB**.

Root cause: the frontend React Query client uses an aggressive global cache
(`staleTime: Infinity`, no refetch on focus) in `client/src/lib/queryClient.ts`.
Lists like `/api/screens` load once and never auto-refresh. A tab left open for a
while drifts out of sync with the server:
- The list still shows a record that was already deleted (from another tab/device/session).
- Deleting that phantom record hits the server, which returns 404 → toast "Failed to delete".
- Adding can fail for the same reason (dialog references stale site/profile data).

**Why:** the cache config is intentional (performance work / shared-cache task), so the
list does not re-fetch on its own; the auth query only treats a 401 as "logged out",
which never re-triggers once the SPA is open, so the page keeps rendering stale data.

**How to apply / diagnose:**
- Before assuming a backend bug, check whether the named record actually exists in the DB.
  If it does NOT, it's a stale-cache view, not a server failure.
- Verify the server is healthy via fresh login + curl (create→201, delete→204, list→200)
  and check the `sessions` table for a valid (non-expired) session.
- Immediate user fix: hard refresh (Shift+reload / Ctrl/Cmd+Shift+R) — confirmed to resolve.
- Durable fix (needs user sign-off, it's a tradeoff vs the deliberate caching): make the
  screens page refetch on focus/mount, and/or treat a 404 on delete as already-gone +
  invalidate the list.
