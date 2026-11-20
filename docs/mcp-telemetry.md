# Read monitoring data through MCP

Grant **Telemetry and monitoring** to a linked client to use `telemetry_read`. The grant covers the local Lastra installation across Windows activities. The **Provider availability** grant continues to serve the connection and availability tools.

| Section | Data returned |
| --- | --- |
| `metrics` | Latest Stats observations with value, unit, source, sample time, age and availability. Filter by `group` and page with `nextCursor`. |
| `history` | Samples for one metric from the last 60 seconds of available Stats history. Pass `metric` and optionally Unix millisecond `from`, `to` and a `limit` up to 120. `null` marks a recorded gap. |
| `compare` | Count, minimum, maximum and average for two windows on one metric. Each window uses `from` and `to` in Unix milliseconds. `averageDelta` is the second average minus the first. |
| `services` | Status, latency and interval for checks already configured in Lastra. Pass the returned `id` to read its most recent check outcomes. |
| `alerts` | Alert state, times, occurrence counts and acknowledgement time. Filter by `active`, `recovered` or `retired`. An active, unacknowledged alert from a supported provider includes a revision for local approval. |
| `thresholds` | Configured metrics, directions, limits, hold times and current rule state. |
| `watchlist` | Current pins with hardware readings, last cached app samples and existing service check status. |
| `power` | Windows battery and power status, configured UPS status and recent AC/battery transitions. |
| `usage` | CPU and working set for Lastra's Electron processes and managed helpers, with aggregate embed request counts. |
| `diagnostic` | A versioned JSON snapshot of selected readings, power, usage and monitoring summaries. |

Start with `{ "section": "metrics", "group": "frames" }`. Use the returned metric `id`, such as `fps`, in `{ "section": "history", "metric": "fps" }`. Metric and service queries use the same IDs across samples. Device-specific metrics, service checks, thresholds and alerts use stable aliases. Raw device and window names, process IDs, service endpoints and response text stay outside tool results. Repeat the same filters and limit when following a cursor.

## Draft thresholds and watchlist pins

Issue a combined **Draft edits** and **Telemetry and monitoring** grant to prepare temporary monitoring changes in the selected activity. Call `monitoring_draft` with `command: "create"`, `target: "thresholds"` or `"watchlist"`, and `source: "active"` or `"empty"`. Use the returned draft ID and current revision for `edit`, `preview`, `compare`, and `discard`.

For thresholds, use `add-rule` with the `metric`, `limit`, and optional `direction` and `holdSeconds`. Use a threshold alias for `update-rule` or `remove-rule`. For the watchlist, use `set-pins` with an ordered list of up to six hardware, app, or service IDs from telemetry reads. A service pin already present in the draft can remain visible after the check is removed. Changes in a batch share one validated revision.

`compare` shows redacted rule changes or the before-and-after pin order. `baseCurrent` is true while the active configuration still matches the draft's source. It is null for an empty draft or an unavailable source. Review proposals in the draft and use Lastra's local threshold and watchlist controls to make saved changes. The tool keeps only temporary proposals in memory. [Monitoring watchlist](watchlist.md)

FPS, frame timings and Windows storage use the latest Stats samples. An MCP read leaves foreground capture and service probe scheduling under the desktop's existing controls. The result shows stale or unavailable sources along with the timestamps of available readings. Watchlist reads use already sampled Docker counts and include whether the count covers a partial list.

## Acknowledge an active alert

Grant **Telemetry and monitoring** and **Request alert acknowledgements** to allow a client to request this change. Get the current `id` and `revision` from `telemetry_read` with `{"section":"alerts","status":"active"}`. Pass them to `alert_acknowledge` as `alert` and `revision` with `command: "request"`. Lastra displays the selected alert in the deck's approval window. Select **Approve once** within 60 seconds to acknowledge it.

Use the returned `request` ID with `command: "status"` or `command: "cancel"`. Only the requesting client can read or cancel it. A changed, recovered, retired, or locally acknowledged alert closes a pending review. A lost grant, locked session, or disabled review surface cancels it. A restart invalidates old alert revisions and request IDs.

`acknowledged` confirms the alert's acknowledgement was saved. `acknowledged_session` means Lastra applied it in memory and could not save it to disk. The acknowledgement leaves the alert active until its provider reports a recovery. Tool replies omit alert text, names, endpoints and paths. The local approval shows the selected alert alias, its source and occurrence, and a safe configured display label when available.
