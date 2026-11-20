# Import Stream Deck shortcut pages

Export a profile as `.streamDeckProfile` from the Windows Stream Deck application. In Lastra's editor, choose **Import** and select the file. Confirm the Windows source, choose the destination grid, and select the pages you want to add. Each page can stay manual or match a foreground executable such as `Code.exe`. A match already in use stays on the existing page. The copied page then opens manually and its keys still require the chosen app.

The preview lists supported chords, unsupported actions, missing mappings, required plugins and keys outside the selected grid. Expanding the destination grid can preserve more source positions. Imported pages are editable copies. **Save profile** applies them, and editor undo works before saving.

The importer reads legacy v1 and v2 keypad manifests. Single built-in hotkey chords use Windows virtual keys. Shifted characters and punctuation can depend on the source keyboard layout. Conflicting key codes and multi-chord actions appear in the review. Folder contents can be imported as separate pages, while folder and page navigation buttons stay in the review. Actions that run programs or open files or links, plugins, settings, archive app paths and graphics are omitted.

Lastra reads selected manifests directly from the archive. ZIP entry names, local and central metadata, sizes and manifest integrity are checked. The archive can be up to 32 MB and contain up to 2,048 entries. A single manifest can use up to 512 KB, and selected manifests share a 4 MB limit. No archive entries are extracted to disk.

Format references include the [Elgato export guide](https://docs.elgato.com/streamdeck/sdk/guides/profiles/), [DroidDeck's importer fixtures](https://github.com/ggfto/DroidDeck/blob/main/tests/DroidDeck.Tests/StreamDeckImportTests.cs), and [Windows virtual-key codes](https://learn.microsoft.com/en-us/windows/win32/inputdev/virtual-key-codes). Lastra's tests use generated archives.
