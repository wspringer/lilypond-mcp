---
default: minor
---

#### Custom fonts with `font_dirs`

Both engrave tools take `font_dirs`: directories of `.otf`/`.ttf` files to
make available beyond the bundled fonts. Pick a family in the score as
usual — `\paper { property-defaults.fonts.serif = "Tiempos Text" }` — and
the PDF embeds it. The score stays portable: no sandbox paths, no
`ly:font-config-add-directory` calls of your own.
