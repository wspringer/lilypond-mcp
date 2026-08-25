---
default: patch
---

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
