---
default: patch
---

#### The wasm engine no longer crashes on Node 22.21.1+

Node 22.21.1 backported a `node:wasi` fast-call change
([nodejs/node#59600](https://github.com/nodejs/node/pull/59600)) that
makes wasm engines segfault during startup, on every platform. The
engine worker now always runs with `--no-turbo-fast-api-calls`, which
sidesteps the broken fast path — any Node ≥ 20 works.
