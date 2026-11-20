# App views

Tap **Apps** in the deck navigation. The catalog lists available views by name and category, with pinned views first. Type in the search field or use **Touch keyboard**. Tap a result to see its commands and the setup required for live data.

Use **Lastra → Settings → Display → Deck organization → Pinned app views** to keep a view at the top of the catalog. Lastra remembers pins and the last view you opened. **Catalog** returns to the list and **Deck keys** returns to your macro grid. The mixer and telemetry stay visible while you use an app view. OBS and Media keep their own dedicated screens.

**Follow foreground** is optional. Lastra opens views when the foreground executable matches, except while the contextual pages are locked or another dedicated screen is open. Automatic switching leaves shared browser and terminal processes to the existing contextual pages unless you configure an explicit match.

Settings are stored in `%APPDATA%\Lastra\app-views.json`.

**Claude and Claude Code** can open Claude Desktop and saved chats, and show opted-in Claude Code activity. [Claude settings and hooks](claude-code.md)

## Action history

Open **Apps** and select **Action history** to review the last 100 completed command attempts for this Lastra session. Each entry shows the display label, local time, and result. Deck entries include the page and gesture. App entries include the view name for registered commands and explicit window switches.

Expand **Step results** on a deck entry to see command types, outcomes, skipped branches, and retry counts. The history keeps the first 100 steps per command. Use **Test key** in the profile editor for a complete simulation trace. [Key testing](macros.md)

The list stays in memory and clears when Lastra exits. It omits cancelled or ignored presses, automatic reads, and provider controls. Action arguments, shortcut definitions, URLs, typed text, window titles, and error details are excluded. Labels that resemble a URL, file path, shortcut, or credential are replaced with a generic label.

## Windows Subsystem for Linux

Search for **WSL** in **Apps**. The view shows installed distributions, the Windows default, their WSL version, and running state. While this view is visible, passive updates use the bounded list commands `wsl.exe --list --verbose` and `wsl.exe --list --running --quiet`.

Select a distribution to open its shell in **Windows Terminal** or connect **VS Code** using the WSL extension. These actions can start a stopped distribution. **Stop…** is available for running distributions, and Lastra asks for confirmation before sending the stop command.

Choose **Read metrics** on a running distribution to take one snapshot of Linux load average and available memory. WSL 2 can report values shared by its Linux VM. Lastra checks that the selected distribution is still running immediately before the read. If the distribution exits between that check and the read, WSL can start it again. Passive updates never enter a distribution.

[Microsoft WSL commands](https://learn.microsoft.com/windows/wsl/basic-commands) · [VS Code WSL setup](https://code.visualstudio.com/docs/remote/wsl)

## Custom app views

Tap **Edit custom views** in **Apps** to create and open `%APPDATA%\Lastra\app-views.custom.json` in a text editor. Add your views to the `views` list and save. Lastra reloads the file when saved and reports invalid changes in the catalog. The last valid views stay available while you fix the file.

```json
{
  "version": 1,
  "views": [
    {
      "id": "mdn",
      "name": "MDN Web Docs",
      "category": "Development",
      "icon": "book-open",
      "match": {
        "executable": "chrome.exe",
        "titleContains": "MDN"
      },
      "url": "https://developer.mozilla.org/",
      "shortcuts": [
        { "id": "find", "label": "Find in page", "keys": "Ctrl+F" }
      ],
      "widgets": [
        { "id": "cpu", "type": "system-metric", "settings": { "metric": "cpu" } }
      ]
    }
  ]
}
```

- Use a unique lowercase `id`, a `name`, and a `match` for each view. You can add a `category`, `summary`, and a Lucide `icon`.
- Set `match.executable` to the Windows process name or full executable path. Full paths accept Windows environment variables such as `%ProgramFiles%`. Use `match.appId` for a Windows AppUserModelID. Run `Get-StartApps` in PowerShell to list registered apps and their IDs. If a rule includes both fields, both must match.
- Use `titleContains` with a browser executable or PWA app ID to match the visible window title. Title matching is case-insensitive and uses literal text. Choose a distinctive title fragment. The optional HTTP or HTTPS `url` sets the **Open app** destination. Views without a URL can open the matched executable or Windows app when the rule has no title requirement.
- **Matching windows** shows each open window's title and Windows app icon. If Windows supplies no icon, Lastra uses the executable icon or the configured view icon. Tap a window to restore and switch to that exact window.
- The Windows list shows matching open windows. Tap one to bring it forward. Windows can restrict foreground switching. Lastra checks the current window again before sending a shortcut.
- Choose `now-playing` and `system-metric` widgets. Omit `layout` to place a widget automatically, or set the zero-based `column` and `row` with `cols` and `rows` for spans. App views have a 4×4 widget grid. The same widget settings are available in the profile editor.

## Docker and Compose

Open **Apps → Docker** while your local Docker engine is running. Lastra uses the active context reported by the Docker CLI. It supports Docker Desktop named pipes on Windows and local Unix sockets. Switch to a local context in Docker before using this view.

Choose a Compose project, standalone containers, or the full container list. Select a container to see its health, restarts, and published local TCP ports. Running containers can also show CPU and memory usage, cumulative received and transmitted network bytes, and cumulative block I/O. CPU can take a second sample to appear. Some readings depend on the engine and container platform. Lastra samples only the selected running container while the view is visible.

**View logs** reads up to 100 recent stdout and stderr lines. Output is limited to 96 KiB and stays in the open view. The port buttons open HTTP addresses on the loopback interface. Use the appropriate client for other protocols.

Container controls start disabled. Select **Enable controls** to allow actions in the current Docker context for this Lastra session. Start, stop, and restart require a second tap on a confirmation that names the container and context. Lastra checks the context and container again before sending the action.

[Docker contexts](https://docs.docker.com/engine/manage-resources/contexts/) · [Docker stats](https://docs.docker.com/reference/cli/docker/container/stats/)

## Spotify

Open **Apps → Spotify** for artwork, the current track, and the playback controls available from Spotify desktop through Windows. The Spotify widget is also available in the profile editor for deck pages and the widget bar. **Dashboard** shows the Spotify Web Player when Windows reports it as the current media session.

Select **Edit playlists** to open the local Spotify playlists file at `%APPDATA%\Lastra\spotify.json`. Add your playlists, save the file, and select **Reload playlists**. Tap the playlist name to open its official Spotify embed. Select **Browser** to open its Spotify page directly. The file accepts Spotify playlist URLs and URIs.

```json
{
  "version": 1,
  "playlists": [
    {
      "id": "top-hits",
      "name": "Today's Top Hits",
      "url": "https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M"
    }
  ]
}
```

Each entry needs a unique lowercase ID and a display name. Lastra keeps the last valid list available if a save contains an error.

[Spotify Web Player](https://open.spotify.com/) · [Windows media sessions](https://learn.microsoft.com/windows/uwp/api/windows.media.control.globalsystemmediatransportcontrolssession)

### Spotify Connect

The optional Spotify Connect panel shows account playback, available devices, and the queue. Select an eligible device to move playback without starting it if paused. **Add current item to queue** is available when Spotify reports a queue, an active eligible device, and a supported track or episode. The panel shows when Spotify restricts playback data or a command. The Windows widget and local playlist links are available without a Spotify Connect setup.

1. Create or select your app in the Spotify Developer Dashboard. Enable Web API and register `http://127.0.0.1:43821/spotify/callback` as a redirect URI. Development Mode has plan and allowlist requirements.
2. Select **Edit connection** in Lastra, enter the app’s client ID in `spotify-account.json`, and save. The file uses `"version": 1` and `"clientId": "your Spotify client ID"`.
3. Select **Reload connection**, then **Connect Spotify**. Complete authorization in your browser and return to Lastra. The authorization uses PKCE. Lastra needs only the client ID.
4. Select **Disconnect Spotify** to end the Lastra session and remove the saved connection. Manage Spotify’s authorization for the app from your Spotify account if you also want to revoke access there.

The browser returns to a temporary listener on `127.0.0.1`. On Windows, Lastra stores the refresh token using Windows data protection for the current Windows user. Access tokens stay in memory. When Windows data protection is unavailable, the connection lasts until Lastra closes. Live account reads run while the Spotify view is visible.

[Spotify Developer Dashboard](https://developer.spotify.com/dashboard) · [Development Mode requirements](https://developer.spotify.com/documentation/web-api/concepts/quota-modes) · [PKCE authorization](https://developer.spotify.com/documentation/web-api/tutorials/code-pkce-flow) · [Playback state](https://developer.spotify.com/documentation/web-api/reference/get-information-about-the-users-current-playback) · [Spotify queue](https://developer.spotify.com/documentation/web-api/reference/get-queue)

## Windows Terminal and shells

Open **Apps → Windows Terminal**. The default buttons open Windows PowerShell or Command Prompt in your home directory. Use **Edit shells and commands** to configure additional Windows Terminal profiles and pin commands. Save and select **Reload**.

The configuration is stored at `%APPDATA%\Lastra\terminal.json`. Use the profile name shown in Windows Terminal settings, or its profile GUID. A project directory can be an absolute Windows path, an environment variable that resolves to one, or a WSL share such as `\\wsl.localhost\Ubuntu\home\dev\project`. Opening a WSL profile can start its distribution.

```json
{
  "version": 1,
  "profiles": [
    {
      "id": "project-powershell",
      "name": "Project PowerShell",
      "profile": "PowerShell",
      "directory": "D:\\Projects\\Example"
    }
  ],
  "commands": [
    {
      "id": "test",
      "name": "Run Node tests",
      "program": "node.exe",
      "args": ["--test"],
      "directory": "D:\\Projects\\Example",
      "captureOutput": true,
      "timeoutMs": 30000
    },
    {
      "id": "dev-server",
      "name": "Development server",
      "program": "node.exe",
      "args": ["server.js"],
      "directory": "D:\\Projects\\Example",
      "kind": "server",
      "captureOutput": true
    }
  ]
}
```

Pinned commands run in the background with their saved executable, arguments, and project directory. The deck shows elapsed time while a command runs, then its outcome. The default time limit is 30 seconds for tasks and one hour for entries with `"kind": "server"`. Set `timeoutMs` from 1 second through 15 minutes for tasks or through 8 hours for servers. Use an interactive profile for programs that need terminal input.

**Stop** requests termination of the process Lastra started and reports when that child exits. Programs that launch other processes may leave those descendants running. Open that project's terminal to manage them. An interrupted result can also mean Lastra quit during the run.

Set `captureOutput` to `true` for commands whose output you want to keep. **Open log** opens the captured stdout and stderr in the Windows text editor. During execution the file shows output captured when you tapped. Lastra retains the latest log of each unchanged command, with a maximum of 256 KiB per log and 64 completed results. Logs are local plaintext in `terminal-logs` under the Lastra user data folder. Enable capture only for commands whose output can be kept there.

[Windows Terminal launch arguments](https://learn.microsoft.com/windows/terminal/command-line-arguments)

## Netflix companion

Use **Apps → Netflix** or add **Netflix companion** through the widget editor to open Netflix and your saved titles. Netflix playback stays in the Windows app or your browser. The browser is available for every saved title. On Windows, the separate app button opens the registered Netflix Store app when it is installed.

The companion reads artwork and available playback controls only when Windows identifies a matching Netflix session. **Dashboard** shows the current Windows media session, which can come from a browser. Netflix's **Space** and **Esc** shortcuts are available while Lastra identifies the Netflix Windows app in the foreground. Lastra checks that window again before sending a key.

Select **Edit titles** to save title links in %APPDATA%\Lastra\netflix.json. The file uses version 1 and a `titles` array. Each row has an `id`, `name`, and an official `https://www.netflix.com/title/…` or `https://www.netflix.com/watch/…` URL. Select **Reload** after saving.

[Netflix on Windows](https://help.netflix.com/en/node/23931) · [Netflix keyboard shortcuts](https://help.netflix.com/en/node/24855)

## Streaming watchlist

Open **Apps → Streaming watchlist** to save and launch titles across Netflix, Prime Video, Disney+, Apple TV, Hulu, Max, and YouTube. Lastra accepts official title or watch links for those services. The **Now Playing** card uses the current Windows media session and shows its source.

Use **Edit titles**, save, and select **Reload**. Your list stays in %APPDATA%\Lastra\streaming-watchlist.json.

```json
{
  "version": 1,
  "titles": [
    {
      "id": "my-series",
      "name": "My series",
      "url": "https://www.netflix.com/title/80057281",
      "browser": "edge"
    }
  ]
}
```

The optional browser is `default`, `edge`, `chrome`, `firefox`, `edge-app`, or `chrome-app`. The app modes open a separate browser window. Lastra uses your system link handler when the preferred browser is unavailable. Media plays in the provider's supported player.

[Windows media sessions](https://learn.microsoft.com/windows/uwp/api/windows.media.control.globalsystemmediatransportcontrolssession)
