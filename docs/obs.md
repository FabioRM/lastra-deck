# OBS control in Lastra

Lastra connects to the WebSocket server built into OBS Studio 28 and later. The deck's **OBS** panel shows the connection and the current recording and streaming state. Its tally follows actions started from OBS or another controller.

## Set up OBS

1. In OBS, open **Tools → WebSocket Server Settings**. Enable the server and check the port. The default is **4455**.
2. Create **%APPDATA%\Lastra\obs.json** next to your Lastra profile. Enter the port and the password you configured in OBS.

```json
{
  "port": 4455,
  "password": "your-obs-server-password"
}
```

3. Save the file and tap **OBS** on the deck. Lastra detects changes to `obs.json` and reads the current OBS state after connecting.

The OBS tab starts hidden on a new installation. Use **Lastra → Settings → OBS production → Show OBS controls on the deck** to enable or disable it. Existing valid OBS configurations without an explicit `enabled` field remain enabled.

Lastra connects to **127.0.0.1** through the configured port. On Windows, Lastra replaces **password** with **passwordProtected** the first time it reads the file, using Windows Data Protection for the current user. The protected copy only opens for the same user on the same PC. To change the password, type a new **password**; it replaces the protected copy. You can also set **LASTRA_OBS_PASSWORD** in the environment that starts Lastra and omit **password**. Set **enabled** to **false** to disable the connection. The main process reads the file and credentials.

## Deck controls

Add a **Select OBS scene** key to a deck page or persistent bar to recall a named scene and see its confirmed state. Linked placements share the same action and pending status. [Linked controls](linked-controls.md)

- When Studio Mode is off, tapping a scene takes it directly to program.
- In Studio Mode, tapping a scene changes preview. **Take to program** runs the configured OBS transition after confirmation.
- Starting or stopping a stream or recording asks for confirmation. During a recording, **Pause** and **Resume** follow the state OBS reports.
- Start the Replay Buffer in OBS. **Save replay** is available while the buffer is active. The deck shows the clip filename after OBS reports the save and Lastra verifies a new, non-empty file in the local OBS recording folder.
- Choose **Scene preview** to see the current program scene, or the preview scene in Studio Mode, beside the scene and source lists. Lastra refreshes the thumbnail once a second while the OBS panel is visible. Tap the toggle again to see source controls.
- The deck keeps a command pending until OBS reports the requested state. If OBS accepts a request but the state does not settle within five seconds, the deck reports that confirmation timed out.
- Sources come from the preview scene when available, or the program scene otherwise. The list also includes global audio inputs such as **Mic/Aux**. Toggle visibility for scene sources. For supported sources, the deck can toggle mute, change volume, and turn filters on or off.
- After a network interruption or OBS restart, Lastra reconnects and refreshes its view. If OBS rejects the password, correct `obs.json`. If OBS explicitly ended the session, choose **Retry connection** when ready.

[OBS WebSocket protocol](https://github.com/obsproject/obs-websocket/blob/master/docs/generated/protocol.md)

## Production timers

Open **OBS → Timers** on the deck. Start or reset the local countdown, or start a rundown and advance each segment. A `+` time and **overrun** indicate that a countdown or segment exceeded its planned duration. The rundown shows the current and next segments, elapsed times for completed segments, and their planned durations.

In **Lastra → Settings → OBS production → Edit timer settings**, set the countdown and add or reorder up to 24 named segments. Saving persists the settings on this PC. New settings apply the next time you start those timers. Lastra starts with both timers idle and keeps their running state in memory when you move between views. The local timers also work while OBS is disconnected.

Live and recording durations use OBS output status. Lastra refreshes the current duration while the timers view is visible and shows when a recording is paused, a stream is reconnecting, or a reading is stale. Opening Timers, editing settings and running the countdown or rundown leave OBS output controls untouched.
