# Windows media, Spotify and OBS through MCP

Lastra offers a separate read permission for each integration. Grant the one the client needs from **Agent access**. The basic provider availability and event tools continue to show connection or playback state.

| Permission | Tool | Sections |
| --- | --- | --- |
| Windows media readings | `media_read` | `active` for the current or selected session, playback position and supported transport capabilities, or `sessions` for the Windows picker. |
| Spotify Connect readings | `spotify_read` | `playback` for the current account item and position, `devices` for Spotify Connect, and `queue` for upcoming entries. |
| OBS production readings | `obs_read` | `state` for the configured OBS connection, studio mode, recording and streaming, `scenes` for the current collection, and `sources` for the current source scene. |

The default response includes playback or production state and uses aliases for selectable objects. Set `metadata` to `true` to include labels in a selected section, such as a track title, a Spotify Connect device name, or a scene or source name. Transport credentials, playback links, artwork and playing history stay private. Labels are supplied by the integration. Device and session aliases belong to the linked client and current Lastra process.

## Windows media

Call `{ "section": "active" }` to read the system's current media session. Use `{ "section": "sessions" }` to find another player and pass the returned `id` as `session` in the `active` request. Reopen the list when the player or its alias becomes unavailable. A Windows source may report a duration, position and seek range. The response includes those fields when the source provides them.

### Request a Windows playback change

Grant **Windows media readings** and **Request Windows playback changes** to use `media_action`. Read `media_read` with `section: "active"` immediately before requesting a change. Use `play`, `pause`, `seek`, `next`, or `previous`, the session alias from `active.id`, the observed `active.state` as `before`, and a unique request key. For a seek, include `positionMs` within the reported seek range. Check the player’s `next` or `previous` capability before requesting a skip.

```json
{
  "command": "request",
  "action": "pause",
  "session": "media-session-0123456789abcdef01234567",
  "before": "playing",
  "idempotencyKey": "pause-current-player"
}
```

The deck shows the player, current item when available, and intended change. Lastra rechecks the same session and item after approval. It confirms playback state, a seek within two seconds of the requested position, or a new item in the same player after a skip. A player that restarts the current item may report `unconfirmed`. The status and cancellation commands use the returned request ID. Use `media_read` to check the latest state before requesting another change.

## Spotify

Use the existing Spotify account connection in Lastra. The tool reads its latest cached sample by default. Set `refresh` to `true` to request fresh readings from the authorised Spotify account. The tool reports which sections are blocked by Spotify's account permissions or device restrictions. A stale sample keeps its timestamp and omits names. Clients can query Windows media to inspect a Spotify desktop session when the account connection is unavailable.

### Request a Spotify Connect playback change

Grant **Spotify Connect readings** and **Request Spotify Connect playback changes** to the same client. Request `spotify_read` with `section: "playback"` and `refresh: true`. A fresh, controllable item reports `playback.control.revision`, a device alias, and which of `play` and `pause` is available. Spotify requires a Premium account and the `user-modify-playback-state` OAuth permission for these controls. Lastra's Spotify setup already requests it. If a previous sign-in lacks that permission, disconnect and reconnect from the deck's Spotify view. Readings remain available where Spotify authorises them. [Start/resume playback](https://developer.spotify.com/documentation/web-api/reference/start-a-users-playback) · [Pause playback](https://developer.spotify.com/documentation/web-api/reference/pause-a-users-playback)

```json
{
  "command": "request",
  "action": "pause",
  "revision": "spotify-playback-0123456789abcdef01234567",
  "idempotencyKey": "pause-spotify-01"
}
```

The deck shows the device, current item, and requested state. After approval, Lastra checks the same account connection, active device, item, context and observed playback change before sending one command. Play resumes the current item. Spotify's endpoint accepts a device ID and applies the command to that device's current playback, so a change made by another Spotify client between the final read and the command can leave the outcome uncertain. Lastra reports `confirmed` after the same account, device and item report the requested state. Use a fresh `spotify_read` after a `stale` or `unconfirmed` result.

Use `command: "status"` or `"cancel"` with the returned `request` ID. Repeating the same request key returns the existing receipt. A command already received by Spotify can take effect after cancellation. Action history records the redacted outcome and the requesting client prefix.

## OBS

OBS reads use Lastra's current authenticated connection and cached view. `sources` describes the current program or preview scene, according to the deck's OBS mode. If the user has selected a source there, the response includes the observed mute, volume and filters for that exact source. Reconnects give scenes and sources new aliases.

Lists accept an optional `limit` up to 32 and return `nextCursor` when more entries are available. Repeat the same section and options with that cursor. `sourceSampledAt` and `ageMs` report when the provider observation was collected.

### Request a reviewed OBS change

Grant **OBS production readings** and **Request OBS scene and source changes** to the same client. Call `obs_read` for the current generation and target alias, then call `obs_action` with `command: "request"`, the `generation`, `target`, `action`, and a unique `idempotencyKey`. Scene changes use `action: "scene"`. Source changes use `action: "visibility"` or `action: "mute"` and include the desired boolean `value`. Mute is available for the source selected in the OBS view.

The approval window shows the scene or source and the requested change. Lastra rechecks the target and OBS connection before dispatch and verifies the result against OBS. Call `obs_action` with `command: "status"` or `"cancel"` and the returned `request`. An unconfirmed result can follow a change OBS accepted before a disconnect or cancellation. Reuse the same request key to retrieve its receipt without dispatching again.

Lastra checks that the grant and deck remain available while verifying a reviewed OBS change. **Apps → Action history** records a terminal outcome with the client ID prefix, timestamp, and target alias or output type. Scene and source names and OBS response text stay out of that entry.

### Request a recording or streaming change

Grant **OBS production readings** and **Request OBS recording and streaming changes** to enable `obs_output`. Call `obs_read` with `section: "state"` and take the `generation` and the relevant output’s `active` boolean. An output is available for approval when its `phase` is `null`.

```json
{
  "command": "request",
  "generation": 3,
  "action": "record",
  "before": false,
  "value": true,
  "idempotencyKey": "start-recording-01"
}
```

Use `record` for recording and `stream` for streaming. The deck asks for local approval and displays the exact output and resulting state. Lastra refreshes OBS after approval and checks that the reviewed state still applies. It reports success after OBS confirms the requested state. A `stale` response calls for fresh readings. Check `obs_read` to confirm an `unconfirmed` result before requesting another change. Status and cancellation use the returned request ID in `obs_output`.
