---
default: patch
---

#### `engines` now says Node ≥ 22, matching reality

The wasm engine uses WebAssembly exception handling (exnref) that V8
first shipped in Node 22 — on Node 20 it fails to compile. The declared
`engines` range claimed `>=20`; it now says `>=22` so npm warns before
the engine does.
