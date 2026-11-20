# Deck widgets

Open the profile editor and choose **Page widgets** or **Bar widgets**. Use **Search widgets** to find a type by name or provider. Select it to see its requirements, settings, and a preview with sample data. For an empty slot, choose its column, row, width and height, then select **Add widget**. The persistent bar has six columns and stays visible in Deck Keys, Dashboard, and Stats.

Choose **Stack with** to put a widget in the same slot as an existing widget. Each tab has its own settings and can have a custom label. Use the arrows on the deck to switch tabs and see the selected tab. Providers run for the visible tab while that part of the deck is on screen. Choose **Own slot** to move a widget out of its stack or move the whole stack with **Edit draft layout** in Live preview.

Select the **Persistent bar** tab in the profile editor to add global keys alongside widgets. Bar keys use the same gestures, confirmation, clipboard and action settings as page keys. A hotkey in the bar can set **Allowed foreground apps** to restrict its destination. The Home, microphone and output controls are always available at the top of the display.

Select a widget under **Placed widgets** to edit, move, resize or remove it. A page widget can also be selected from the page layout. Widget edits participate in **Undo** and **Redo**. Select **Save profile** to apply them on the deck. Create several instances of the same type to show different readings or to use different sizes.

## Included widgets

| Widget | Settings and requirements |
| --- | --- |
| **Now Playing** | Compact or expanded. Shows the default track reported by Windows with previous, play or pause, and next controls as available. The card uses more space for cover art in expanded mode. The persistent bar shows a compact strip. Open **Dashboard** for the full timeline. |
| **System metric** | CPU or GPU load, RAM usage, CPU or GPU temperature, or an individual device reading from LibreHardwareMonitor. Search for a sensor in the widget editor to bind its reading. Choose a stat, gauge for percentages or temperatures, or a short history graph. |
| **Audio fader** | Speakers or the default communications microphone. Set a horizontal or vertical layout and a reset percentage. The fader shows its level and updates Windows as you move it. **Reset** applies the saved percentage. |
| **Audio encoder** | Adjust the speakers or default communications microphone with relative steps. Set the normal step and reset level. **Fine** switches to a one-percentage-point step. |
| **Virtual dial** | Rotate from the inner ring for one-point steps or the outer ring for the configured fast step. Tap the dial to reset. |
| **Timers** | Lists countdowns and stopwatches with pause, resume, and remove controls. Starts a quick countdown of 1 to 180 minutes or a stopwatch. [Timers](timers.md) |
| **Quick decision** | Flip a coin, roll a six-sided die, or pick one option from a list. The built-in card lives in **Deck Keys → Tools**. Set its pick list in **Tools settings** in the desktop editor. Each list accepts two to eight distinct options, one per line. |

The editor preview starts with sample data. Turn on **Live readings** to use the deck's existing audio, telemetry, and cached media readings, or choose **Active Deck Keys** to inspect the current layout. Use **Edit draft layout** to move tiles and resize them from the bottom-right corner. You can also focus a move or resize control and use the arrow keys. Draft layout edits use the editor's Undo, Redo, and Save. The preview's deck controls are read-only.

Visible Now Playing cards and **Dashboard** share the Windows default player feed. Telemetry cards share the existing deck readings. Media and hardware readings can show availability or stale state as their source changes.

Choose **Composition** in the widget library to arrange text, icons, gauges, and graphs in a single tile. Give the composition a name, set its inner grid, and choose a position and size for each part. The builder shows a sample and reports selected readings that the PC does not currently provide. Use **Save as preset** to reuse the composition and tile size from **Saved compositions** in the same profile. Each placement has its own settings. Open **Live preview** to check the placed tile at either display orientation.

Open **Apps → Notes and checklists** for a compact reading view. Choose **Edit notes** or **Edit checklists** to add, update, or remove entries and mark tasks done. Tap a text field for the touch keyboard. **Save changes** writes the entries to the local Lastra data folder in `notes.json`. **Cancel edits** reloads the saved entries.

## Runtime and web embeds

Media and telemetry cards subscribe when they are visible and release their subscriptions when the last visible card leaves. Lastra keeps each web embed in a memory-only session, clears its site data between opens, and closes it when the deck hides, minimizes, or the embed stays idle for five minutes. Media playback keeps a visible embed open.

Each embed can make up to 240 HTTPS or secure WebSocket requests per minute. **Resources** shows the active usage, blocked requests, and the last embed's totals after it closes. The app's process totals include the embed renderer.

## Profile JSON

Place a `widgets` array on a page or under the root `bar` object. Put global keys in `bar.keys`, using the same array format as page keys. Use a `null` for a free slot. The same widget format is used for app view configuration where supported. Use zero-based `column` and `row` values and positive cell counts for `cols` and `rows`. IDs must be unique within a layout. Each layout accepts up to twelve widgets or as many as fit in its grid.

```json
{
  "id": "gpu-load",
  "type": "system-metric",
  "settings": { "metric": "gpu", "shape": "graph" },
  "layout": { "column": 2, "row": 1, "cols": 2, "rows": 1 }
}
```

Set `type` to `now-playing` and use an `appearance` of `compact` or `expanded` for a media widget. For `system-metric`, valid metrics are `cpu`, `ram`, `gpu`, `cpuTemp`, and `gpuTemp`. Valid shapes are `stat`, `gauge`, and `graph`. Missing settings use the catalog defaults. If you omit layout in a page or bar, Lastra looks for the first opening that fits the widget’s default size.

For `decision`, set `settings.options` to an array of two to eight distinct strings of up to 32 characters each.

The System metric widget saves an individual device reading under `settings.sensorId`. Widgets use the existing LibreHardwareMonitor feed and show **Unavailable** if the selected sensor is missing. In the editor's deck preview, enable **Live readings** to view a bound device sensor.

For `audio-fader`, set `device` to `output` or `microphone`, `orientation` to `horizontal` or `vertical`, and `defaultLevel` to an integer from 0 to 100. The default reset level is 50.

For `audio-encoder`, set the same `device` and `defaultLevel`, and set `step` to an integer from 2 to 20. Lastra constrains both controls to 0–100%. Faders show the requested level while dragging and the latest Windows reading as soon as the gesture ends. Lastra limits writes while you drag. Cancelled gestures discard unsent changes. Switching or disconnecting the audio device cancels the pending gesture.

Set **Control mode → Quick selector** on an Audio fader or Audio encoder to share the widget with other connected controls. The selector offers the configured Windows endpoint, the current seekable Windows media track, OBS source volume, and panel brightness when those controls are available. Each widget starts with its configured Windows audio endpoint.

**Brightness** appears after Lastra reads the XENEON EDGE over DDC/CI. The fader and virtual dial apply on release, and the encoder applies each step against the verified display reading. If the display or its brightness changes during the adjustment, check the refreshed value before trying again. [Hardware backlight](idle-screen.md#hardware-backlight)

Media scrub shows the current position, sends a seek when you release the fader, and checks the result against the same session and track. The encoder steps through the seek range and **Start** returns to its beginning. OBS volume shows the current scene and source and uses the same provider confirmation as the OBS panel. Switching modes discards queued changes, and unavailable selections require a fresh reading before they can accept input again. Zoom and monitor brightness remain pending verified providers.

The **Virtual dial** starts on its configured audio device and also supports the Quick selector. The ring where you first touch the dial sets the step for that gesture. Tap to reset the selected level or return to the start of the media seek range. Arrow keys move one point, Page Up and Page Down use the fast step, and Enter or Space performs the tap action. Canceling a turn discards changes that are still queued.

For a preview profile with a horizontal speaker fader and a vertical microphone fader on its first page, pass `--verify-audio-faders` to exercise both drags and the reset controls with sample endpoints.
