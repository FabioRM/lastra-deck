# OBS production modes

Open **Lastra → Settings → OBS production → Configure modes** to set up **Setup**, **Live** and **Break**. For each mode, choose a scene and its Preview or Program destination, then choose whether to leave, start or stop recording and streaming. A new mode leaves the scene and outputs as they are until you configure it. The settings are saved locally in `production-modes.json`.

Tap a mode to review the exact steps and select **Apply**. Lastra checks OBS again before sending any command. A preview expires after 30 seconds and becomes invalid if the OBS session, relevant state, active deck view or mode configuration changes. Preview scenes require Studio Mode. A Program scene in Studio Mode uses the Preview bus and a separate transition when needed.

Requested stops run first, with streaming before recording. Lastra then verifies the scene or transition, followed by a requested recording start and streaming start. A state that already matches the request is shown as **Already matched**. An authorized request is sent once, and its outcome is checked against OBS before the next step.

The results show **Confirmed**, **Unverified** or **Not sent** for each step. If a request fails or OBS or deck state changes, Lastra skips the remaining steps and preserves the outcomes already observed. Confirmed output changes remain in OBS. View-only mode allows inspecting a preview and keeps configuration and Apply unavailable. [OBS WebSocket protocol](https://github.com/obsproject/obs-websocket/blob/master/docs/generated/protocol.md)
