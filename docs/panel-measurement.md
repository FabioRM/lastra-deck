# XENEON EDGE measurement runs

Use the same PC, displays, DPI, orientation, Lastra version, view, layout, and active providers across runs. Keep the Windows power mode and background workload fixed. Record the comparison conditions alongside the reports, including whether the foreground target ran normally, elevated, in borderless mode, or in exclusive fullscreen. Use separate runs for each scenario.

## Record a baseline

1. Close Lastra through its tray icon. Copy the measurement profile to a temporary file and start Lastra with measurement tools enabled. The copied file keeps the normal Lastra profile out of the test.

   ```powershell
   $lastraMeasurementProfile = Join-Path $env:TEMP ('lastra-panel-' + [guid]::NewGuid().ToString('N') + '.json')
   Copy-Item -LiteralPath '.\profiles\panel-measurement.json' -Destination $lastraMeasurementProfile
   npm start -- --measure-deck "--profile=$lastraMeasurementProfile"
   ```

2. Open Deck Keys and place a new, empty Notepad document in the foreground on the primary display. Confirm that the panel shows **Notepad measurement** and **Send x to Notepad**. Use a scratch document dedicated to this test.
3. From **Lastra → Settings → System → Diagnostics and deck maintenance**, choose **Panel measurement → Record idle (60 seconds)**. Within three seconds, restore the scratch document to the foreground and leave the mouse cursor at a marked reference point. Leave the mouse, keyboard, and panel untouched for the full minute. Wait at least 64 seconds from starting the run.
4. Keep the same layout and providers. Choose **Panel measurement → Record active (60 seconds)**, restore the scratch document and its cursor position within three seconds, and tap **Send x to Notepad** 30 times, once every two seconds or slightly faster. Count the physical taps independently. Leave the mouse untouched. Wait at least 64 seconds from starting the run before opening Settings again.
5. Count the `x` characters received in the scratch document and note the count with the run. Choose **Export diagnostics** from **Diagnostics and deck maintenance** and save the JSON. The `panelMeasurement` section contains the latest completed idle and active runs for the current session. Export each pair before repeating it.

## Read the results

- Compare independent physical tap and receiver counts with measured key contacts, dispatch requests, and runner executions. A tap can be missing before Chromium sees it, and a successful runner execution does not prove the target app accepted the input. Tap records distinguish absent and repeated requests or executions within Lastra. If aggregate counts disagree or could mask a missed tap and a duplicate, repeat at a slower pace and log reception for each tap independently.
- Each tap includes the largest sampled physical-pixel displacement during the first 225 ms and the displacement remaining near the end of that window. The baseline is a polling sample from at least 35 ms before the Chromium contact timestamp. Foreground transitions and movement are observations at a 20 ms sampling interval. Brief transitions can occur between samples. The report omits absolute cursor positions, window identities, app and document names, key labels, and command contents.
- Pending and completion latencies run from Chromium's touch-down timestamp to a frame that presented the corresponding feedback. The frame callback provides a paint opportunity estimate. Measuring display scan-out or input-to-photon latency requires a separate physical setup. Fast commands can complete before there is a distinct pending frame.
- CPU and working set are sampled about every two seconds for the Electron process tree, managed hardware monitor, and Windows media helper. The first CPU reading can be unavailable while establishing a baseline. External tools and short-lived processes such as PresentMon, PowerShell queries, and compilers are outside these working-set readings.
- `providerReads` records CPU and RAM, Windows audio, hardware monitor packets and HTTP requests, media helper snapshot requests, and the Windows Stats and PresentMon queries. `redrawFrames` counts frame opportunities in which visible DOM content changed in Deck Keys, Dashboard, Stats, or the persistent bar. These counts omit compositor-only updates and may include clocks or feedback. The resource sampling added for the measurement remains active in both phases, with the same cadence.
- `panelMeasurement.comparison` checks that idle precedes active and that recorded settings and duration match. For a comparable pair it reports active-minus-idle changes in provider reads, DOM frames, mean CPU percentage points and mean working set. A missing mean stays `null`. Check the separately recorded foreground app, power mode, and physical tap and receiver counts before interpreting the differences.

Repeat a pair before drawing conclusions. Consistent missing contacts or measured focus and pointer disturbances justify an input-handling prototype. Normal delivery paired with consistently slow visual feedback or high redraw activity suggests profiling the renderer first. For another foreground app, bind a harmless command with an observable result to that app and keep it fixed for that pair. Run fullscreen, elevated-target, and physical touch scenarios separately because each can affect the result.

## Focus and delivery checks

Run `node --test test/panel-measurement.test.js` to exercise the shortcut runner with a simulated foreground window and keyboard adapter. The fixture checks that a stable target receives the Unicode key press and release, that a zero-event result from the keyboard adapter reports an error, and that a foreground change to another window of the same app blocks delivery before any events are sent. The fixture supplies the cursor samples independently and verifies that the report records their displacement.

For the physical S01 run, record a row for each ordinary, elevated, borderless, and exclusive fullscreen target tested on the XENEON EDGE.

| App and display mode | Physical contacts | Foreground retained | Cursor displacement (px) | Commands received by target | Minimized or lost input |
| --- | --- | --- | --- | --- | --- |

Keep the app, elevation, display mode, and observable command with each exported report. Record unsupported modes as unavailable. The S01 and R01/R02 physical checks remain open.
