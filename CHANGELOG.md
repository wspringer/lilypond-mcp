# Changelog

Maintained by Knope from conventional commits.

## 0.1.3 (2026-08-25)

### Features

#### InDesign-ready PDF from the wasm engine — no native installs

The bundled WebAssembly engine now tracks
[lilypond-wasi stable/2.26.1-p0.1.3](https://github.com/wspringer/lilypond-wasi/releases/tag/stable%2F2.26.1-p0.1.3),
which carries LilyPond's cairo backend: cropped PDF and PNG straight
from the engine, with fonts subsetted the way InDesign accepts. The
PDF boxes InDesign's "Crop to" options need (Crop/Bleed/Trim/Art) are
stamped in pure JS, so Ghostscript is no longer required for any
backend. Every format — pdf, png, svg, eps — now works with nothing
installed beyond Node.

### Fixes

#### The wasm engine no longer crashes on Node 22.21.1+

Node 22.21.1 backported a `node:wasi` fast-call change
([nodejs/node#59600](https://github.com/nodejs/node/pull/59600)) that
makes wasm engines segfault during startup, on every platform. The
engine worker now always runs with `--no-turbo-fast-api-calls`, which
sidesteps the broken fast path — any Node ≥ 20 works.

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
