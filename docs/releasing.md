# Releasing Lastra

Lastra ships as a per-user NSIS installer for Windows x64, built with electron-builder. Installed copies update themselves from GitHub Releases through electron-updater. The build configuration is in [`electron-builder.yml`](../electron-builder.yml), and the update logic is in [`src/main/updater.js`](../src/main/updater.js).

## Local builds

| Command | Output | Use |
| --- | --- | --- |
| `npm run dist:dir` | `out/win-unpacked/Lastra.exe` | Quick check of the packaged app. Has no `app-update.yml`, so updates stay off. |
| `npm run dist` | `out/Lastra-Setup-<version>.exe`, `.blockmap`, `latest.yml` | The installer and the update metadata that a release publishes. |
| `npm run dist:linux` | `.deb` and AppImage under `out/` | Packages the x86-64 Linux build. Run on Linux. |
| `sh scripts/release-linux.sh` | Linux packages, GNOME extension ZIP and SHA-256 files under `out/` | Builds the Linux release bundle with `bsdtar` and `sha256sum`. |

These commands package the directory they run in, including local working-tree files. For a public build, use an extracted source ZIP from the release page or a clean checkout of its public tag. To check a packaged build without the panel, run `out\win-unpacked\Lastra.exe --preview=preview.png`.

`out/` is ignored by Git. Do not commit build output.

## Packaged layout

asar is turned off. The app lives as plain files in `resources\app` under the install directory, `%LOCALAPPDATA%\Programs\Lastra`. Several files are read by processes other than Electron through paths derived from the app folder, and a path inside `app.asar` would fail for them:

- `csc.exe` compiles `src\main\hardware-monitor.cs` and `src\main\windows-media.cs` the first time sensors or Now Playing start.
- MCP clients run `resources\app\extensions\lastra-mcp\stdio.js` with Node.js. The configuration that **Agent access → Grant access** copies uses `node`, so Node.js must be on `PATH` for MCP clients.
- Claude Code hooks run `resources\app\extensions\lastra-claude-code\hook.js` with Node.js. Use that path in place of `.\extensions\lastra-claude-code\hook.js` from [Claude Code](claude-code.md).
- The tray opens setup guides in `docs\` and `extensions\lastra-vscode\README.md` in the default editor.

koffi loads its prebuilt Node-API binary from `node_modules\@koromix\koffi-win32-x64`. electron-builder does not rebuild it (`npmRebuild: false`).

The package contains `src/`, `profiles/`, `extensions/`, `assets/`, the license files, `docs/*.md`, and the production dependencies. It leaves out tests, scripts, `dist/`, `rsc/`, preview images, documentation images, the internal backlog, and the unused lucide-static fonts and bundles.

## Catalog redistribution

This public repository mirrors source prepared with the catalog redistribution rules. The release workflow archives the tagged public tree and builds the Windows installer and Linux packages from that revision. [Catalog redistribution](catalog-redistribution.md)

For a local release build, run `npm ci`, `npm run check`, and `npm run dist` in the extracted source directory. The installer, blockmap and update metadata appear under `out/`. Run `sh scripts/release-linux.sh` from the same source on Linux for the `.deb`, AppImage, GNOME extension and their SHA-256 files.

## Publishing a release

1. Update `version` in `package.json` and `package-lock.json`, for example with `npm version 0.2.2 --no-git-tag-version`. Commit the change.
2. Tag the commit with the same version and push the tag: `git tag v0.2.2` then `git push origin v0.2.2`.
3. The Windows and Linux jobs verify the tag, run `npm run check` and package the tagged source. The workflow checks both bundles and creates one **draft** with the Windows installer and update metadata, the Linux .deb and AppImage, the GNOME extension, the source ZIP, and SHA-256 files. [Release workflow](../.github/workflows/release.yml)
4. Review the files and add release notes. If the draft already exists, compare its assets with both workflow artifacts.
5. Publish the draft. Installed copies find the update at their next check.

electron-updater reads only published releases from `FabioRM/lastra-deck`, and the repository must be public for installed copies to read them. Leave `latest.yml` and the `.blockmap` attached to the release, since they let installed copies verify and download updates. Pre-releases are ignored.

The workflow uses the built-in `GITHUB_TOKEN` with `contents: write`. If a draft already exists, review its files against the workflow artifact before publishing. The installer, update metadata and public source should all come from the same tag build.

## Code signing

Builds are unsigned until a certificate is configured. electron-builder signs `Lastra.exe`, the uninstaller, and the installer automatically when these variables are set:

| Where | Variables |
| --- | --- |
| GitHub Actions | Repository secrets `WIN_CSC_LINK`, a base64-encoded `.pfx` or an HTTPS URL to one, and `WIN_CSC_KEY_PASSWORD`. |
| Local build | `CSC_LINK` and `CSC_KEY_PASSWORD`, or `WIN_CSC_LINK` and `WIN_CSC_KEY_PASSWORD`. |

Without them, the build logs `no code signing certificate configured, signing is skipped`. Certificates kept in a hardware token or a cloud service, such as Azure Trusted Signing, need extra `win` settings in `electron-builder.yml`.

When a signed build is installed, electron-updater checks that each update is signed by the same publisher. Copies installed from an unsigned build accept a first signed update. After that, every release must be signed with a certificate for the same publisher name.

## Update behavior

- The installed Windows app checks the public [GitHub Releases feed](https://github.com/FabioRM/lastra-deck/releases). Source runs, Linux builds, `--preview` runs, `dist:dir` builds, and runs with `LASTRA_DISABLE_UPDATES=1` skip these checks.
- The first check runs 90 seconds after startup, and later checks run every 4 hours.
- When a stable version is available, Lastra offers **Download update** and **Later** on the deck and in the desktop window. **Later** hides the offer for that version until the next app session. You can still start the download from **Lastra → Settings → System → Updates**.
- The download begins after you choose **Download update**. The same page shows progress and lets you retry a failed download. Once the download is ready, choose **Restart to update** or quit Lastra normally to install it.
- Update activity is written to `lastra.log` in the Lastra logs folder, under `%APPDATA%\Lastra\logs`.
