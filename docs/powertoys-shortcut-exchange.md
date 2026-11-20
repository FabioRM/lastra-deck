# PowerToys Shortcut Guide manifest evaluation

This offline CLI evaluates the WinGet keyboard-shortcut draft and the behavior of PowerToys Shortcut Guide **v0.102.3001**, commit `a00b2bce7403f0a48efe5cbb6671074e01f27824`. Run `npm ci` from the Lastra checkout to install the pinned YAML development dependency. The CLI works on selected files and leaves the installed Shortcut Guide directory and index untouched. [Pinned release](https://github.com/microsoft/PowerToys/releases/tag/v0.102.3001) · [Pinned WinGet schema draft](https://github.com/microsoft/PowerToys/blob/a00b2bce7403f0a48efe5cbb6671074e01f27824/doc/specs/WinGet%20Manifest%20Keyboard%20Shortcuts%20schema.md)

## Review a manifest

```powershell
node scripts/powertoys-shortcuts.js inspect .\test\fixtures\powertoys\Example.Classic.en-US.yml
```

The JSON preview preserves the package identifier, executable filters, background-process flag, filename locale, sections and chords as recorded. `<9>` designates the literal digit. A plain `9` identifies Windows virtual-key code 9. Display labels and blank key placeholders stay visible as separate kinds. Fields the release reader lacks, such as the draft's `AdditionalInfo`, appear in the warnings.

The release uses the same `Shortcut` array for several chords. Firefox's **Back** alternatives and VS Code's ordered **Open Keyboard Shortcuts** chord show why the array alone is ambiguous. The preview marks multi-chord rows `unresolved` and preserves their order. A separate review JSON can assign `alternatives` or `ordered` to a one-based section and entry from the preview. Copy the preview's `sha256` into `manifestSha256`, then pass the review file with `--review`. A digest change requires a new review. [Firefox manifest](https://github.com/microsoft/PowerToys/blob/a00b2bce7403f0a48efe5cbb6671074e01f27824/src/modules/ShortcutGuide/ShortcutGuide.Ui/Assets/ShortcutGuide/Manifests/Mozilla.Firefox.en-US.yml) · [VS Code manifest](https://github.com/microsoft/PowerToys/blob/a00b2bce7403f0a48efe5cbb6671074e01f27824/src/modules/ShortcutGuide/ShortcutGuide.Ui/Assets/ShortcutGuide/Manifests/Microsoft.VisualStudioCode.en-US.yml) · [Release display model](https://github.com/microsoft/PowerToys/blob/a00b2bce7403f0a48efe5cbb6671074e01f27824/src/modules/ShortcutGuide/ShortcutGuide.Ui/ShortcutGuideXAML/Controls/ShortcutItemView.xaml)

```json
{
  "manifestSha256": "paste-the-preview-sha256-here",
  "rows": [
    { "section": 1, "entry": 1, "semantics": "alternatives" },
    { "section": 1, "entry": 2, "semantics": "ordered" }
  ]
}
```

## Preview or write an export

```powershell
node scripts/powertoys-shortcuts.js export .\profile.json --page work --package Example.Classic --process classic.exe
node scripts/powertoys-shortcuts.js export .\profile.json --page work --package Example.Classic --process classic.exe --output .\Example.Classic.en-US.yml
```

The export preview includes YAML and a per-key report. It represents plain tap hotkeys and straight sequences of hotkeys, with the chords in execution order. The report identifies gestures, confirmations, queue policies, linked controls, layout-dependent keys, non-keyboard actions and app requirements that cannot transfer. Packaged app identities, web app identities and window title rules block export of that page because an executable filter would broaden scope. `--output` creates a new file with the exact generated filename. An existing file is preserved.

The pinned release indexes `*.yml` and loads `<PackageName>.en-US.yml`. It accepts semicolon-separated exact executable names alongside the draft's single executable or `*`. `--locale it-IT` can produce a review artifact and reports the release's en-US lookup. The locale describes manifest text. The installed reader matches executables and optional background processes. It has no field for a packaged app's AUMID or a keymap layout. [Pinned manifest reader](https://github.com/microsoft/PowerToys/blob/a00b2bce7403f0a48efe5cbb6671074e01f27824/src/modules/ShortcutGuide/ShortcutGuide.Ui/Helpers/ManifestInterpreter.cs) · [Pinned index generator](https://github.com/microsoft/PowerToys/blob/a00b2bce7403f0a48efe5cbb6671074e01f27824/src/modules/ShortcutGuide/ShortcutGuide.IndexYmlGenerator/ManifestIndexGenerator.cs)

## Compatibility checked

The Lastra preview read all 44 manifests shipped with 0.102.3001.0, covering 3,361 shortcut rows. The installed release's YAML reader and index generator were invoked against a temporary directory containing classic, packaged, Italian and background fixtures plus a Lastra export. The parser retained the digit and ordered keys, and the index retained the executable filters and background flag. The Italian file parsed, while the reader's `Language` property returned `en-US`. The test covers the parser and indexer APIs. Interactive Shortcut Guide display remains unverified.

Run `node --test test/powertoys-manifest.test.js` for the repeatable preview, validation, and export tests. The fixtures are Lastra examples of the pinned format.
