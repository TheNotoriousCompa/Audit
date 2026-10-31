# Audit themes

Audit themes are local JSON files. The app does not download themes and does not execute CSS or JavaScript from them.

## Try the examples

1. Open Audit.
2. Click the palette icon.
3. Choose **Import**.
4. Select one of the `.audit-theme.json` files in this folder.

The theme is copied to `%APPDATA%\Audit\themes\` and can be selected from the Themes list. **Open themes folder** reveals that directory.

## Format

```json
{
  "schemaVersion": 1,
  "id": "author.theme-name",
  "name": "Theme name",
  "author": "Your name",
  "version": "1.0.0",
  "description": "Short description",
  "tokens": {
    "background": "#000000",
    "surface": "#101012",
    "surfaceStrong": "#18181b",
    "text": "#ffffff",
    "muted": "#9ca3af",
    "accent": "#ffffff",
    "accentContrast": "#0b0b0d",
    "border": "#ffffff1f",
    "fontFamily": "system-ui, sans-serif",
    "radius": 10,
    "glass": true,
    "waves": true
  }
}
```

Only the values above are accepted. Colors use hex notation. Themes cannot load remote assets or arbitrary code. The app validates the file before installing it.

## Notes

- Keep the file under 4 MB. Embedded background images must be under 3 MB as base64.
- A theme id must be unique and cannot be `default`.
- `radius: 0` and `glass: false` are the useful combination for pixel and retro styles.
- `waves: false` hides the animated background.
- `backgroundImage` accepts a self-contained `data:image/jpeg`, `data:image/png` or `data:image/webp` URL. Remote URLs are rejected.
- `decor: "pixel"` enables chunky borders, a grid and pixel image rendering. It is a built-in decorator, not custom CSS.
- `decor: "win98"` enables beveled panels, title-bar colors, sunken fields, square buttons and classic scrollbars.
- `decor: "aero"` enables the glossy Vista / Frutiger Aero glass treatment.
- The Pixel example uses the bundled OFL `Audit Pixel` font from `Public/fonts/Silkscreen-Regular.ttf`.
- The Win98 decor is inspired by [98.css](https://github.com/jdan/98.css), MIT licensed. The license is included in this folder.
- Other fonts must already be installed on the machine. Asset packaging is a future step.
- The Retro 98 example wallpaper is a free Pexels photo (ID 38130723) used under the Pexels license.
