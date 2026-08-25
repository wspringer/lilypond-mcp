---
default: minor
---

#### InDesign-ready PDF from the wasm engine — no native installs

The bundled WebAssembly engine now tracks
[lilypond-wasi stable/2.26.1-p0.1.3](https://github.com/wspringer/lilypond-wasi/releases/tag/stable%2F2.26.1-p0.1.3),
which carries LilyPond's cairo backend: cropped PDF and PNG straight
from the engine, with fonts subsetted the way InDesign accepts. The
PDF boxes InDesign's "Crop to" options need (Crop/Bleed/Trim/Art) are
stamped in pure JS, so Ghostscript is no longer required for any
backend. Every format — pdf, png, svg, eps — now works with nothing
installed beyond Node.
