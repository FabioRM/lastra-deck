# Web embeds

Open **Apps → Web embeds** and select **Edit web embeds**. Add approved HTTPS pages to `web-embeds.json`, then save the file. A Spotify link opens the official Spotify Embed route.

```json
{
  "version": 1,
  "embeds": [
    { "id": "dashboard", "name": "Dashboard", "kind": "web", "url": "https://example.com/dashboard" },
    { "id": "playlist", "name": "Spotify playlist", "kind": "spotify", "url": "https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M" }
  ]
}
```

**Open embed** uses a window on the deck with its own temporary browser session. Lastra restricts navigation to the configured HTTPS origin, blocks pop-ups, permissions and downloads, and closes the remote renderer with the window. The remote page has no access to Lastra's controls or data. Pages that disallow embedding show the browser fallback.

Use **Open in browser** for sign-in, unsupported playback, or links that leave the approved origin. Spotify controls and playback depend on the provider and account. [Spotify Embeds](https://developer.spotify.com/documentation/embeds)
