# Changelog

Maintained by Knope from conventional commits.

## 0.1.2 (2026-08-25)

### Fixes

- engine cache is evictable and self-healing

## 0.1.1 (2026-08-25)

### Features

- pin the wasm engine to stable/2.26.1-p0.1.2 and trail it weekly
- WebAssembly engine backend — engrave with zero system dependencies

## 0.1.0

Initial release: MCP server engraving LilyPond sources into placeable
assets — cropped PDF for InDesign (fonts embedded via the cairo backend,
all PDF boxes stamped), EPS, SVG, and PNG — with two engraving backends:
the installed LilyPond when present, or the lilypond-wasi WebAssembly
engine fetched on demand (zero system dependencies, SVG + EPS).
