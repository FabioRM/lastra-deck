# Inspect and arrange Windows workspaces through MCP

Grant **Windows workspace inventory** to use `workspace_inventory`. It returns the saved workspace inventory, launch targets registered in those workspaces, the displays, and matching visible app windows. Lastra matches the exact configured executable path when inspecting windows. Each display has a numbered entry, a primary indicator, and work-area dimensions. Window bounds and planned positions are in physical pixels relative to the work area of their monitor.

Set `metadata` to `true` to include configured workspace names and executable basenames. Window titles, profile paths, launch arguments, Windows process IDs, and raw monitor IDs stay outside the MCP response. Aliases are specific to the client and current Lastra process. Use an optional `limit` up to 40 for window rows. Pass `nextCursor` with the same options to continue the inventory. A target with multiple matches lists up to three observed windows.

## Request a reviewed layout

The **Request workspace arrangements** grant enables `workspace_apply`. Start with the current `workspace_inventory` result. Choose a native workspace in `ready` state with a `revision` and pass its ID and revision in `{ "command": "request", "workspace": "…", "revision": "…" }`.

The deck approval shows the selected workspace and its apps, the current and destination monitors, and the planned window positions. After **Approve once**, Lastra rechecks the saved configuration, monitor topology and the exact window for each app before arranging it. Windows reports back final positions. Each matching app needs one already-open window and any saved destination monitor needs to be available.

Call `workspace_apply` with `command` set to `status` or `cancel` and the returned `request` ID. `confirmed` counts windows verified at the requested position or shown as expected. `attempted` counts windows on which Lastra tried an effect. A cancellation or failed readback can leave a partial result. If the revision changes before approval, refresh the inventory and request a new review. PowerToys entries appear in the inventory as external layouts.

## Open a saved app or focus one window

Grant **Windows workspace inventory** and **Request opening or focusing saved Windows apps** for the activity. `workspace_target` takes one app or window from a fresh inventory response. Existing arrangement grants keep their original scope.

- For a saved app with a `launchRevision`, pass `command:"launch"`, the workspace `id` as `workspace`, the app’s `target` alias and its `launchRevision` as `revision`. The deck shows the configured executable and arguments. Lastra checks the registered file, rejects a duplicate start, and confirms when one matching app window appears. The new window uses the app’s default placement.
- For an existing window with a `focusRevision`, pass `command:"focus"`, its `id` as `window` and its `focusRevision` as `revision`. The deck shows the app and its current monitor and window bounds when available. Lastra rechecks the same window and verifies it becomes the foreground window. Other open windows of the app remain independent targets.

Approve the exact target on the deck. Use `workspace_target` with `command:"status"` or `command:"cancel"` and the returned `request` ID. If the file, workspace, window, monitor, grant or session changes before dispatch, read the inventory again. If Windows receives a launch but a window cannot be verified, the result is `unconfirmed`. Wait for the app to finish starting before submitting a fresh request.

## Open a saved PowerToys layout

Grant **Windows workspace inventory** and **Request opening saved PowerToys workspaces** for the activity. For a configured PowerToys layout with an `externalRevision`, call `workspace_external` with `command: "request"`, its workspace `id` and that revision. The deck displays the saved shortcut, its launcher and arguments, and explains that PowerToys can open apps and rearrange windows.

Before handing off the shortcut, Lastra checks the same layout, shortcut and launcher files, display topology, grant and session. A successful handoff returns `unconfirmed` with one attempt and zero confirmed placements. PowerToys controls and reports the placement separately. Send `command: "status"` or `command: "cancel"` with the returned `request` ID. Cancellation after handing the shortcut to Windows cannot undo PowerToys changes already in progress.
