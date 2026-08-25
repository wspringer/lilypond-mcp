# lilypond-mcp

MCP server that engraves LilyPond sources into placeable assets (PDF, EPS,
SVG, PNG). Two backends: native (installed `lilypond` + `gs`) and wasm
(engine fetched from [lilypond-wasi](https://github.com/wspringer/lilypond-wasi)
releases, pinned in `engine.json`). See `README.md` for the user-facing
story and `LICENSING.md` for why this repo is MIT around a GPL engine.

## Working practices

- **Feature branches + PRs, never direct pushes to `main`.** Branch
  protection enforces this; the `test` check is required.
- **Document every user-facing change with a change file** (Knope's
  changesets): run `knope document-change`, or write
  `.changeset/<slug>.md` by hand:

  ```markdown
  ---
  default: minor
  ---

  #### One-line summary for the changelog

  Optional detail paragraphs, written for npm users.
  ```

  Bump types: `major` (breaking), `minor` (feature), `patch` (fix).
  Change files are the **only** source of release semantics
  (`[changes] ignore_conventional_commits = true` in knope.toml): commit
  subjects never bump versions or write changelog entries. A user-facing
  change without a change file silently ships undocumented — don't.
  Conventional PR titles (`fix:`, `feat:`, `ci:`) remain as history
  hygiene, nothing more.
- **Releases:** the Knope bot keeps a release PR open; merging it tags,
  writes the changelog, and `release.yml` publishes to npm via trusted
  publishing (OIDC). Never `npm publish` by hand.

## Gotchas that cost real time

- **`node:wasi` fast calls corrupt memory from Node 22.21.1** (the
  WasiFunction fast-call signature backport, nodejs/node#59600): the
  engine segfaults during Guile startup, all platforms, with empty
  stderr. The worker always runs with `--no-turbo-fast-api-calls`, which
  sidesteps it — never remove that flag without re-bisecting. (Node 24
  is unaffected either way.)
- **PRs opened with `GITHUB_TOKEN` (e.g. by trail-engine.yml) don't
  trigger workflows**, so required checks never run on them. Nudge with
  an empty commit pushed by a real user, or set a `GH_PAT` secret (the
  workflow already prefers it).
- InDesign needs the PDF (fonts subsetted, all boxes stamped) — never
  hand it LilyPond EPS.

## Tests

`nix develop --command npm test` — native suite needs the dev shell
(LilyPond 2.26 + gs). Wasm suite is skipped unless
`LILYPOND_MCP_ENGINE_DIR` points at an engine dir
(`test/assemble-engine-dir.sh` builds one from a lilypond-wasi checkout).
