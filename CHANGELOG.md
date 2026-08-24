# Changelog

Maintained by Knope from conventional commits.

## 0.1.0

Initial release: MCP server engraving LilyPond sources into placeable
assets — cropped PDF for InDesign (fonts embedded via the cairo backend,
all PDF boxes stamped), EPS, SVG, and PNG — with two engraving backends:
the installed LilyPond when present, or the lilypond-wasi WebAssembly
engine fetched on demand (zero system dependencies, SVG + EPS).
