---
default: major
---

#### The WebAssembly engine is now the only engraver

The native backend — spawning an installed `lilypond` — is gone. Every
engrave runs the pinned lilypond-wasi engine, on every platform, with the
same formats (PDF, EPS, SVG, PNG) and the same InDesign-ready PDF.

Breaking: `LILYPOND_MCP_BACKEND` is no longer recognised, and a LilyPond on
`PATH` is ignored. Nothing needs installing beyond Node 22+; the engine is
downloaded on first use and cached under `~/.cache/lilypond-mcp`.
