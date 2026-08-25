# lilypond-mcp

[![npm](https://img.shields.io/npm/v/lilypond-mcp.svg)](https://www.npmjs.com/package/lilypond-mcp)

MCP server that engraves [GNU LilyPond](https://lilypond.org) sources into
placeable assets: cropped PDF, EPS, SVG, and PNG, sized to the music rather
than a full page — ready to drop into page-layout software such as InDesign.

Nothing to install beyond Node (24 or newer): without a local LilyPond,
the server fetches a WebAssembly build of the engine and engraves with
that.

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

That's the whole setup. On the first engrave without a local LilyPond, the
server downloads the engine (~35 MB, checksum-verified, cached under
`~/.cache/lilypond-mcp` — safe to delete at any time).

## Tools

- **`engrave_file`** — engrave a `.ly` file. Defaults to cropped PDF —
  the format to place in InDesign (fonts embedded and subsetted, all PDF
  boxes defined). Also returns a preview PNG an agent can look at.
- **`engrave_code`** — engrave LilyPond code passed inline, for iterating
  on a musical idea without touching disk.
- **`lilypond_version`** — the LilyPond version the server engraves with,
  for picking the right `\version` header.

Both engrave tools accept `formats` (`pdf`/`eps`/`svg`/`png`), `crop`,
`include_dirs` (for shared `\include` libraries), and `output_dir`. Paths
are resolved against the working directory the server is launched in — for
an `.mcp.json` entry, that is the project root. On failure the result
carries LilyPond's diagnostics, line numbers included, so an agent can fix
the source and retry.

## Two engraving backends

| | native | wasm |
|---|---|---|
| needs | `lilypond` (≥ 2.26) and `gs` on `PATH` | Node ≥ 24 |
| formats | pdf, eps, svg, png | pdf, eps, svg, png (engine ≥ p0.1.3; earlier engines: svg, eps) |
| engine | whatever is installed | [lilypond-wasi](https://github.com/wspringer/lilypond-wasi) release, pinned in `engine.json` |

(Node ≥ 24 for the wasm backend because `node:wasi` corrupts memory on
x86_64 Linux in older lines — [nodejs/node#53087](https://github.com/nodejs/node/issues/53087);
the server detects this and says so rather than crashing.)

The server picks automatically: native when an installed LilyPond responds,
wasm otherwise. Force one with `LILYPOND_MCP_BACKEND=native|wasm`.

PDF and PNG need Ghostscript/cairo, which cannot run inside WebAssembly —
for InDesign-ready PDFs, install LilyPond (the [Nix
flake](./flake.nix) in this repo provides a known-good one) or convert the
wasm backend's EPS on the host.

The wasm engine trails lilypond-wasi's stable releases: a weekly workflow
re-pins `engine.json` to the newest release, engraves with it as a real
consumer, and opens a PR.

## Development

```
direnv allow      # or: nix develop — provides node, lilypond 2.26, gs
npm install
npm run build     # tsc → dist/
npm test          # engraves real snippets with both backends*
```

\* wasm-backend tests need an engine dir:
`./test/assemble-engine-dir.sh /tmp/engine-dir ../lilypond-wasi stable`,
then `LILYPOND_MCP_ENGINE_DIR=/tmp/engine-dir npm test`.

Releases: conventional commits → Knope bot release PR → merge → npm
publish via OIDC trusted publishing (no tokens).

## Licence

MIT. The server orchestrates GPL-licensed engravers (LilyPond,
Ghostscript, and the lilypond-wasi WebAssembly build) as separate
programs, and the npm package contains none of their bytes — see
`LICENSING.md` for the analysis and the design rules that keep that
boundary clean.
