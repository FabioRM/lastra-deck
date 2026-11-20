# Linked controls

Link a key when the same action belongs on a deck page and the persistent bar. Each placement has its own label, icon, readout, and size. Editing the shared action, gestures, confirmation, or queue policy affects every placement.

1. Select a key in the profile editor and choose **Create linked control**. Give the control a name that identifies it in the picker.
2. Select another slot on a page or in **Persistent bar**. Choose the control under **Place shared control**. A populated slot can use the same binding through **Use shared actions**.
3. Set the presentation for each placement, then save the profile. **Make independent** gives a placement its own copy of the current actions. Duplicating a key or a page within the editor keeps the link. Clipboard copies carry independent actions so they also work in another profile.

Linked keys share one running state and one queue. **Queue one press** lets either placement queue one follow-up while the binding is busy. A page or target change still cancels queued presses. Each placement continues showing provider-confirmed state after a command finishes or when the state changes outside Lastra.

## OBS and Windows audio

For OBS, choose **Select OBS scene**, enter the scene name exactly as it appears in OBS, and choose a bus. **Program** is available with Studio Mode off. **Preview** is available with Studio Mode on. The key shows when its scene is on the selected bus, and stays unavailable if the connection, scene, or bus is unavailable. The active state comes from OBS after confirmation. [OBS setup](obs.md)

Use an audio action to share speaker or microphone mute. Both placements reflect changes made in Windows, including mixed mute for a microphone group. Linked audio controls wait for a fresh reading after the endpoint data expires.
