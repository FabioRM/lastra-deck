# Windows audio through MCP

Grant **Windows audio readings** to a linked MCP client to use `audio_read`. This permission covers Windows audio device and mixer state, including individual speaker and microphone signal levels. It applies across Lastra activities.

| Section | Values returned |
| --- | --- |
| `state` | The default speaker and active microphones, level in percent, individual mute, capture group state, and preferred microphone ID. |
| `playback` | Playback devices with active, disabled or disconnected state, and the current default. |
| `mixer` | Windows application session groups, level, mute, mixed levels or mute, pin status, and whether a pinned app is offline. Set `pinnedOnly` to include the saved mixer selections. |
| `peaks` | One scalar sample from 0 to 1 for the default speaker, a selected microphone, or both. Use `target` set to `output`, `input` or `both`. |

Start with `{ "section": "state" }`. To measure one microphone, use `{ "section": "peaks", "target": "input", "input": "…" }` with an ID from that result. Omitting `input` selects the current Windows preferred capture endpoint. The tool verifies the selected endpoint and mute state immediately before and after taking the reading. Muted and unavailable readings have a `null` value. A valid silent reading has value `0`.

Lastra takes one MCP peak reading every 500 milliseconds across all clients. A `throttled` response includes `retryAfterMs`. For collections, use `limit` up to 32 and pass a returned `nextCursor` with the same section and filters. `sourceSampledAt`, `ageMs`, and `status` describe the supporting Windows state.

Device and app aliases work within the granting client and the current Lastra process. Refresh the list after restarting Lastra. Windows performs the device and session enumeration. The tool returns aliases and structured state while keeping friendly device names, app paths, process IDs and raw endpoint identifiers private.

## Request a level change

In the tray, grant **Windows audio readings and Request Windows audio level changes** to enable `audio_action`. Read `audio_read` with `section` set to `state`, then pass the current default speaker or a listed microphone alias and its current percent value.

```json
{
  "command": "request",
  "target": "output-0123456789abcdef01234567",
  "before": 42,
  "level": 55,
  "idempotencyKey": "speaker-level-55"
}
```

The review shows the device name locally, with the current and requested levels. Approve once on the visible deck. If the endpoint or level changes while the review is open, read a fresh state and start a new request. Windows readback must confirm the level on the same endpoint. `confirmed` means Windows reported the requested level. Use `audio_read` to check current state after `unconfirmed`.

Use `{"command":"status","request":"…"}` or `{"command":"cancel","request":"…"}` with the request ID. Repeating identical parameters with the same key returns the existing request. The operation targets one endpoint level and preserves mute and playback routing.

## Request a mixer app’s volume

Grant **Windows audio readings and Request Windows app volume changes** to enable `audio_app_level`. Read `audio_read` with `section:"mixer"` and choose a live app with a `revision`. Use that app’s `id` as `target` and its `revision` as `before`.

```json
{
  "command": "request",
  "target": "app-0123456789abcdef01234567",
  "before": "app-rev-fedcba9876543210fedcba98",
  "level": 40,
  "idempotencyKey": "app-volume-40"
}
```

The deck displays the app name, number of Windows audio sessions, current level or mixed-level average, and requested level. After **Approve once**, Lastra checks the exact session list and levels again, sets the chosen percent on those sessions, and reads them back. If a session changes during the write, Lastra attempts to restore levels it already adjusted when it can still verify them. Use the returned request ID with `status` or `cancel`. Refresh the mixer after a stale or unconfirmed result.

## Request mute or unmute

Grant **Windows audio readings and Request Windows speaker or microphone mute changes** to enable `audio_mute`. Pass `command:"request"`, a current `target` alias, its boolean `before` and desired `muted` state, and an `idempotencyKey`. For example, `before:true` and `muted:false` explicitly unmutes the reviewed endpoint. The deck shows both states and requires **Approve once**.

Lastra confirms the mute state on the exact current speaker or selected capture endpoint. An active push-to-talk lease or microphone group change blocks a microphone request. Endpoint levels, other microphones and playback routing stay independent. Use the returned request ID with `status` or `cancel` in `audio_mute`.

## Request a playback device switch

Grant **Windows audio readings and Request Windows playback routing** to enable `audio_route`. Read `audio_read` with `section:"playback"`. Pass `command:"request"`, the current `defaultOutput` alias as `before`, an active playback alias as `target`, and an `idempotencyKey`.

The deck shows the current Console and Multimedia output devices and the proposed destination. Approve once. Lastra rechecks both Windows playback roles and confirms that both use the reviewed device. The Communications role, microphones, levels, and mute states remain independent. A failed switch attempts to restore any previous role Lastra changed. Use `status` or `cancel` with the returned request ID.
