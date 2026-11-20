# Gesture regression fixtures

Use `gesture_fixture` from a linked MCP client with **Draft edits** access. The archive is local to Lastra, scoped to the linked client and its Windows activity, and available across desktop restarts. A fixture retains its name, the supplied sample scenario, and a redacted baseline with the simulated status, timing, counts, and fingerprint. The draft stays in memory under its own revision.

## Record and run

Create a draft with `profile_draft`. Then call `gesture_fixture` with `command` set to `record`, its `draft` ID and current `revision`, a `label`, and a `scenario`. Use the sample states and timeline fields from `simulate_gesture`. Replace the draft ID, page ID, and key ID in the example with the values from your draft.

```json
{
  "command": "record",
  "draft": "12ab34cd56ef78ab90cd12ef",
  "revision": 1,
  "label": "Window changes during a delay",
  "scenario": {
    "page": "home",
    "key": "save",
    "gesture": "tap",
    "values": { "foreground": "code.exe" },
    "keyboardLayout": "us",
    "windowId": 1,
    "requireStableWindow": true,
    "timeline": [{ "atMs": 90, "windowId": 2 }]
  }
}
```

Pass the resulting fixture ID to `inspect` to retrieve its scenario and baseline. Pass it to `run` with a draft ID and current revision to compare that draft against the original baseline. `matches` compares the simulated outcome, virtual timing, effect types and step results, including skipped branches and retries. The report shows up to 64 effect and step rows. Simulation messages and draft action contents stay outside the archive and tool results. Run the same fixture after a code or draft change to see whether its expected behavior still holds.

Use `list` to find saved IDs and `remove` with a fixture ID to delete from the archive. Each client can store up to 16 fixtures in its activity, with a total limit of 64 for the local Lastra installation. Use synthetic app, window, and provider values for the scenarios you retain.

## Replay an approved Panel measurement contact

Export diagnostics after a [Panel measurement](panel-measurement.md) run. Review the export and share the selected contact with the linked client you want to run the replay. Take `version` from `panelMeasurement`, `phase` and `durationMs` from one of its `runs`, and `tap` from that run's `input.taps`. Supply only those fields. Replay uses this sample for one request and leaves the fixture archive unchanged.

```json
{
  "command": "replay",
  "draft": "12ab34cd56ef78ab90cd12ef",
  "revision": 1,
  "trace": {
    "version": 1,
    "phase": "active",
    "durationMs": 60000,
    "tap": {
      "offsetMs": 1000,
      "requests": 1,
      "executions": 1,
      "outcome": "unavailable",
      "pendingFrameMs": 16.67,
      "feedbackFrameMs": 133.34,
      "foregroundChanged": true
    }
  },
  "scenario": {
    "page": "home",
    "key": "save",
    "gesture": "tap",
    "values": { "foreground": "code.exe" },
    "windowId": 1,
    "requireStableWindow": true,
    "timeline": [{ "atMs": 90, "windowId": 2 }]
  }
}
```

Choose the draft page, key, and gesture explicitly. Use `page: "bar:"` for a persistent key. The trace omits key and gesture identity, confirmation, provider values, window identities, the timing of focus changes, and macro branches. Supply any needed context and timeline as explicit sample assumptions. For example, the window switch at 90 ms above is a supplied sample and `foregroundChanged` only records that the sampler saw a change. `offsetMs` is relative to the recorded run, while `timeline.atMs` is relative to the simulated action.

The result preserves the redacted contact under `replay.trace`. `replay.outcomeComparison.matches` compares only the reported deck outcome with the simulated `observed.status`. A missing or duplicate request or execution, an unreported outcome, and outcomes without a simulator equivalent make that comparison unavailable. The result still includes the simulated steps and effects in these cases. Observed frame timings, pointer displacement and dispatch counts are diagnostic data. Simulated action time uses a virtual clock. Replay sends no input, contacts no provider, and cannot establish delivery to the recorded target.
