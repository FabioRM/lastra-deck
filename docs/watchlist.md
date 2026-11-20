# Monitoring watchlist

Open **Apps → Monitoring watchlist**. CPU, RAM, and GPU are pinned by default. Choose **Lastra → Settings → Stats → Watchlist readings** to add or remove readings. Up to six can appear on the overview. Pins are saved locally in `watchlist.json`.

- **Hardware** includes CPU and GPU load, RAM, and any available CPU or GPU temperature. Tap a reading to see its history chart and source. Slower hardware refresh and stale readings use the same settings as the deck telemetry.
- **App** includes Lastra's CPU and working set and the number of running Docker containers. Tap a tile for its full app view. Docker uses the existing engine view and may show a lower bound if the engine lists more containers than Lastra displays.
- **Service health** includes each configured check's current status and available latency. Tap it for the check history and details. If a check is removed, its pin can still be removed from the overview editor.

Hardware tiles use the existing telemetry feed. Process usage and Docker summaries are read while the overview is visible and their tiles are pinned. Your Lastra resource refresh setting still applies. Service tiles use the existing checks and do not add new network requests.
