# Lastra Deck on Linux

Linux support is experimental. Automatic profiles use the foreground window's application ID (the class from `WM_CLASS` on X11). Lastra ships 70 Linux profiles with 985 shortcut entries. They cover apps such as Firefox, LibreOffice, GIMP, Blender, FreeCAD, Godot, OBS Studio, Kdenlive, Shotcut, DBeaver, Telegram Desktop and kitty. KiCad has separate profiles when the standalone PCB and Schematic Editors report their own app IDs. You can link a custom page using its `appIds` property and optionally a window title. Use lowercase app IDs, such as `org.mozilla.firefox` or `code`.

## Install

Download the x86-64 packages and SHA-256 checksums from the [latest Lastra Deck release](https://github.com/FabioRM/lastra-deck/releases/latest).

- **Debian, Ubuntu or Mint.** Run `sudo apt install ./Lastra-1.2.0-linux-amd64.deb`, then open **Lastra** from the app menu or run `lastra`.
- **AppImage.** Run `chmod +x Lastra-1.2.0-linux-x86_64.AppImage`, then launch it directly. On systems without FUSE, try `--appimage-extract-and-run`.
- **Source.** Run `npm ci` with Node.js 22.12 or later, then `npm start`. `npm run dev` opens a focusable development window for inspecting profiles.

Update Linux builds by downloading a new package. Lastra selects the XENEON EDGE by name or by physical resolution if exactly one display matches. Pass `--display=<id>` to select an Electron display explicitly. Switch to **Deck Keys** to see the active app's shortcuts.

## X11

Use an X11 desktop session with an EWMH-compatible window manager and the XTEST extension. On Debian or Ubuntu, the runtime libraries are `libx11-6`, `libx11-xcb1`, `libxcb1` and `libxtst6`. Open a target application on the main screen and tap a button on the Edge. Lastra checks the active window and the keyboard focus before sending the chord using the current XKB layout.

To find the app ID for a custom page, run `xprop WM_CLASS` and click the target window. Use the second string, lowercased.

## GNOME and KDE Plasma on Wayland

Install GJS, XWayland and your desktop's Remote Desktop portal (`xdg-desktop-portal-gnome` or `xdg-desktop-portal-kde`). The installer's launcher and `npm start` select a non-activating XWayland window for the Deck. The compositor supplies the active window for both native Wayland and XWayland apps. The keyboard portal sends the chord to the current application without activating it.

### GNOME Shell 46–50

Download `lastra-wayland@fabiorm.github.io.zip` from the same release, then run `gnome-extensions install ./lastra-wayland@fabiorm.github.io.zip`. Sign out and back in if the extension is new, then run `gnome-extensions enable lastra-wayland@fabiorm.github.io`.

If you are running from source, you can install the extension files from the repository root.

```sh
uuid=lastra-wayland@fabiorm.github.io
extension_dir="${XDG_DATA_HOME:-$HOME/.local/share}/gnome-shell/extensions/$uuid"
mkdir -p "$extension_dir"
cp extensions/lastra-wayland/gnome/{metadata.json,extension.js} "$extension_dir/"
```

Sign out and back in, then run `gnome-extensions enable lastra-wayland@fabiorm.github.io`. The extension reports the focused window's identity and title over the session bus. Keyboard sharing uses the desktop portal.

### KDE Plasma 6

Lastra loads a temporary foreground script through KWin's scripting interface when it starts and unloads it on exit. The user session's screen locker is checked before a key is sent.

### Authorize the Deck keyboard

Run `lastra --enable-wayland-keyboard` after installing the `.deb`. With the AppImage, pass `--enable-wayland-keyboard` to the file. From source, use `npm start -- --enable-wayland-keyboard`. Approve the desktop's keyboard-only prompt. You can run the command with Lastra already open to request permission for that instance. Permission lasts for the portal session. Switch to **Deck Keys** and select the target app on your main monitor before tapping a shortcut.

## Hyprland on Wayland

Use Hyprland 0.55 or later with Lua configuration and `hyprctl` on `PATH`. Add this rule to your Hyprland configuration before opening Lastra. Replace `DP-2` with the XENEON EDGE connector shown by `hyprctl monitors`. The rule places the Deck on that output and keeps its taps from focusing the Deck window. Lastra's editor remains focusable.

```lua
hl.window_rule({
    match = { class = "(?i)^lastra$", initial_title = "^Lastra Deck$" },
    monitor = "DP-2 silent",
    float = true,
    pin = true,
    move = { "0", "0" },
    size = { "monitor_w", "monitor_h" },
    border_size = 0,
    rounding = 0,
    no_initial_focus = true,
    no_focus = true,
    no_follow_mouse = true,
    focus_on_activate = false,
})
```

Reload Hyprland and run `npm start -- --ozone-platform=wayland`. `hyprctl -j activewindow` shows the foreground window. For a custom page, use the lowercase `initialClass` (or `class` when `initialClass` is empty). Lastra asks Hyprland to send a shortcut only if the same window is still active.

## Current coverage

The Linux integration supports keyboard shortcuts, including sequences of shortcuts. Windows virtual keys, raw Windows scan codes, text insertion and Windows-specific actions such as the app mixer and workspace restoration remain unavailable. Known terminals require their own custom bindings because common editing chords such as `Ctrl+C` have shell-specific meanings. The Deck reports keyboard availability based on the detected compositor and permissions.
