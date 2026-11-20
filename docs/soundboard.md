# Soundboard

A key can play an audio clip from this PC on the Windows output you choose. Lastra plays up to eight clips at once.

Open **Deck Keys → Tools → Soundboard** to play available sound keys on the current page or the persistent bar and stop all playback. Keys with a confirmation still run from their original placement.

## Play a clip from a key

In the editor, choose **Play sound** as a key's action and set these fields.

| Field | Setting |
| --- | --- |
| **Audio file** | The full path of a file on this PC. Select **Choose audio file** to browse. Lastra plays `wav`, `mp3`, `ogg`, `oga`, `opus`, `flac`, `m4a`, `aac`, `weba`, and `webm` files up to 32 MB. A path can start with a Windows folder variable such as `%USERPROFILE%`. Network paths are not played. |
| **Volume (%)** | The clip's own level from 0 to 100. The Windows volume of the output still applies. |
| **When pressed while playing** | **Restart the clip**, **Play another copy over it**, or **Stop the clip**. |
| **Play on** | **Default Windows output**, or one output by name. Choose a virtual cable here to send a clip to a stream or a call. |

The key reads **Ready** or **Playing** with the time left, for example **Playing · 0:04 left**. Set the key's **Key value** to **Off** to show the state only. If the chosen output is disconnected, the key reports it and plays nothing.

Set **Command** to **Stop every clip** on another key to silence the soundboard with one press. Lastra also stops every clip when Windows locks or the PC goes to sleep.

## JSON format

Set `type` to `sound`, give the clip a stable `id`, and set `file`. The optional fields are `volume` from 0 to 100, `again` set to `restart`, `overlap`, or `stop`, and `output` set to the name of a Windows output.

```json
{ "id": "applause", "label": "Applause", "icon": "volume-2", "action": { "type": "sound", "id": "applause", "file": "%USERPROFILE%\\Music\\applause.mp3", "volume": 80, "again": "overlap" } }
```

A stop key uses `{ "type": "sound", "command": "stop-all" }`.

An exported profile lists the file name of each clip among its dependencies and does not include the audio. Copy the files to the same paths on the other PC.
