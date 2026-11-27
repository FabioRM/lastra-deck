# Lastra

Lastra turns the **CORSAIR XENEON EDGE** into a touchscreen macro deck for Windows 10 and 11. It follows the foreground app, runs shortcuts and macros, and puts the Windows mixer, media controls, and system telemetry within reach. It runs on Electron and works while iCUE is closed.

The Deck and automatic shortcut profiles also have an experimental Linux mode for X11, GNOME, KDE Plasma, and Hyprland. Linux x86-64 builds ship as a `.deb` and AppImage. [Linux setup](docs/linux-deck.md)

![Deck Keys toolbar with Tools, Emoji, Deck pet, and page lock icons](docs/preview-toolbar.png)

![Landscape Deck Keys with the icon toolbar aligned to the key grid](docs/preview-states.png)

## Shortcuts for the active app

![Deck Keys switches from Claude Desktop to Codex, Chrome, File Explorer, and Photoshop, then loops back to Claude Desktop.](docs/preview-app-focus.gif)

[Project website](https://fabiorm.github.io/lastra-deck/) · [Getting started](#getting-started) · [Deck pet](#deck-pet) · [Tools and Pomodoro](#tools-and-pomodoro) · [Deck views](#deck-views) · [Profile editor](#profile-editor) · [Local MCP integration](#local-mcp-integration) · [License](#license)

<details>
<summary>Animated demo and more deck previews</summary>

![Lastra demo showing the Emoji grid, Dashboard, Stats, and Feeds](docs/preview-demo.gif)

The loop opens **Emoji** from **Home**, then shows **Dashboard**, **Stats**, and **Feeds** full screen. Media, telemetry, and Feeds use sample data.

![Chrome shortcut pages with a custom Navigation page on Deck Keys](docs/preview-shortcuts.png)

[Watch the deck switch between custom shortcut pages](docs/preview-shortcuts.gif).

![Deck Keys changes through ten combinations of theme and quick look](docs/preview-themes.gif)

The deck comes with 14 themes and five quick looks. [Deck look](docs/deck-look.md)

<a href="docs/preview-portrait.png"><img src="docs/preview-portrait.png" alt="Deck Keys in portrait with the mixer above the macro grid" width="225"></a>

</details>

## Getting started

Download Lastra 1.3.0 for your system. [Windows x64 installer](https://github.com/FabioRM/lastra-deck/releases/download/v1.3.0/Lastra-Setup-1.3.0.exe) · [Linux .deb](https://github.com/FabioRM/lastra-deck/releases/download/v1.3.0/Lastra-1.3.0-linux-amd64.deb) · [Linux AppImage](https://github.com/FabioRM/lastra-deck/releases/download/v1.3.0/Lastra-1.3.0-linux-x86_64.AppImage) · [Checksums and reviewed source](https://github.com/FabioRM/lastra-deck/releases/tag/v1.3.0)

Set the XENEON EDGE to **Extend these displays** in Windows Display settings. The panel runs at 2560 × 720 in landscape and 720 × 2560 in portrait.

**Install the app.** Run `Lastra-Setup-1.3.0.exe` on Windows x64. It installs for the current user in `%LOCALAPPDATA%\Programs\Lastra` and adds Start menu and desktop shortcuts. The Windows installer is unsigned. Settings and profiles live in `%APPDATA%\Lastra` and survive updates and uninstalls. [Linux setup](docs/linux-deck.md) · [Windows update behavior](docs/releasing.md#update-behavior)

**Run from source.** Install **Node.js 22.12.0 or later**, as required by the Electron installer, then run these commands from the project directory. Source runs never check for updates. To build the installer yourself, see [Releasing](docs/releasing.md).

```powershell
npm ci
npm start
```

Lastra looks for the XENEON EDGE among the displays detected by Windows. The deck opens in a borderless, always-on-top window with activation disabled. If the Edge is absent at startup or disconnected during use, Lastra closes along with any hardware monitoring it started. In **Settings → Display → Deck display**, choose a monitor to remember it across restarts. `npm start -- --display=<id>` overrides the choice at startup. `npm run dev` opens a diagnostics window even when the Edge is absent.

Click the Lastra icon in the Windows notification area to open desktop Settings. Press **Ctrl+F** there to search for an option by name and jump to its section. In **Settings → General** you can set the interface language, export your configuration, and enable **Start with Windows**. If the Edge is disconnected when you sign in, Lastra exits. Connect it and start Lastra manually.

When Windows changes the display layout, rotates the screen, or wakes from sleep, Lastra rechecks the display after a short delay and puts the deck back without taking focus. A brief interruption while Windows detects the Edge can recover in the same window. If Lastra has already exited after a disconnect, reconnect the Edge and start Lastra again.

Lastra opens **Dashboard** on first launch. The switch in the top-right corner cycles through **Deck Keys → Dashboard → Stats → Feeds**. Dashboard, Stats, and Feeds keep the clock and date in the top-left corner. Deck Keys leaves that corner to the page title. Later launches restore the last manually opened view, selected deck page, and page lock.

The **Speakers** and **Windows microphones** icons stay next to the view switch on **Dashboard** and **Deck keys**. Use them to mute the default Windows output or mute and restore the Windows inputs as a group. They reflect changes made in Windows.

### Mapping touch to the XENEON EDGE

In **Lastra → Settings → System → Diagnostics**, **Touch diagnostics** shows which monitor receives touch events, with physical coordinates and DPI. **Configure Windows touch** opens **Tablet PC Settings**. You can also open it through Control Panel or with `control.exe /name Microsoft.TabletPCSettings`.

1. Select **Setup**. If Windows asks for the input type, choose **Touch input**.
2. Press **Enter** to skip the other monitors.
3. When the white prompt appears on the XENEON EDGE, tap the display once with one finger. If setup continues on another monitor, press **Enter** to skip it.
4. Return to Lastra and try changing pages with a touch. The layout also adapts when you rotate the display to portrait.

Use **Export diagnostics…** under **Settings → System → Diagnostics** to save a JSON report for troubleshooting. It includes display geometry and touch mapping, audio mute and volume status, sensor availability, and integration status. Service health appears as totals. The report omits device names and IDs, file paths, URLs, credentials, media titles, and profile contents. Export reads the current state without starting providers or sending the report anywhere.

## Deck pet

From **Deck Keys**, tap the paw immediately before the page lock. The pet's 3D habitat opens in the shortcut area. Tap the paw again to return to your keys.

Tap your pet to cuddle or wake it, tap the ground to move it, and tap one of the three interactive objects in each habitat to explore it. Tap the sun, moon, or planet to draw its attention upward. Pets roam the wider islands and choose activities based on hunger, happiness, playfulness, sleepiness, and hygiene. Touches and care buttons cycle through different reactions.

Under **Settings → Deck pet**, choose an animal, a habitat, a name, and whether the scene animates. The eight pets include K-9 the robot dog and Bip the companion drone. Habitats include Lantern Grove, Aurora Peak, Neon Alley, and the Cybergreenhouse. Progress stays on your computer and time spent napping counts while Lastra is closed.

Deck pet is included in Lastra 1.3.0 for Windows and Linux. [Watch the deck pet demo](https://fabiorm.github.io/lastra-deck/#deck-pet)

![K-9 in the neon alley habitat with five care indicators](docs/preview-pet-neon.webp)

## Tools and Pomodoro

Tap the wrench icon in **Deck Keys** to open **Tools** full screen. The gears open dialogs for a custom countdown, the Pomodoro durations, and the Quick decision pick list. Tap the red **×** in the mode switch position to return to Deck Keys.

![Tools in landscape with touch controls and a red close button](docs/preview-tools.png)

Start a **Pomodoro break** from Tools or Dashboard to fill the XENEON EDGE with the countdown. Tap the red **×** to return to the previous view while the break continues. The full-screen view closes when the countdown reaches zero. [Pomodoro guide](docs/pomodoro.md)

![Pomodoro break countdown filling the XENEON EDGE with a red close button in the top-right corner](docs/preview-pomodoro-break.png)

<details>
<summary>Watch a Pomodoro break start and close</summary>

![Animation opening Tools, starting a full-screen break, and returning to Tools while the break continues](docs/preview-tools.gif)

</details>

## Deck views

- **Deck Keys** combines configurable app shortcut pages, a persistent widget bar, and Windows audio controls. The navigation row has large Tools, Emoji, Deck pet, and Lock buttons. The default **Home** fits 15 shortcuts and five editing keys on one screen in either orientation. [Shortcut packs](docs/shortcut-packs.md) · [Macros](docs/macros.md) · [Widgets](docs/widgets.md)
- **Tools** also opens **Apps** from Deck Keys. [Tools and Pomodoro](#tools-and-pomodoro)
- **Dashboard** shows a clock, calendar, Pomodoro timer, and Now Playing for the default Windows media session. Use **Previous**, **Play or Pause**, and **Next**, or drag the progress bar to seek when supported. [Now Playing](docs/now-playing.md) · [Pomodoro](docs/pomodoro.md)
- **Feeds** shows the weather for a saved place, stock quotes, and currency rates. The sky follows local sunrise and sunset, and the card includes the moon phase plus today's low and high. Where reported, Feeds shows the market cap for each ticker and totals the displayed tickers by denomination. [Yahoo Finance market data](https://finance.yahoo.com/)
- **Stats** shows current readings and charts for the processor, graphics, memory, displays, app frame performance, storage, and cooling. Configure Overview card order and width, and place up to four readings on one graph with separate scales by unit. [Telemetry guide](docs/telemetry.md)
- **OBS** shows live recording and streaming status and provides controls for scenes and sources. [OBS setup](docs/obs.md)
- **Apps** offers searchable, pinnable views for Spotify, Docker and Compose, Kubernetes, GitHub Checks, WSL, Windows Terminal, and custom apps. **Action history** shows up to 100 completed command attempts from the current session. [App views](docs/app-views.md) · [Kubernetes](docs/kubernetes.md) · [GitHub Checks](docs/github-checks.md)
- **Emoji** puts frequently used emoji at the top of one vertically scrollable grid. Swipe up or down, use the mouse wheel, or search with the touch keyboard. Tap an emoji to insert it into the active text field. The Emoji button stays selected while the view is open. Tap it again, or press Escape, to return to Deck Keys. **OBS** works the same way with its button, and **Apps** with the Tools button it opens from.

![Lastra Stats overview with sample CPU, GPU, memory, display, frame rate, disk, and temperature readings](docs/preview-stats.png)

Under **Settings → Dashboard**, **Dashboard calendar** lets you choose what opens when you tap the calendar. Choose Google Calendar, Outlook.com Calendar, or Microsoft 365 Calendar to open it in your default browser. **Do nothing** is the default.

In **Apps**, open **Service health** to track the HTTP, TCP, DNS, and ping checks you configure. Use **Lastra resources** to see CPU and memory usage for Lastra and its managed helpers, or **Web embeds** to open approved HTTPS pages and official Spotify embeds. [Service health](docs/service-health.md) · [Resource monitoring](docs/resources.md) · [Web embeds](docs/web-embeds.md)

Open **Battery and power** in **Apps** to check Windows battery charge and runtime or add a local UPS status source. [Battery and power guide](docs/power.md)

Open **Monitoring watchlist** in **Apps** to keep selected hardware, app, and service readings together. [Monitoring watchlist guide](docs/watchlist.md)

## Pages and keys

- Swipe horizontally, scroll sideways on a trackpad, or turn the mouse wheel over Deck Keys to change pages. With more than one screen, the count beside the page name reads **1 / 2**. A swipe cancels the key where it started. **Home** returns to the first page. The default profile starts on **Home**. VS Code and each browser open their own automatic shortcut pack when they take focus.
- Deck opens a configured page for the foreground Windows app when one exists. Otherwise, it uses a matching built-in shortcut pack or a temporary **Auto** page with common shortcuts. Use a page's **Windows app IDs** for an exact Store app or installed web app match. Browser packs cover ordinary browser tabs. [Engineering shortcut packs](docs/engineering-shortcuts.md) · [All shortcut packs](docs/shortcut-packs.md)
- A page's **Context rules** can match a project or document within an assigned executable or Windows app ID. Lastra takes the highest **Rule priority**, then the most specific match. At equal priority, exact titles beat prefixes and partial titles, and Windows app IDs beat executable names for otherwise equal rules. Page order resolves a tie. Tap the page count or **Auto** to see why the page opened.
- Use **Home** from an **Auto** page to return to a configured page. A manual selection holds until the foreground app changes. **Lock page** keeps the displayed page until you unlock it. If an automatic page is locked when Lastra closes, the configured fallback opens locked next time.
- In Lastra Settings, open **Deck behavior → Navigation and input → After an app page** to choose **Home** or **Last manually selected page**. The deck uses this choice when the foreground stops matching an app page. It keeps the last manual page for each activity. The default is **Last manually selected page**.
- To see the desktop behind the deck, select **Reveal desktop** in Tools or in **Deck behavior**. **Restore deck** returns to the previous view, page, and lock setting. Display settings also offer an optional swipe up from the bottom edge of Deck Keys.
- Tap the current page name in Deck Keys to jump to a saved page. Set favorites in **Settings → Deck behavior → Deck organization**. Each activity keeps its own favorites and six most recently opened pages.
- In the editor, set a page’s **Folder path** to group its keys, for example `Work / Editing`. Deck Keys shows the current folder below the page name. **Pages** opens that folder and lets you tap a parent, **All pages**, or **Home**.
- Switch between **Main**, **Work**, **Meeting**, **Gaming**, and **Streaming** from Deck Keys or **Settings → Deck behavior → Activity profile**. Each stores its own pages, backups, and navigation. An open editor continues to save to the activity shown in its title.
- A contextual page binds to the foreground window that it represents. Switching windows cancels pending gestures and queued work for the previous deck revision. A locked contextual page stays visible and reads **Target inactive** until its window returns. Lastra rechecks the window before each keyboard step in a contextual macro.
- The **Apps** catalog opens separately. Its **Follow foreground** setting is optional.
- A circle marks a **long press** of 550 ms. A dash marks a **double tap**. For double-tap keys, Lastra waits up to 320 ms before running the single-tap action.
- A square marks a key that requires confirmation. **Lock PC** uses **Hold to confirm** on the default Home page. Browser packs also require confirmation to close a tab. Release early or move off the key to cancel a hold.
- A red X on a key opens the details of a failed action. In **Tools**, open a running macro to see its progress or stop it. **Action history** in Apps shows completed commands.

In the profile editor, expand **Profile settings** to change gesture timing or cancellation distance. Select **Apply gesture settings**, then save the profile to apply the changes to the deck.

Use a key's **Confirmation** setting for actions that need an extra check. **Hold to confirm** uses the profile's duration unless you override it on that key. **Ask before running** opens a dialog with **Run action** and **Cancel**. Escape also dismisses the dialog. If the page or foreground window changes, open the confirmation again before running the action.

Use **Wait for state**, **If / else**, and per-step failure handling to coordinate sequences with Windows or OBS. [Conditional macros](docs/macros.md)

Each key's **While running** setting controls what happens when you use it again before its action finishes. **Ignore extra presses** is the default. **Queue one press** saves the first extra gesture and discards further presses while it waits. The queued action is dropped if the page or profile changes, the deck closes or reloads, or a different window is active when it would start.

## Audio and system indicators

The sliders at the bottom right of Deck Keys adjust the default speaker volume and the selected microphone level through Windows Core Audio. Tap the microphone icon beside its slider to choose an input. Choose **All microphones** to adjust every active input together. A reading prefixed with ≈ shows the average when the inputs have different levels.

Tap the speaker icon beside its slider to open **App mixer** and adjust individual Windows apps. It fills the space below the clock and leaves the shared mute icons available. A row controls all listed audio sessions for that app, including sessions routed to different speaker outputs. A volume prefixed with ≈ indicates an average across different session levels. Lastra refreshes the mixer every second while it is open. Use **Deck organization → Pinned mixer apps** in Lastra Settings to keep a fader at the top, even after its audio session closes. Offline controls are disabled and become available again when the same app opens a session. **Unpin** also works offline.

The top-right speaker and microphone buttons toggle mute. Hold the speaker button to choose the Windows playback device. With the button focused, press **Down Arrow** or **Shift+F10** to open the same picker. The list refreshes while open, marks the default output, and shows disconnected or disabled devices reported by Windows. Selecting an available device sets the default output for ordinary Windows audio. The microphone button and the **Windows mic** key mute every active input, including inputs selected directly by another app. Tap again to restore the inputs Lastra muted. If every input was already muted, Lastra unmutes the default communications microphone. The Teams and Meet shortcuts apply to the respective app in the foreground.

Speaker and microphone keys show the latest Windows mute state, including **Partly muted** for a mixed microphone group. Spotify playback keys show the state of the current desktop media session. The standard icons and labels adapt to the current state, while custom icons, images, and labels stay visible. These indicators follow changes made outside Lastra and are available on pages and the persistent bar.

The editor's **Key value** setting controls the small readout on a key. Audio and Spotify keys show volume or time remaining by default. A key can also show CPU, GPU, or RAM usage, or a CPU or GPU temperature when a sensor is available. Use **Off** to hide the numerical value.

Dashboard shows the **Signal** card alongside the top-right controls. In Deck Keys, each channel shows its live peak in dBFS directly beneath the volume percentage. The speaker bar follows the current Windows playback device. The microphone bar follows the loudest unmuted input automatically. Choose an individual microphone in Deck Keys to meter only that input. The bars distinguish silence, mute, and unavailable readings.

Open **Apps → Audio presets** to save the current Windows speaker and default microphone levels for an activity. The preset displays the current and saved values side by side. **Apply shown levels** verifies that the same devices and levels are still present, then checks Windows readback for each change. Use **Refresh levels** after changing a volume or device in Windows. Presets affect volume only.

Open **Lastra → Settings → Display** to choose from 14 themes, including **Graphite**, **Ocean**, **Plum**, and **Sand**, and four plain ones, **Minimal** and **Contrast** in dark and light. **System** follows the desktop appearance. Choose a custom **Accent color** or use the theme accent. High contrast takes precedence over custom colors. The settings apply to the deck, profile editor, and preview.

In **Settings → Display → Telemetry**, choose **Number** or **Gauge** independently for CPU, RAM, and GPU in the deck side panel. You can also show or hide percent signs and clock seconds. Percent signs are on by default and clock seconds are off. Readings that reach 100% display **MAX** in red.

Select a muted input and hold the square **Push to talk** button to open that microphone. **Talking** confirms that Windows has unmuted the input. [Push-to-talk guide](docs/push-to-talk.md)

CPU and RAM update automatically. For GPU and temperature readings, install the portable version of LibreHardwareMonitor with WinGet.

```powershell
winget install --id LibreHardwareMonitor.LibreHardwareMonitor --exact --scope user --skip-dependencies
```

Lastra loads the official library in a background process and samples sensors every two seconds. The process starts only while the Edge is connected and exits with Lastra. For a manually installed portable copy, set `LASTRA_LHM_DIR` to the folder containing the .NET Framework build of `LibreHardwareMonitorLib.dll`. Some temperature readings require access to the sensor driver. If you run an independent LibreHardwareMonitor instance, Lastra can still read `http://127.0.0.1:8085/data.json`. [LibreHardwareMonitor](https://github.com/LibreHardwareMonitor/LibreHardwareMonitor)

The Deck side panel shows the current CPU, RAM, and GPU readings. Add a **System metric** graph widget when you want to see a history chart. [Telemetry guide](docs/telemetry.md)

## Interface language

Use **Settings → General → Interface language** to choose **System language**, **Italiano**, or **English**. Lastra defaults to the first supported language in Windows preferences and falls back to English. Changing the interface language keeps the current draft and undo history. Key and page names, the Office shortcut language, and the profile's date and time format are stored in the profile. Specialized messages without an Italian translation appear in English.

## Profile editor

With Deck Keys visible on the XENEON EDGE, choose **Edit current Deck Keys** in the editor to open the active page in your draft. For an automatic shortcut page, Lastra copies the visible screen into a new editable page and keeps the shortcut guards. **Preview on XENEON** shows the draft on the physical display and updates as you edit. Tap **Close preview** on the panel, or close it in the editor. Save the profile to apply the changes to the live deck.

Select **Editor** in the desktop Lastra window or run `npm run edit`. Use **Find a page** to filter pages by name or folder, then select a slot to edit its **Actions**, **Style**, or **Placement**. The grid is drawn on the deck's own backdrop, and a window at least 1,500 pixels wide also shows an outline of the deck's side panel. The key name and the three tabs stay in view while you scroll its settings. Use the arrow keys to move around the grid, **F2** or **Edit selection** to move to the slot settings, and drag a key to reposition it. Expand **Page settings** to set the apps that activate the page. The toolbar shows whether the profile has unsaved changes. **Save profile** updates the deck immediately. Find profile import, export, and backups under **More**.

Open **App shortcuts**, select an app, and expand **Configure app shortcut pages**. Create, name, and reorder several pages. Select a command in the catalog and choose **Add to shortcut page**. Hide a command to keep it in your configuration for later, or remove it from the page. You can also turn off an app's automatic pages for the current activity. Choose **Save profile** to apply your changes. Swipe on the deck to switch pages while the app is in the foreground. [Configure app shortcut pages](docs/shortcut-packs.md#configure-app-shortcut-pages)

Open **Settings → Display** to set the display theme, text size, contrast, clock, idle screen, and dimming. Under **Deck look**, choose a quick look or set the key style, backdrop, key shape, and icon weight yourself. **Classic** keeps the look of earlier versions, and the **Minimal** and **Contrast** themes, each dark or light, keep the deck plain. [Deck look](docs/deck-look.md) Enable **Large Deck Keys** for bigger, more widely spaced touch targets. Swipe to reach additional keys, and find Cut, Copy, Paste, Undo, and Redo at the end of each screen. The page layout shows how many screens each orientation needs. These global settings apply when changed.

Open **Settings → Deck keys → Global keyboard shortcuts** to assign shortcuts for navigating or revealing the deck. Type a combination or select **Record** and press the keys, then select **Apply** to save it. Each row shows the registration status. The page lock pauses page shortcuts. View-only mode and Windows lock pause every shortcut.

On a key, select **Choose icon or image** to search Lucide, browse Start menu apps, or select an image or Windows executable. The crop controls preview the square image before applying it to the draft. Undo and Redo include this change. Save embeds the crop as a PNG in the profile.

Choose **Templates** to preview Work, VS Code, Meetings, Streaming, Video and image editing, or Sim racing. Adding a template creates independent pages in the current draft and assigns unused app matches. Existing pages keep their matches. Use Undo to remove the addition, or save the profile to make the pages available on the deck.

Select **Browse actions** beside an action’s **Type** field to search by name, category, or example. Choose a result to open its settings. You can also use the **Type** picker directly.

Use **Page widgets** or **Bar widgets** to add Now Playing, system readings, and timers. The catalog previews each widget and checks its placement before you save. [Widget guide](docs/widgets.md) · [Timers](docs/timers.md) · [Soundboard](docs/soundboard.md)

Copy keys and pages to the Windows clipboard and paste them into other profiles. Use **Duplicate** to reuse actions in the current profile. Added pages have new IDs and can be associated with executables for automatic switching.

Use **Undo** and **Redo** in the toolbar or press **Ctrl+Z**, **Ctrl+Y**, or **Ctrl+Shift+Z**. Typing in one field is grouped into short edits. Saving keeps the undo history and marks the saved version as clean. Reloading from disk starts a new history.

Expand **Live preview** above the page layout to see the current page and persistent widget bar as you edit. Switch between the native 2560 × 720 landscape and 720 × 2560 portrait aspect ratios. The preview updates before you save, uses sample readings, and disables deck actions.

On first launch, Lastra copies `profiles/default.json` to `%APPDATA%\Lastra\profile.json`. Open it from **Settings → System → Profile files** to edit it directly. If the profile is missing or invalid, Lastra keeps using the last valid configuration when available. Each save backs up the previous valid profile as `profile.json.bak`. When you repair a malformed file, the editor keeps the malformed version as `profile.json.invalid`. If another app changes the file while you are editing, reload it in the editor before saving or restoring.

**Backups** in the profile editor lists earlier versions and can restore one to the deck. Lastra keeps up to ten distinct recent versions, including the active one, in `profile.json.history`. This includes valid external edits that Lastra loads. An existing backup from before the English upgrade is also available. Restore asks for confirmation before replacing the active profile or discarding unsaved edits.

Profiles from 0.1 with top-level `keys` open as a **Home** page. The editor saves them in the page-based format. To try a 0.2 profile alongside an existing installation, pass a separate copy with `npm start -- --profile=C:\path\profile.json`.

Stock profiles ship with English labels. The unchanged original stock profile upgrades to that version and is backed up as `profile.json.before-english.bak`. Custom profiles retain their labels and locale. The `locale` field controls date and time formatting.

At startup, Lastra retires untouched copies of the original VS Code and Browser pages from the Main activity. It keeps customised pages and saves a copy of the original profile in `profile.json.before-automatic-pages.bak`. If the saved selection referred to a retired page, Lastra falls back to the first page and keeps the existing lock setting.

An untouched older **Home** in the Main activity is compacted to the single-screen layout. The original profile is available in **Backups** and in `profile.json.before-compact-home.bak`.

Activity profiles with the old system volume buttons in **Home** use the audio sliders. Lastra removes the two buttons on startup and saves the previous profile in **Backups**.

### JSON format

```json
{
  "name": "Main",
  "locale": "en-GB",
  "grid": { "cols": 8, "rows": 3 },
  "pages": [
    {
      "id": "home",
      "name": "Home",
      "keys": [
        {
          "id": "explorer",
          "label": "File Explorer",
          "icon": "folder",
          "category": "app",
          "action": { "type": "launch", "target": "explorer.exe" },
          "hold": { "type": "open", "target": "%USERPROFILE%\\Downloads" }
        },
        null
      ]
    },
    {
      "id": "browser",
      "name": "Browser",
      "apps": ["chrome.exe", "msedge.exe"],
      "keys": [
        {
          "id": "tab",
          "label": "New / reopen tab",
          "icon": "square-plus",
          "action": { "type": "hotkey", "keys": "ctrl+t" },
          "double": { "type": "hotkey", "keys": "ctrl+shift+t" }
        }
      ]
    }
  ]
}
```

Pages inherit the profile grid. Set a page's own `"grid": { "cols": 5, "rows": 2 }` to override it. The editor provides these controls under **Page grid**. A key can cover several cells from its anchor, for example with `"span": { "cols": 2, "rows": 1 }`. Leave the covered array entries as `null`. Widgets fit in the remaining cells. Use **Width in cells** and **Height in cells** to set a key's size in the editor.

`hold` and `double` are optional actions. Set `"confirm": { "mode": "prompt" }` for a confirmation dialog or `"confirm": { "mode": "hold", "holdMs": 850 }` for a key-specific hold of 250 to 3000 ms. Omit `holdMs` to use the profile duration. Existing `"confirm": true` keys also use the profile duration. A confirmed key cannot have `hold` or `double` actions. The optional `onBusy` field accepts `ignore` or `queue-one`. Use `icon` for a Lucide icon name or `image` for the path to a PNG, JPG, SVG, or WebP up to 2 MB. Available categories are `app`, `media`, `system`, and `meeting`. Add `"color": "#5b9df9"` to give a key its own color. [Lucide icon catalog](https://lucide.dev/icons)

### Action fields

| Action | Fields |
|---|---|
| `launch` | `target` executable, optional `args` list, optional `cwd` directory, optional `reuseWindow` boolean |
| `open` | `target` URL, Windows URI scheme, or path |
| `workspace` | `workspace` set to the ID of a configured workspace |
| `hotkey` | `keys` combination such as `ctrl+shift+m` |
| `media` | `key` chosen from `playpause`, `next`, `prev`, `stop`, `mute`, `volup`, `voldown` |
| `text` | Unicode `text` to type |
| `delay` | `ms` from 0 to 10000 |
| `wait-for` | `condition`, `expected`, and optional `timeoutMs` |
| `if` | `condition`, `expected`, `then` action, and optional `else` action |
| `sequence` | `steps` containing 1 to 20 actions, up to three levels deep |
| `random` | stable `id`, `pool` of 2 to 10 actions, optional `avoidRepeat` boolean |
| `audio` | `device` set to `output` or `microphone` to toggle mute |
| `timer` | stable `id`, `label`, `durationMs` for a countdown or `kind` set to `stopwatch`, optional `command` |
| `sound` | stable `id`, `file` path of a local audio clip, optional `volume`, `again`, and `output`, or `command` set to `stop-all` |
| `obs-scene` | `scene` name and `bus` set to `program` or `preview` |
| `spotify-playback` | Uses the Spotify desktop media session |

Lastra expands environment variables in a `launch` program path and working directory when the result is a local path, for example `%LOCALAPPDATA%` or your own `%Apps%`. In `launch` arguments, `open` file paths and network paths, only the standard Windows folder variables expand, such as `%USERPROFILE%`, `%APPDATA%`, `%LOCALAPPDATA%`, `%ProgramFiles%`, `%TEMP%` and `%OneDrive%`. URLs are never expanded, so a shared profile cannot send a token from your environment to a website. Use a Windows executable for `launch`. `open` refuses scripts and installers (such as `.bat`, `.vbs`, `.ps1` and `.msi`) and handlers known for running code (`file:`, `search-ms:`, `ms-msdt:` and similar). Key images must be local files or embedded PNGs; network paths are not loaded. Key names include `ctrl`, `shift`, `alt`, `win`, letters, numbers, `f1`–`f24`, arrow keys, `enter`, `esc`, `tab`, `space`, `backspace`, `delete`, `home`, `end`, `pageup`, and `pagedown`. Character shortcuts such as `Ctrl+/` and `Alt+=` use the target window's keyboard layout. [Shortcut notation](docs/shortcut-packs.md#keyboard-notation)

Enable **Switch to an existing window first** in a **Launch program** action, or set `reuseWindow` to `true` in JSON. Lastra first looks for a visible window from the executable. If it finds one, it restores the window when minimized and asks Windows to bring it forward. Use a full path to distinguish installations that share an executable name. Arguments and working directory apply when Lastra starts a new process. An app that runs in the background without a window can still be started after the brief startup grace period.

On an app-linked page, Lastra checks the active executable before sending a shortcut or typing text. An action can set its own `targetApps` list through **Allowed foreground apps** in the editor. Each keyboard step checks focus again, including after delays in a sequence.

## Local MCP integration

Enable **Agent access** under **Settings → System** and grant an MCP client access to the active activity. Clients can inspect layouts and provider state, simulate gestures, and draft profile changes. Live actions such as running a saved key or changing Windows app volume have separate grants and require approval in Lastra. The stdio bridge also supports validating and previewing profiles offline. [Agent setup](docs/agent-access.md) · [MCP verification](docs/mcp-verification.md)

## Development and verification

```powershell
npm run dev
npm test
npm run preview
npm run preview:states
npm start -- --preview=preview-portrait.png --preview-portrait
npm start -- --preview=preview-stats.png --preview-stats
npm start -- --preview=preview-tools.png --preview-tools
npm start -- --preview=preview-pomodoro-break.png --preview-break
```

The PNG preview commands render the deck offscreen with sample readings and save the captures in the current directory. They work without the XENEON EDGE connected.

Run `node scripts/refresh-previews.js` with FFmpeg on `PATH` to regenerate the screenshots and animated demos offscreen. The generator checks toolbar alignment and captures the Tools and full-screen break flow, with a full-screen check in both orientations. It writes the PNGs to `docs/` and the repository root and the GIFs to `docs/`.

Use `--verify-deck-swipe` with a preview profile that has two pages and starts with a wide key to verify that a swipe changes the page without running that key. Add `--preview-portrait` to run the gesture in portrait.

The main process manages displays, profiles, and actions. The deck receives a view of the keys over IPC and sends back the key ID, gesture, and page revision. The editor opens in a separate window with access to the configuration document. On Windows, `SendInput` sends shortcuts to the active window and respects Windows integrity levels. To verify touch mapping, try a shortcut while an app is active on the primary monitor.

See the [roadmap](ROADMAP.md) for planned features and hardware checks and the [changelog](CHANGELOG.md) for completed work.

## License

The original Lastra code, documentation, and assets are released under the MIT License. Third-party components and material in shortcut reference catalogs remain subject to their upstream terms. Check the redistribution status of catalog data before using it in a release. [MIT License](LICENSE) · [Third-party notices and catalog sources](THIRD_PARTY_NOTICES.md)

Lastra was inspired by Tessera Deck.
