---
default: patch
---

#### The wasm engine now installs on Windows

Extracting the engine used to shell out to `chmod`, which does not exist
on Windows — the engine cache could never even be created there. The
permission restore is now pure Node, and CI runs the wasm suite on
Windows to keep it that way.
