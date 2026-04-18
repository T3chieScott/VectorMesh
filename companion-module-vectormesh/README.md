# companion-module-vectormesh

Bitfocus Companion module for [VectorMesh](https://vectormesh.4wallcloud.com) — fire onsite display screen presets from a Stream Deck and see live status colors.

## Features

- **Actions**: activate, deactivate, toggle, and "activate by name" (variable-driven) for any VectorMesh screen preset.
- **Feedbacks**: recolor a button when its preset is currently live, or when any preset is driving a given screen.
- **Variables**:
  - `$(vectormesh:active_presets_count)` — number of presets currently live.
  - `$(vectormesh:active_preset_<screen_id>)` — name of the preset currently driving each screen, empty when none. The suffix is the server's screen UUID with dashes replaced by underscores, so the variable key stays valid even if you rename the screen.
- **Drag-and-drop presets**: one starter button per VectorMesh preset, black until live, green when active.

## Requirements

- Bitfocus Companion **3.4** or newer.
- A VectorMesh server reachable from the machine running Companion.
- A VectorMesh API token (admin or account-manager only — see below).

## Generating an API token in VectorMesh

1. Log into VectorMesh.
2. Go to **Settings → API Tokens**.
3. Click **Create token**, give it a memorable name (e.g. "Stream Deck FOH"), and copy the `vm_…` value shown ONCE.
4. If you lose the value, revoke that token and create a new one.

## Installing the module

Until the module is accepted into Companion's official module library, install it as a developer module:

1. Download the latest `companion-module-vectormesh-vX.Y.Z.tgz` from the [releases page](https://github.com/4wallcloud/companion-module-vectormesh/releases).
2. Extract it to your Companion modules directory:
   - macOS: `~/Documents/Companion/modules/`
   - Windows: `C:\Users\<you>\Documents\Companion\modules\`
   - Linux: `~/.config/companion/modules/`
3. Restart Companion.
4. Add a new connection — search for **VectorMesh**.

## Configuration

| Field | Notes |
| --- | --- |
| **VectorMesh server URL** | e.g. `https://vectormesh.4wallcloud.com`. Trailing slashes are stripped. |
| **API Token** | The `vm_…` value from Settings → API Tokens. |
| **Poll interval (seconds)** | How often to refresh active-preset state. Default 2s, range 1–10s. |

On save, the module hits `GET /api/screen-presets` to validate the token. The connection status will read **OK**, **Authentication Failure** (bad token), or **Connection Failure** (URL unreachable).

## Your first button

1. Add a VectorMesh connection with your URL + token.
2. In the Buttons view, drag the **Presets → \<your preset name\>** button onto a button slot.
3. Press it. The preset activates and the button turns green; press again to deactivate.

You can also build buttons by hand: pick the **Activate preset / Deactivate preset / Toggle preset** action, then attach the **Preset is active** feedback.

## How polling works

- Every poll tick (default 2s) the module fetches `/api/screen-presets/active` and updates feedbacks + variables.
- Every 30s the module also re-fetches the preset / screen / group lists so dropdowns stay current.
- Polling never throws — failures bump a counter and only flip the status to `ConnectionFailure` after 3 consecutive misses, so brief blips don't spam errors.
- After any write action (activate / deactivate / toggle) the module schedules an extra refresh ~250ms later so the button color updates immediately instead of waiting for the next tick.

## Endpoints used

All endpoints accept the bearer token. Only the first two are required for
the module to operate; the screens / groups endpoints enrich the variables
and screen-feedback dropdowns and are best-effort.

Required:

```
GET  /api/screen-presets
GET  /api/screen-presets/active
POST /api/screen-presets/:id/activate
POST /api/screen-presets/:id/deactivate
```

Optional enrichment:

```
GET  /api/screens
GET  /api/screen-groups
```

## Development

```bash
yarn install
yarn build:watch       # in one terminal
companion-launch-dev   # in another, see Companion module dev docs
```

Build a distributable tarball:

```bash
yarn package
```

## License

MIT © 4Wall Cloud
