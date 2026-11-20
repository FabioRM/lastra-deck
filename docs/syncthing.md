# Syncthing on the deck

Open **Apps → Syncthing → Edit connection**. Enter the local Syncthing web interface URL, the API key from its GUI settings, and the folder IDs you want on the deck. The configuration lives in Lastra’s local `syncthing.json`.

```json
{
  "version": 1,
  "url": "http://127.0.0.1:8384/",
  "apiKey": "YOUR_LOCAL_KEY",
  "folders": [
    { "id": "photos", "label": "Photos" },
    { "id": "notes", "label": "Notes" }
  ]
}
```

Use up to eight folders. To name or filter peers, add a `devices` list of up to sixteen `{ "id": "FULL-DEVICE-ID", "label": "Laptop" }` entries. Without that list, the deck shows abbreviated device IDs from the connection report. The folder percentage follows local sync progress, and the remaining item count comes from Syncthing.

Lastra reads the configured local Syncthing API while this app view is visible. **Open Syncthing** opens the configured local web interface. The API key stays in the main process and the local file. On Windows, Lastra replaces `apiKey` with `apiKeyProtected` the first time it reads the file, using Windows Data Protection for the current user. To change the key, type a new `apiKey`; it replaces the protected copy. The status view uses read-only requests. [Folder status](https://docs.syncthing.net/rest/db-status-get.html) · [Device connections](https://docs.syncthing.net/rest/system-connections-get.html)
