# lilypond-mcp

MCP server that engraves [GNU LilyPond](https://lilypond.org) sources into
placeable assets: cropped, self-contained EPS, PDF, SVG, and PNG, sized to the
music rather than a full page — ready to drop into page-layout software such
as InDesign.

## Tools

- **`engrave_file`** — engrave a `.ly` file. Defaults to cropped EPS in
  `build/`; also produces a preview PNG the agent can look at to verify the
  result.
- **`engrave_code`** — engrave LilyPond code passed inline, for iterating on a
  musical idea without touching disk. Defaults to PNG.
- **`lilypond_version`** — the LilyPond version the server engraves with, for
  picking the right `\version` header.

Both engrave tools accept `formats` (`eps`/`pdf`/`svg`/`png`), `crop`,
`include_dirs` (for shared `\include` libraries), and `output_dir`. Paths are
resolved against the working directory the server is launched in — for a
Claude Code `.mcp.json` entry, that is the project root.

On failure the result carries LilyPond's diagnostics, line numbers included,
so an agent can fix the source and retry.

## LilyPond 2.26 quirks this server absorbs

- EPS only exists as cropped output of the `ps` backend
  (`-dbackend=eps` is gone); EPS without `crop` is rejected up front.
- SVG has its own backend and runs as a second pass; glyphs come out as
  outlines, so no fonts need to be installed to view or import them.
- Cropped outputs (`NAME.cropped.EXT`) are renamed over the plain name and
  stray intermediates are cleaned up.
- `lilypond -o` changes the working directory, so include paths are made
  absolute before the call.

## Running

The server needs `node` (≥ 20) and `lilypond` on its `PATH`. With the bundled
Nix flake providing both, a consuming project's `.mcp.json` looks like:

```json
{
  "mcpServers": {
    "lilypond": {
      "command": "nix",
      "args": [
        "develop", "../lilypond-mcp",
        "--command", "node", "../lilypond-mcp/dist/index.js"
      ]
    }
  }
}
```

## Development

```
direnv allow      # or: nix develop
npm install
npm run build     # tsc → dist/
npm test          # vitest; engraves real snippets, needs lilypond on PATH
```

## Licence

MIT. The server orchestrates GPL-licensed engravers (LilyPond, Ghostscript)
as separate programs — see `LICENSING.md` for the analysis and the design
rules that keep the boundary clean.
