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

## Share-link 403 is a connector SCOPE limit, not a bug
The Replit Microsoft connectors are granted **delegated** scopes only:
- onedrive: `Files.Read Files.ReadWrite User.Read`
- sharepoint: same + `Sites.Selected`

`Files.Read`/`Files.ReadWrite` = the user's **own OneDrive files only**.
`Sites.Selected` = only SharePoint sites an admin explicitly granted to
the app (by default none). So a Graph `/shares/{id}/driveItem` (or any
read of a file owned by someone else / living in a SharePoint site)
returns **403** even though the user can open the same link in a browser
(browser login carries full SharePoint membership). Reading those would
need `Files.Read.All` / `Sites.Read.All` + admin consent — the connector
doesn't request them, so it is **not fixable in VectorMesh code**.

**Workarounds that work today:** save a copy of the file into the user's
own OneDrive (then it shows in the root-children picker), or download it
and use VectorMesh's `uploaded_xlsx` upload option.

**Decode token scopes** without leaking the token: base64url-decode the
JWT payload (`access_token.split('.')[1]`) and read the `scp` claim.

**SDK proxy quirk:** `connectors.proxy(name, path)` does NOT add the API
version — include `/v1.0` (`connectors.proxy("onedrive", "/v1.0/me")`),
else Graph returns "Invalid version". The server's own code uses
`GRAPH_BASE` which already includes `/v1.0`.
