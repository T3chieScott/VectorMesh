---
name: Custom fonts (per-site uploads + built-in library)
description: How fonts are stored/resolved/served across admin, player, and offline; the intentional no-auth file route.
---

# Custom & expanded fonts

Stored values are font **keys**, never CSS stacks: a built-in key (e.g. `inter`)
or `custom:<familyId>`. A resolver maps the key to a CSS stack at render time.
Custom `@font-face` family name is `vmfont-<familyId>`. Built-ins all map to
Google Fonts already loaded in `client/index.html`.

**Font families (multi-file):** one uploaded file = one weight+style. Files
that share `familyId` are ONE family; the picker lists the family once and the
browser auto-switches files as text is bolded/italicised (each file emits its
own `@font-face` with the shared family name + its `font-weight`/`font-style`).
For a single-file family, `familyId == id` — which is exactly how the migration
backfilled pre-existing rows, so legacy `custom:<id>` references still resolve to
`vmfont-<id>` with zero data rewrite. **The file route still keys on the file id**
(`/api/fonts/<fileId>/file`); only the @font-face *family name* keys on familyId.

**Why store the key, not the stack:** keeps existing layouts/agenda configs
stable and lets the resolver evolve the fallback chain centrally. A font is only
applied when explicitly set; unknown/empty resolves to the Inter default, so
existing configs never visually regress.

**Intentional: `GET /api/fonts/:id/file` is unauthenticated.**
Offline Raspberry Pi players and the chromeless public agenda display page can't
carry an auth session, so the file route must be public; the Service Worker
caches it like media (`/api/fonts/:id/file` -> networkFirstMedia) for offline
rendering. Do NOT "lock down" this route — it will break offline + agenda fonts.
The mutating routes (list-by-client, upload, delete) ARE tenant-scoped via
`canAccessClient`.

**How to apply:** any new font-rendering surface should inject `@font-face` via
`client/src/lib/fontFace.tsx` (`CustomFontFaces` / `buildFontFaceCss`) and
resolve keys through `shared/fonts.ts`. Player payload (`PlayerContentResponse.fonts`)
and agenda display payload both carry the site's fonts so devices can self-host
the `@font-face` block offline.
