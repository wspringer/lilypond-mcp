---
default: patch
---

#### The wasm engine now works on Windows

Three separate walls stood between Windows and a working engine, all
gone:

- extracting the engine shelled out to `chmod`, which does not exist on
  Windows — the permission restore is now pure Node;
- the extraction could resolve to Git's MSYS tar, which reads `C:\...`
  as a remote host — tarballs are now fed over stdin with no host paths
  in the arguments;
- Node's WASI implementation has no `fd_readdir` on Windows (ENOSYS), so
  fontconfig found no fonts and the engine aborted — the worker now
  polyfills directory listing on Windows.

CI runs the wasm suite on `windows-latest` to keep it working.
