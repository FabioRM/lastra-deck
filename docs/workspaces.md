# Workspaces

Open **Apps → Workspaces → Edit workspaces** to create or edit `%APPDATA%\Lastra\workspaces.json`. After saving, the app view lists each workspace and the connected display IDs. Select **Open workspace** to run it, or add a **Restore workspace** action in the profile editor and enter that workspace's ID.

```json
{
  "version": 1,
  "workspaces": [
    {
      "id": "work",
      "name": "Work",
      "apps": [
        {
          "target": "%LOCALAPPDATA%\\Programs\\Microsoft VS Code\\Code.exe",
          "placement": { "display": "primary", "x": 0, "y": 0, "width": 0.55, "height": 1 }
        }
      ]
    },
    {
      "id": "studio",
      "name": "Studio",
      "powerToysShortcut": "%USERPROFILE%\\Desktop\\Studio.lnk"
    }
  ]
}
```

For each app, give its full executable path and an optional `args` array. Set `display` to `"primary"` or the numerical display ID shown in Workspaces. Coordinates and dimensions are fractions of that display's work area. Omit `placement` to show the app without changing its bounds.

Lastra reuses a single matching window or starts the app and waits for its window to appear. The app view reports individual results, including when several windows match the same executable, a display is missing, or Windows cannot confirm the saved bounds.

To reuse a layout captured in PowerToys, open the PowerToys Workspaces editor and create a desktop shortcut for the layout. Save the path to that shortcut as `powerToysShortcut`. PowerToys handles the launch and arrangement for those entries. [PowerToys Workspaces](https://learn.microsoft.com/en-us/windows/powertoys/workspaces)
