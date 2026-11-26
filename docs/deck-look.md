# Deck look

Open **Settings → Display → Deck look** to choose how the deck is drawn. Changes apply to the deck at once, and the profile editor draws its key grid with the same look. The theme and the accent color are set in **Appearance** on the same page and combine with any look.

## Quick looks

A quick look sets the key style, backdrop, key shape, and icon weight together.

| Quick look | Key style | Backdrop | Key shape | Icon weight |
| --- | --- | --- | --- | --- |
| **Classic** | Outline | Plain | Rounded | Regular |
| **Soft glow** | Tinted | Glow | Rounded | Regular |
| **Glass** | Glass | Aurora | Soft | Regular |
| **Bold tiles** | Solid | Plain | Rounded | Bold |
| **Blueprint** | Outline | Dot grid | Square | Thin |

A new installation starts with **Soft glow**. Choose **Classic** for the look of earlier versions.

## Plain themes

Four themes keep the deck plain on purpose. Choose them under **Appearance → Theme**.

| Theme | Look |
| --- | --- |
| **Minimal dark** and **Minimal light** | One ink color on a flat background with hairline borders. Keys do not take a category color, and empty slots are not drawn. |
| **Contrast dark** and **Contrast light** | The high-contrast colors, fixed to dark or light instead of following Windows. |

These themes always draw outline keys on a plain background. Quick looks, key style, and backdrop are saved and return when you choose another theme. Key shape, icon weight, and the icons-only option still apply. The **High contrast** checkbox keeps working with every other theme.

## Individual choices

- **Key style** — **Outline** keeps a neutral key with a colored icon. **Tinted** adds a soft wash of the key's color. **Solid** fills the key with its color. **Glass** makes the key translucent, so the backdrop shows through.
- **Backdrop** — **Plain** uses the theme background. **Glow**, **Aurora**, and **Dot grid** draw a still image from the colors of the current theme.
- **Key shape** — **Square**, **Rounded**, or **Soft** corners.
- **Icon weight** — **Thin**, **Regular**, or **Bold** lines for Lucide icons. Images keep their own look.
- **Show icons only on Deck Keys** — hides the label of each key that has an icon and enlarges the icon. A key without an icon keeps its label, and screen readers still read every label.

Select one of the **accent presets** under **Accent color** to set the accent with one click, or use the color field for any color.

High contrast, the plain themes, and Windows contrast themes keep the outline style on a plain background.

## Key colors

A key takes the color of its category. To give one key its own color, select it in the editor, open **Style**, and choose a swatch or a custom color under **Key color**. **Category color** returns to the default. The preview beside it shows the key as the deck draws it.

To color several keys at once, choose **Select keys**, select them, and pick a color under **Style and category**, then **Apply to selected keys**.

In JSON, add `"color"` with a hex value to the key.

```json
{ "id": "terminal", "label": "Terminal", "icon": "square-terminal", "color": "#fb7185", "action": { "type": "launch", "target": "wt.exe" } }
```

Lastra shifts a key color slightly toward the text color of the theme, so the icon stays readable on light and dark themes.

## Preview a look from the command line

`--preview-look` renders an offscreen preview with any appearance settings, separated by commas.

```powershell
npm start -- --preview=look.png --preview-look=theme=midnight,keyStyle=glass,backdrop=aurora
```
