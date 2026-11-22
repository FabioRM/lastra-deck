# Third-party notices

The [MIT License](LICENSE) grants rights in the original Lastra material. The components and source material below retain their upstream terms.

## Components

| Material | License and attribution |
| --- | --- |
| Barlow fonts shipped in `src/renderer/fonts/` | SIL Open Font License 1.1. [Font license and copyright](src/renderer/fonts/OFL.txt) |
| Noto Color Emoji shipped as WOFF2 in `src/renderer/fonts/` | SIL Open Font License 1.1. Lastra compressed the upstream COLRv1 font in WOFF2 format. [Font license and copyright](licenses/Noto-Emoji-OFL.txt) · [Upstream font](https://github.com/googlefonts/noto-emoji/blob/99701e07d3d1fe1bdbcdb14964547f0fd592966f/2D/fonts/Noto-COLRv1.ttf) |
| Unicode Emoji 18.0 test data used for the emoji picker | Unicode License v3. [License and copyright](licenses/Unicode-Data.txt) · [Data source](https://www.unicode.org/Public/18.0.0/emoji/emoji-test.txt) |
| Lucide icons used in the app and shown in the README previews | ISC, with Feather-derived icons under MIT. The upstream notice is reproduced below. |
| PowerToys Shortcut Guide manifest data | MIT, copyright Microsoft Corporation. [Manifest data notice](profiles/shortcut-packs.NOTICE) |
| IntelliJ Platform keymaps and English action labels | Apache 2.0. Lastra converted the upstream XML descriptors and action resources to JSON and added coverage metadata. [License](licenses/Apache-2.0.txt) · [JetBrains NOTICE](licenses/IntelliJ-Platform-NOTICE.txt) |
| Codex CLI TUI defaults and slash commands | Apache 2.0. Lastra converted the entries from `rust-v0.150.1` to JSON and added labels. [License](licenses/Apache-2.0.txt) · [Codex NOTICE](licenses/Codex-CLI-NOTICE.txt) |
| npm dependencies and Electron | Each package carries its own license. This includes MPL 2.0 for `ical.js` and separate notices for components bundled with Electron. [Dependency versions](package-lock.json) · [Electron license](https://github.com/electron/electron/blob/main/LICENSE) · [ical.js package](https://www.npmjs.com/package/ical.js/v/2.2.1) |

Keep the applicable license texts and copyright notices with any copies or bundles that include these components.

## Shortcut reference catalogs

The `sources` entries record the origin, revision, and terms when available. Preserve this provenance with the applicable notices. The redistribution review identifies the material included in the public source package and the status of the remaining development catalogs. [Redistribution review](docs/catalog-redistribution.md) · [Catalog sources](docs/shortcut-packs.md)

Product names identify the applications that Lastra integrates with. Any rights in those names and marks remain with their respective owners.

## Lucide and Feather license notice

```text
ISC License

Copyright (c) 2026 Lucide Icons and Contributors

Permission to use, copy, modify, and/or distribute this software for any
purpose with or without fee is hereby granted, provided that the above
copyright notice and this permission notice appear in all copies.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN
ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF
OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.

---

The following Lucide icons are derived from the Feather project:

airplay, alert-circle, alert-octagon, alert-triangle, aperture, arrow-down-circle, arrow-down-left, arrow-down-right, arrow-down, arrow-left-circle, arrow-left, arrow-right-circle, arrow-right, arrow-up-circle, arrow-up-left, arrow-up-right, arrow-up, at-sign, calendar, cast, check, chevron-down, chevron-left, chevron-right, chevron-up, chevrons-down, chevrons-left, chevrons-right, chevrons-up, circle, clipboard, clock, code, columns, command, compass, corner-down-left, corner-down-right, corner-left-down, corner-left-up, corner-right-down, corner-right-up, corner-up-left, corner-up-right, crosshair, database, divide-circle, divide-square, dollar-sign, download, external-link, feather, frown, hash, headphones, help-circle, info, italic, key, layout, life-buoy, link-2, link, loader, lock, log-in, log-out, maximize, meh, minimize, minimize-2, minus-circle, minus-square, minus, monitor, moon, more-horizontal, more-vertical, move, music, navigation-2, navigation, octagon, pause-circle, percent, plus-circle, plus-square, plus, power, radio, rss, search, server, share, shopping-bag, sidebar, smartphone, smile, square, table-2, tablet, target, terminal, trash-2, trash, triangle, tv, type, upload, x-circle, x-octagon, x-square, x, zoom-in, zoom-out

The MIT License (MIT) (for the icons listed above)

Copyright (c) 2013-present Cole Bemis

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```
