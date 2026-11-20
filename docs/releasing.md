# Releasing Lastra for Windows

Lastra ships as a per-user NSIS installer for Windows x64, built with electron-builder. Installed copies update themselves from GitHub Releases through electron-updater. The build configuration is in [`electron-builder.yml`](../electron-builder.yml), and the update logic is in [`src/main/updater.js`](../src/main/updater.js).

## Local builds

Run the release script on Windows with PowerShell 7.2 or later and Node.js 22.12 or later.

```powershell
pwsh -File scripts/release-windows.ps1
```

The script runs `npm ci`, lint, type checks, and tests, then builds the x64 installer and verifies its SHA-512 against the updater metadata. It writes four release files to `out/`.

- `Lastra-Setup-<version>.exe`
- `Lastra-Setup-<version>.exe.sha256`
- `Lastra-Setup-<version>.exe.blockmap`
- `latest.yml`

Add `-Tag v0.2.4` to require a clean checkout of that tag and matching versions in the package files. For a quick packaging check, use `npm run dist:dir` after installing dependencies. Run `out\win-unpacked\Lastra.exe --preview=preview.png` to check the packaged app without the panel. Git ignores `out/`.

## Packaged layout

asar is turned off. The app lives as plain files in `resources\app` under the install directory, `%LOCALAPPDATA%\Programs\Lastra`. Several files are read by processes other than Electron through paths derived from the app folder, and a path inside `app.asar` would fail for them:

- `csc.exe` compiles `src\main\hardware-monitor.cs` and `src\main\windows-media.cs` the first time sensors or Now Playing start.
- MCP clients run `resources\app\extensions\lastra-mcp\stdio.js` with Node.js. The configuration that **Agent access → Grant access** copies uses `node`, so Node.js must be on `PATH` for MCP clients.
- Claude Code hooks run `resources\app\extensions\lastra-claude-code\hook.js` with Node.js. Use that path in place of `.\extensions\lastra-claude-code\hook.js` from [Claude Code](claude-code.md).
- The tray opens setup guides in `docs\` and `extensions\lastra-vscode\README.md` in the default editor.

koffi loads its prebuilt Node-API binary from `node_modules\@koromix\koffi-win32-x64`. electron-builder does not rebuild it (`npmRebuild: false`).

The package contains `src/`, `profiles/`, `extensions/`, `assets/`, the license files, `docs/*.md`, and the production dependencies.

## Catalog redistribution

GitHub generates source archives from the tag. The installer bundles all catalogs and profiles in that same tree. Keep new catalog imports consistent with the [redistribution review](catalog-redistribution.md) and retain the applicable license texts and notices.

## Publishing a release

1. Run `npm version <version> --no-git-tag-version`, update the [changelog](../CHANGELOG.md), and commit the changes to `main`.
2. Create an annotated tag with release notes in Markdown, for example `git tag -a v0.2.5 -F release-notes.md`. Push `main` and the tag to `origin`.
3. The [Windows release workflow](../.github/workflows/release.yml) builds the tag and attaches the four files and the tag notes to a GitHub draft release.
4. Check the installer and notes, then publish the draft. Installed copies find the update at their next check.

electron-updater reads published stable releases from `FabioRM/lastra-deck`. Keep `latest.yml` and the blockmap attached to each release to support installation and differential downloads.

If Actions is unavailable, build from a clean checkout with `-Tag`, then attach the local files to a draft using the authenticated GitHub CLI.

```powershell
$version = (Get-Content package.json -Raw | ConvertFrom-Json).version
$tag = "v$version"
$installer = "out/Lastra-Setup-$version.exe"
gh release create $tag $installer "$installer.blockmap" "$installer.sha256" out/latest.yml `
  --repo FabioRM/lastra-deck --draft --verify-tag --title "Lastra $tag" --notes-from-tag
```

GitHub Pages serves [the project site](https://fabiorm.github.io/lastra-deck/) from `/docs` on `main`. The site links to the latest release, so the download link follows new public versions automatically.

## Code signing

Builds are unsigned until a certificate is configured. electron-builder signs `Lastra.exe`, the uninstaller, and the installer automatically when these variables are set:

| Where | Variables |
| --- | --- |
| GitHub Actions | Repository secrets `WIN_CSC_LINK`, a base64-encoded `.pfx` or an HTTPS URL to one, and `WIN_CSC_KEY_PASSWORD`. |
| Local build | `CSC_LINK` and `CSC_KEY_PASSWORD`, or `WIN_CSC_LINK` and `WIN_CSC_KEY_PASSWORD`. |

Without them, the build logs `no code signing certificate configured, signing is skipped`. Certificates kept in a hardware token or a cloud service, such as Azure Trusted Signing, need extra `win` settings in `electron-builder.yml`.

When a signed build is installed, electron-updater checks that each update is signed by the same publisher. Copies installed from an unsigned build accept a first signed update. After that, every release must be signed with a certificate for the same publisher name.

## Update behavior

- Updates run only in an installed copy. Source runs, `--preview` runs, `dist:dir` builds, and runs with `LASTRA_DISABLE_UPDATES=1` never check.
- The first check runs 90 seconds after startup, and later checks run every 4 hours.
- A new version downloads in the background and installs silently when Lastra quits. Lastra never opens an update dialog on the deck.
- **Lastra → Settings → System → Updates** shows the check, download status, and restart options.
- Update activity is written to `lastra.log` in the Lastra logs folder, under `%APPDATA%\Lastra\logs`.
