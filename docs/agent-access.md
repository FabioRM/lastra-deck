# Agent access

Lastra includes an optional local MCP server. It shares the running Windows instance with clients under the same Windows user. The desktop Settings window lists granted clients and their connection status.

1. In **Lastra → Settings → System**, open **Agent access → Enable local agent access**.
2. Switch to the activity you want the client to use. Under **Grant access**, choose its read scopes. Choose **Draft edits** separately if it needs to work on a temporary profile. Confirm to copy the client's MCP configuration.
3. Add that configuration to your MCP client. The command is `node` and its argument is the local `extensions/lastra-mcp/stdio.js` path in the copied configuration. Set `LASTRA_AGENT_CREDENTIAL` in the server process environment to the value in the same configuration. Create a separate grant for each client.
4. Run the client's `connection` tool to check the local session and scopes. Use **Clients** under **Agent access** to see or revoke a grant. **Pause agent access** disconnects all clients until resumed. Locking or suspending Windows also closes the connection.

The copied setup uses a JSON `mcpServers` entry. For a client with its own settings format, copy the same command, argument, and environment variable into its stdio server settings. Run `node extensions/lastra-mcp/stdio.js --check` with that environment to check the connection from a shell.

The standalone test client checks discovery, protocol compatibility and read latency. The verification guide includes a reversible draft-to-action example and steps to diagnose a disconnected client. [MCP verification](mcp-verification.md)

For a short inspection, choose **Agent access → Grant read access for 15 minutes** and select a read scope. The client’s `connection` response includes `expiresAt` in Unix milliseconds. Lastra shows its expiry under **Clients**. At expiry Lastra closes the connection, discards pending responses and rejects reconnects with that grant. Restarting Lastra preserves the original expiry. Use **Revoke access** to end it earlier.

For a configured project, choose **Agent access → Grant access to one project** and select its read grant or the grant that includes reviewed commands. The client sees only that project and commands explicitly configured for its folder. The `connection` response includes `projectRestricted: true`. Editing the project configuration invalidates the current grant’s connection and pending reviews. Issue a new grant for the updated project. [Project inventory and command review](mcp-projects.md)

**Deck layout** returns stable IDs and positions for the current page, its fixed editing controls, and the persistent bar. If you switch to a different activity, Lastra stops serving that layout to clients granted the previous activity. **Provider availability** reports whether local audio, media, telemetry, and OBS are available. It omits raw readings and private content. Windows Data Protection binds each credential to the Windows user.

Open **Tools → Apps → Action history** to see the short client reference, operation, target, timestamp, and outcome. Once a review opens, Lastra records one final entry even if the review is declined, cancelled, expires, or loses its target. The earlier request entry records whether Lastra accepted the MCP call. The final entry records the result of the review. Device, media and workspace targets use opaque aliases. The history omits request arguments, provider responses, and private names.

The `capabilities` tool and `lastra://v1/capabilities` resource include examples, permissions, and readiness for each tool. Input and output schemas are published once by `tools/list`. Follow its cursor to see additional entries. MCP revision 2025-06-18 supports structured tool results. Earlier supported clients receive the same result as JSON text.

## Start with a workflow prompt

Use `prompts/list` and follow its cursor to browse layout planning, shortcut audits, audio and OBS diagnosis, profile migration review, and macro troubleshooting. Retrieve a prompt with `prompts/get`. Give it a `project` and `goal` when useful, an `activity` for layout planning, or a `provider` for diagnosis. The prompt links to the bundled resources and guides the MCP client toward a draft or report you can inspect.

## Read a profile or provider snapshot

Use `profile_snapshot` or `lastra://v1/deck/profile?section=keys&limit=10` with the **Deck layout** grant. Select `summary`, `pages`, `keys`, `widgets`, `bar`, `rules`, or `navigation`. Filter a list with `query`, choose its page with `page`, and pass `nextCursor` as `cursor` to continue. If the profile revision changes, restart the list from its first page. Key payloads, widget contents, and window-title text stay on the deck.

Use `lastra://v1/deck/providers` with the **Provider availability** grant. Sources report their availability and freshness. Sample times use Unix milliseconds. The profile summary gives dimensions in both logical display units and physical pixels. The `lastra://v1/reference` resource links to the action fields, setup guides, shortcut sources, and an example profile.

Grant **Telemetry and monitoring** separately to use `telemetry_read` for current and recent Stats readings, power, Lastra resource usage, and redacted configured monitoring. [MCP telemetry and monitoring](mcp-telemetry.md)

Grant **Windows audio readings** separately to use `audio_read` for volume, mute, devices, the app mixer, and signal peaks. [Windows audio readings](mcp-audio.md)

Use the separate **Windows media readings**, **Spotify Connect readings**, or **OBS production readings** grants for transport, device, and production state. Request labels and titles explicitly when useful. [MCP media and production](mcp-media.md)

## Follow deck changes

Subscribe to `lastra://v1/deck/events?types=page,foreground,action,profile` with **Deck layout**. **Provider availability** enables `audio`, `playback`, `providers`, and `alerts`. Omit `types` to use the permissions of your current grant. Audio reports endpoint availability and mute state. Playback reports transport status. Alert events report counts.

When the client receives `notifications/resources/updated`, call `events_since` or read the resource using `after` with the last returned `cursor`. The same call works as a bounded polling fallback. Continue with the returned cursor while `more` is true. Lastra coalesces repeated state updates and retains the latest 120 events in memory. When a cursor expires or the session is reset, `resyncRequired` tells the client to refresh its profile or provider snapshot. Subscribe again after reconnecting. A playback subscription reads Windows media at the configured interval when the deck has no recent default-player sample.

## Navigate the touchscreen

Grant **Deck layout and Deck navigation** for the active activity. Use `deck_navigation` with `command:"inspect"` to read the current surface, saved pages, view, page match reason, target availability, lock and follow state, and appearance. Use `command:"surface"` to show the Lastra deck on its configured display. The surface ID is `deck`.

Use `command:"view"` with `view:"dashboard"`, `"keys"`, `"stats"`, `"apps"`, or `"obs"`. Use `page` with a saved page ID, `home` to return to the first page, or `stats` with a `tab` such as `"cooling"`. The `lock` and `follow` commands take an `enabled` boolean. Enabling follow clears a manual page override. Use `appearance` with a listed `setting` and `value`. View-only mode allows navigation and blocks changes to lock, follow, and appearance. The surface reports display rotation and dimensions, along with support for brightness and display wake.

## Request a saved key action

Grant **Deck layout and Request saved key actions** for the active activity. Use `profile_layout` for the displayed page ID and revision. Use `profile_snapshot` to see a saved key's gestures. On Deck Keys, `registered_action` can request an assigned gesture on a saved page key. Use `bar:` before a persistent bar key ID and pass the displayed page and revision.

```json
{ "command": "run", "page": "home", "id": "saved-key", "gesture": "tap", "revision": 7, "idempotencyKey": "example-001" }
```

Lastra shows the client, saved key, gesture, target, and configured steps on the deck. Tap **Approve once** to run it or **Cancel** to decline. The request expires after 60 seconds. Changes to the grant, page, surface, or required foreground target stop the request. View-only mode blocks execution. The returned request ID supports `status` and `cancel`. Cancellation stops pending steps. A command already delivered to Windows can still take effect.

Use the same `idempotencyKey` with the same arguments to recover the request and avoid a second run during the current Lastra session. Completed request IDs are retained for 30 minutes. `confirmed` reports completion with the available readback. `unconfirmed` covers Windows input and other steps that the target app must confirm. The tool reports redacted step results, and **Apps → Action history** records the caller, stable target, time, and outcome.

While a macro is running, `status` includes its current step path and attempt, with repeat iteration when applicable. `steps` accumulates completed step outcomes and `stepCount` counts observed steps. The response reports at most 100 step records. Once the macro finishes, the final trace includes skipped branches. Command arguments, provider messages, and clipboard contents stay outside this progress response.

## Work with a profile offline

Use `validate_profile` or `preview_profile` with a supplied profile object. Validation uses the desktop editor's rules. Preview returns the grid, positions, and fixed editing keys for the requested page and orientation.

Use `simulate_gesture` with a supplied profile, a page and key ID, and `gesture:"tap"`, `"hold"`, or `"double"`. Use `page:"bar:"` for a persistent key. Supply foreground and provider conditions as fixtures, or add an ordered `timeline` of changes in milliseconds. The result includes the expected deck status, delayed branches, skipped steps, and simulated effects. A confirmation requires `confirmed:true` in the fixture. This tool never sends input to Windows or contacts a provider.

With **Draft edits**, `gesture_fixture` can save a sample scenario and expected result locally. Run it against another revision of your draft to detect changed behavior. [Gesture regression fixtures](gesture-fixtures.md)

```powershell
node extensions/lastra-mcp/stdio.js --validate profiles/default.json
node extensions/lastra-mcp/stdio.js --preview profiles/default.json
```

## Edit a temporary draft

With **Draft edits**, call `profile_draft` using `{"command":"create","source":"active"}` to fork the saved profile for the granted activity. Use `"source":"empty"` or `"source":"supplied"` to start a new draft. A supplied draft needs a `profile` object.

The tool returns a draft ID and a revision. With `command:"edit"`, send the ID as `draft`, the latest `revision`, and up to 32 edits. A batch creates one revision after its final layout passes validation. Each key operation uses a page ID or `"bar:"` as `surface` and a zero-based slot. Widgets use an instance ID and grid coordinates. A rejected batch keeps its previous draft.

```json
{
  "command": "edit",
  "draft": "0123456789abcdef01234567",
  "revision": 1,
  "edits": [
    { "op": "add-page", "id": "research", "name": "Research", "folder": ["Work", "Notes"] },
    { "op": "set-widget", "surface": "research", "widget": { "id": "load", "type": "system-metric" } }
  ]
}
```

Set `settings.folder` in a `page-settings` edit to move an existing page to a folder. Use an empty array to return it to the top level. The draft lists the proposed path for each nested page. Lastra validates the path with the editor’s Folder path rules and shows the exact change if you request profile approval.

Use `inspect` for the latest revision, `preview` for deck coordinates, or `discard` with its revision to close the draft. Drafts live in memory for the current Lastra session. A client can edit only its own drafts under the activity named in its grant.

### Draft a custom app view

With **Draft edits**, call `app_view_draft` and supply a custom app-view definition. Choose an executable basename or packaged app ID for app matching. The draft also accepts the optional title filter and launch URL supported by the custom app-view editor.

```json
{
  "command": "create",
  "view": {
    "id": "research",
    "name": "Research",
    "match": { "executable": "notepad.exe" },
    "widgets": [{ "id": "load", "type": "system-metric" }]
  }
}
```

Use the returned `id` and `revision` as `draft` and `revision`. `edit` accepts a batch of presentation, matching, shortcut, and widget changes. Lastra validates the complete batch, including the 4×4 widget grid. `fork` copies an exact draft revision into an independent draft with the supplied `newId`. `inspect` returns the draft definition, `preview` returns widget coordinates and shortcut labels, and `compare` reports which fields changed since creation or the fork point.

The tool works on drafts supplied by the client under its current activity grant. Preview uses the draft structure and leaves URLs and shortcuts inactive. Use the local custom app-view editor to save a configuration.

## Review a saved profile change

Grant **Draft edits and Request profile changes** to a client that needs to submit a profile for review. Fork the active saved profile and keep its draft revision. Call `profile_changes` with `command:"compare"`, `draft`, and `revision` to read the affected fields.

Call `profile_changes` with `command:"apply"` and the same draft and revision. Lastra opens a local review on the deck with the client, activity, and current and proposed values. Select **Approve once** to save, **Open in editor** to review without saving, or **Cancel** to decline. For an editor-only request, use `command:"open-editor"`. Both requests accept an optional `page` ID to select the affected page. The request expires after 90 seconds. A disk revision, draft, activity, connection, or grant change cancels the approval or reports a conflict.

For a standalone decision, grant **Request choices on the Lastra deck** for the activity and call `agent_choice` with `command: "request"`, a `question`, a named `target`, and two to five `choices`. Each choice has an `id`, `label`, and intended `effect`. The deck displays the agent, target and options. Lastra returns the selected ID to the requesting client. A separate reviewed action is required to make a change. Call `agent_choice` with `command: "status"` or `"cancel"` and the returned `request` ID. The request closes after 60 seconds or when the grant, session or deck becomes unavailable.

#### Switch the active activity

Grant **Request activity switches** separately. Call `profile_activity` with `{"command":"inspect"}` for the current activity and available destinations. Send `{"command":"switch","activity":"meeting","revision":"<inspection revision>"}` to request the selected profile on the local deck. The review shows both activity names and identifies a default profile that will be created on first use. It expires after one minute. A profile or activity change requires a new inspection.

Poll `status` or send `cancel` with the returned request ID. The `switched` result confirms the activity and saved selection. An `unconfirmed` result includes the activity observed after the attempt and whether Lastra could verify its saved selection. Existing activity-specific grants still apply only to the activity on which they were issued.

The tool returns a request ID. Use `command:"status"` and `request` to read its outcome. Use `command:"cancel"` to close a pending approval. To undo an applied profile revision, call `command:"backups"`, then `command:"restore"` with the saved `backup` ID and inspected `baseVersion`. Restoring a validated backup goes through the same local review. Profile history records the previous valid version.

## Search the offline catalogs

Use `search_catalog` to find an action, widget, or keyboard shortcut from the bundled catalogs. It works with the local stdio server before you grant access to the running deck. Query by intent, name, alias, or chord. Narrow the results with `kind`, `app`, `platform`, `context`, `integration`, `tag`, or `icon`.

```json
{ "kind": "shortcut", "app": "Google Docs", "query": "copy", "platform": "web", "limit": 6 }
```

Results include settings, examples, provenance, and compatibility. Shortcut results distinguish the browser edition from its Windows host and include available keymap and verification details. Pass `shortcutLanguage` as `en-US` or `it-IT` and `keyboardLayout` as `us`, `it`, or `it142` when you know the intended keymap and layout. A conditional result still depends on the matching app, provider, or active context. Reference-only results explain which variants are unavailable for assignment.

The default page size is 20 and the maximum is 40. When a response includes `nextCursor`, repeat the same filters and limit with that value in `cursor`. [Shortcut pack sources](shortcut-packs.md#offline-catalog) · [Widget settings](widgets.md) · [Action and macro settings](macros.md)

## Validate a macro composition offline

Use `compose_macro` with a supplied `profile`. An optional `edit` changes the proposed behavior of an existing page key, persistent bar key, or linked control in memory. Use `tap`, `hold`, `doubleTap`, `confirmation`, and `onBusy` in the edit’s `behavior`. Page and bar keys also accept `runVariables`. A `null` value clears an optional field. Choose `surface` as `page`, `bar`, or `control`. A page key also needs its page ID.

```json
{
  "profile": { "keys": [{ "id": "pause", "action": { "type": "delay", "ms": 100 } }] },
  "edit": {
    "target": { "surface": "page", "page": "home", "id": "pause" },
    "behavior": { "hold": { "type": "delay", "ms": 500 } }
  }
}
```

The result reports errors and warnings with paths into the supplied profile. It includes potential duplicate shortcuts among controls that can appear together and flags requirements for providers, Windows builds, app modes, and keyboards. Pass optional `environment` values to check a known sample. A valid report confirms the draft structure and supported inputs. Verify provider and foreground conditions on the deck before running a saved key.

Edit a linked key through its shared `control` definition. Parameterized calls resolve against `macros` in the supplied profile, including default arguments and values forwarded to nested calls. Expressions resolve against the supplied profile, page, and key run declarations before the tools check actions and shortcut conflicts. Missing values, type errors, and circular dependencies appear in the validation report. The tool leaves the supplied profile and saved files unchanged. [Macro editor](macros.md#reuse-a-parameterized-macro) · [Scoped variables](macros.md#calculate-values-with-scoped-variables) · [Linked controls](linked-controls.md)
