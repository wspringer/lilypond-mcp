# lilypond-mcp

[![npm](https://img.shields.io/npm/v/lilypond-mcp.svg)](https://www.npmjs.com/package/lilypond-mcp)

MCP server that engraves [GNU LilyPond](https://lilypond.org) sources into
placeable assets: cropped PDF, EPS, SVG, and PNG, sized to the music rather
than a full page — ready to drop into page-layout software such as InDesign.

Nothing to install beyond Node: the server fetches a WebAssembly build of
LilyPond on first use and engraves with that — the same engine on every
machine.

## Quick start

Claude Code — `.mcp.json` in your project:

```json
{
  "mcpServers": {
    "lilypond": {
      "command": "npx",
      "args": ["-y", "lilypond-mcp@latest"]
    }
  }
}
```

Claude Desktop — `claude_desktop_config.json`, same entry under
`mcpServers`.

That's the whole setup. On the first engrave, the server downloads the
engine (~35 MB, checksum-verified, cached under
`~/.cache/lilypond-mcp` — safe to delete at any time).

## Tools

- **`engrave_file`** — engrave a `.ly` file. Defaults to cropped PDF —
  the format to place in InDesign (fonts embedded and subsetted, all PDF
  boxes defined). Also returns a preview PNG, both as a file and inline
  as an image in the tool result, so the agent sees what it engraved.
- **`engrave_code`** — engrave LilyPond code passed inline, for iterating
  on a musical idea without touching disk.
- **`lilypond_version`** — the LilyPond version the server engraves with,
  for picking the right `\version` header.

Both engrave tools accept `formats` (`pdf`/`eps`/`svg`/`png`), `crop`,
`include_dirs` (for shared `\include` libraries), `output_dir`, and
`preview` (default on; turn off to skip the inline image on batch runs). Paths
are resolved against the working directory the server is launched in — for
an `.mcp.json` entry, that is the project root. On failure the result
carries LilyPond's diagnostics, line numbers included, so an agent can fix
the source and retry.

## What you get

This snippet, sent to `engrave_code`:

```lilypond
\version "2.26.0"
\header { tagline = ##f }

\score {
  <<
    \new ChordNames \chordmode { g2. | c | d | g }
    \new Staff \new Voice = "m" \relative c'' {
      \key g \major
      \time 3/4
      \tempo "Waltz" 4 = 132
      g4 b d | e4.( d8) c4 | a4 fis d | g2 r4 \bar "|."
    }
    \new Lyrics \lyricsto "m" { Round and round the waltz goes, old and slow. }
  >>
  \layout { indent = 0 }
}
```

comes back cropped to the music, as PDF, EPS, SVG or PNG — this is the SVG:

<img src="https://raw.githubusercontent.com/wspringer/lilypond-mcp/main/docs/example.svg" alt="Four bars of a waltz in G major with chord names and lyrics, engraved by LilyPond" width="600">

(Source in [`docs/example.ly`](docs/example.ly).)

[![Works great with Sidekick for InDesign](docs/sidekick-banner.svg)](https://sidekick.eastpole.nl?utm_source=github&utm_medium=readme&utm_campaign=lilypond-mcp)

## Engine

Engraving runs a WebAssembly build of LilyPond from
[lilypond-wasi](https://github.com/wspringer/lilypond-wasi) releases,
pinned in `engine.json` and executed in a child Node process via
`node:wasi`. Node 22 or newer: the engine uses WebAssembly exception
handling that V8 first shipped in Node 22. (The `node:wasi` fast-call
regression in Node 22.21.1+ —
[nodejs/node#59600](https://github.com/nodejs/node/pull/59600) — is
sidestepped automatically with `--no-turbo-fast-api-calls`.)

The engine trails lilypond-wasi's stable releases: a weekly workflow
re-pins `engine.json` to the newest release, engraves with it as a real
consumer, and opens a PR.

## Development

```
npm install
npm run build     # tsc → dist/
npm test          # engraves real snippets with the wasm engine*
```

\* The tests need an engine dir and skip without one. Either download the
pinned release into the cache — `node scripts/assemble-engine-dir.mjs`
prints the dir — or build one from a lilypond-wasi checkout:
`./test/assemble-engine-dir.sh /tmp/engine-dir ../lilypond-wasi stable`.
Then `LILYPOND_MCP_ENGINE_DIR=<dir> npm test`.

Releases: conventional commits → Knope bot release PR → merge → npm
publish via OIDC trusted publishing (no tokens).

## Licence

MIT. The server runs a GPL-licensed engraver (the lilypond-wasi
WebAssembly build of GNU LilyPond) as a separate program, and the npm
package contains none of its bytes — see
`LICENSING.md` for the analysis and the design rules that keep that
boundary clean.
