# Changelog

Maintained by Knope from conventional commits.

## 0.2.0 (2026-08-28)

### Breaking Changes

#### The WebAssembly engine is now the only engraver

The native backend — spawning an installed `lilypond` — is gone. Every
engrave runs the pinned lilypond-wasi engine, on every platform, with the
same formats (PDF, EPS, SVG, PNG) and the same InDesign-ready PDF.

Breaking: `LILYPOND_MCP_BACKEND` is no longer recognised, and a LilyPond on
`PATH` is ignored. Nothing needs installing beyond Node 22+; the engine is
downloaded on first use and cached under `~/.cache/lilypond-mcp`.

### Fixes

#### `\include` of a file beside the source now resolves

`\include "shared.ily"` next to the `.ly` being engraved works without
listing its directory in `include_dirs`, as it does when running LilyPond
by hand.

## 0.1.4 (2026-08-25)

### Fixes

#### `engines` now says Node ≥ 22, matching reality

The wasm engine uses WebAssembly exception handling (exnref) that V8
first shipped in Node 22 — on Node 20 it fails to compile. The declared
`engines` range claimed `>=20`; it now says `>=22` so npm warns before
the engine does.

#### The wasm engine now works on Windows

Three separate walls stood between Windows and a working engine, all
gone:

- extracting the engine shelled out to `tar` and `chmod` — `chmod` does
  not exist on Windows, and whichever `tar` PATH serves up (GNU, bsdtar,
  Git's MSYS tar) has its own path dialect and mode quirks. Extraction
  is now pure JS (node-tar, the same engine npm uses), assuming no
  system tools at all;
- Node's WASI implementation has no `fd_readdir` on Windows (ENOSYS), so
  fontconfig found no fonts and the engine aborted — the worker now
  polyfills directory listing on Windows.

CI runs the wasm suite on `windows-latest` to keep it working.

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
