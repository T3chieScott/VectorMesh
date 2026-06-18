---
name: Stale client cache → phantom records + "write failed" reports
description: Diagnostic pattern when a user reports add/delete failing on a record that doesn't exist server-side
---

# Stale client cache makes deleted records linger and writes "fail"

Pattern: a user reports "I can no longer add or delete X — both throw errors," while
pointing at a record that does NOT exist in the database.

Cause: the React Query client caches list reads aggressively and does not auto-refresh
them. A tab left open a long time drifts out of sync with the server:
- The list still shows a record that was already deleted elsewhere.
- Deleting that phantom record returns 404 → generic "Failed to delete" toast.
- Adding can fail too if the dialog references other stale (now-deleted) entities.
The auth check only reacts to a 401, which never re-triggers once the SPA is open, so the
page keeps rendering stale data instead of redirecting or refetching.

**Why this matters for diagnosis:** the backend, auth, and DB can all be perfectly healthy
and still produce this report. Don't assume a server bug from the symptom alone.

**How to diagnose / apply:**
- First check whether the named record actually exists in the DB. If it does NOT, it's a
  stale-cache view, not a server failure.
- Sanity-check the server independently (fresh login + the actual write path) and confirm
  the session is valid before touching backend code.
- Immediate user fix: hard refresh (Shift+reload / Ctrl/Cmd+Shift+R) — reloads real data.
- Durable fix (needs sign-off — it trades off against the deliberate caching): refetch the
  affected list on focus/mount, and/or treat a 404 on delete as already-gone + invalidate
  the list.
