# Visual preview of a draft deck

`preview_draft` renders Deck Keys, Dashboard, or Stats with the persistent bar for a draft owned by the connected agent in the current Lastra activity. It also renders a custom app-view draft in the Apps screen. Create the draft with `profile_draft` or `app_view_draft`, then pass its ID and exact revision. Lastra checks that revision again before returning the image.

| Option | Default | Effect |
| --- | --- | --- |
| `view` | `keys` | Choose `keys`, `dashboard`, `stats`, or `apps`. Use an app-view draft ID with `apps`. |
| `page` | First draft page | Select a page by ID for a profile draft. |
| `sheet` | `0` | Select the zero-based quick-key sheet in Deck Keys. Dashboard and Stats use sheet zero. |
| `portrait` | `false` | Choose 2560 × 720 or 720 × 2560. |
| `theme` | `dark` | Select `dark`, `light`, `midnight`, `forest`, or `ember`. |
| `textScale` | `100` | Select `100`, `115` or `125`. |
| `highContrast` | `false` | Preview the deck's high-contrast styling. |
| `compareCurrent` | `false` | Compare the Deck Keys draft to the current saved layout when the client also has **Deck layout** access. |
| `liveReadings` | `[]` | Select `audio`, `telemetry`, or both. The client also needs **Windows audio readings** or **Telemetry and monitoring** access for each selected source. |

The response contains a JPEG image attachment and structured viewport, grid and tile data. Coordinates are measured from the top-left of the full-resolution preview in CSS pixels. The JPEG is downsampled to fit the local transport. Use the reported JPEG and viewport dimensions to map positions between them. Deck Keys geometry includes the selected sheet, editing buttons, visible stack members and persistent bar. Dashboard and Stats identify their sections with `kind: "panel"` and return their selected `view` alongside the persistent bar. Dashboard uses a fixed calendar, date, clock, media, and audio readings. Stats shows its overview with sample charts and a cached reading. Apps shows the custom draft's commands and widgets in its 4 × 4 grid, with a sample app window and fixture readings. Use `app_view_draft` with `command: "compare"` to inspect changes to that draft.

`checks` counts tiles clipped by the viewport or Apps scroll area, overflowing text, visible controls with a rendered dimension under 44 CSS pixels, controls without a detectable name and tiles with estimated text contrast below 4.5:1. Contrast can be unavailable for disabled controls and complex backgrounds. Name detection examines markup and text rather than a screen reader's accessibility tree. These checks help review a draft layout and still need verification on the target display.

The preview is rendered in a sandboxed offscreen window. It uses the bundled deck renderer, packaged icons and validated embedded PNGs already in a supplied draft. Linked images are omitted. A draft forked from the active profile masks authored labels and IDs and omits embedded PNGs. Screenshot data is returned through MCP and is kept out of JSON text and structured output. At most one render runs at once.

Each selected source uses a snapshot of Lastra's latest cached readings. Audio shows the default output and microphone levels and mute states. Signal peaks are unavailable in live preview. Telemetry populates CPU, GPU, RAM and temperature widgets and the CPU, GPU, RAM and CPU temperature cards in Stats. Unselected sources use fixture values, and cards without a live reading show **N/A** when live telemetry is selected. Media and calendar always use fixtures. The response identifies the sources used. Lastra checks their grants again before releasing the image.

With `compareCurrent: true`, `comparison` shows projected placement changes across all sheets of the selected page and the persistent bar. The `before` and `after` positions use zero-based grid rows and columns. A bar tile has `sheet: null`. The report includes all change counts and up to 32 placement changes. For an active fork, Lastra matches internally by identity and reports whether the current saved revision has diverged from the original fork. For a supplied draft, the comparison uses the saved page at the same ordinal and matches by position. It does not infer moves in independently authored layouts. Changes to labels, images, commands and widget configuration are outside this comparison. The response contains no saved labels, icons or raw tile IDs. `draftTile` refers to the proposed tile in the preview, including masked draft aliases where applicable.

For a profile draft forked from the current saved profile, request `profile_changes` with `command: "open-editor"`, the draft ID and revision, and an optional `page`. Select **Open in editor** on the deck to load that page in the desktop editor with the changes unsaved. Check the request status for `sent-to-editor`. If the editor already has local edits, it presents the draft as an offer. Opening that offer makes the agent draft the current edit and leaves the previous edits available through Undo.
