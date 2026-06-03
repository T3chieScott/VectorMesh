---
name: OneDrive/Graph file listing quirk
description: Why the agenda Microsoft file picker lists drive root children, not just /me/drive/recent
---

# OneDrive `/me/drive/recent` is unreliable for a file picker

`/me/drive/recent` (Microsoft Graph) returns a near-empty list on many
**business** OneDrive accounts even when the drive root is full of files.
A picker built on `recent` alone shows "No files found" and forces users
onto fragile share links.

**Rule:** list `/me/drive/root/children` as the primary source for the
default picker view; merge `/me/drive/recent` only to round it out
(dedupe by item id). Search uses `/me/drive/root/search(q=...)`.

**Why:** observed live — a connected business account had 16 root items
incl. several `.xlsx`, but `recent` returned 1 non-xlsx item, so the
picker was empty. Root children returned the real files.

**How to apply:** in `server/microsoftGraph.ts → listRecentXlsxFiles`.
Only throw when BOTH the root-children and recent calls fail and nothing
was collected; if either succeeds (even empty) an empty list is valid.

## Share-link 403 is an account-access fact, not a bug
A Graph `/shares/{id}/driveItem` 403 ("sharing link no longer exists, or
you do not have permission") means the *connected* account can't reach
that link (shared with someone else, a site it isn't a member of, or
expired). No code change grants access — steer operators to the picker.
The SDK proxy path must include the `/v1.0` version segment
(`connectors.proxy("onedrive", "/v1.0/me")`); omitting it returns Graph
"Invalid version". The server's own code uses `GRAPH_BASE` which already
includes `/v1.0`.
