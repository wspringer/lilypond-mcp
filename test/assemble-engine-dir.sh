#!/usr/bin/env bash
# Assemble a local engine cache dir (the layout ensureEngine produces) from
# a lilypond-wasi checkout's nix outputs, for offline testing of the wasm
# backend:
#
#   ./test/assemble-engine-dir.sh /tmp/engine-dir ../lilypond-wasi stable
#   LILYPOND_MCP_ENGINE_DIR=/tmp/engine-dir npm test
set -euo pipefail

dest="${1:?dest dir}"
wasi_repo="${2:-../lilypond-wasi}"
variant="${3:-stable}"

suffix=""
[ "$variant" = "stable" ] && suffix="-stable"

engine=$(nix build "$wasi_repo#lilypond$suffix" --print-out-paths)
assets=$(nix build "$wasi_repo#assets$suffix" --print-out-paths)
bytecode=$(nix build "$wasi_repo#bytecode$suffix" --print-out-paths)
guile=$(nix build "$wasi_repo#wasi-guile.out" --print-out-paths)
version=$(nix eval --raw "$wasi_repo#lilypond$suffix.version")

rm -rf "$dest"
mkdir -p "$dest/mounts/_lilypond" "$dest/mounts/_lily-ccache" "$dest/mounts/_guile-ccache"
cp "$engine/bin/lilypond.wasm" "$dest/lilypond.wasm"
cp -R "$assets/share/lilypond" "$dest/mounts/_lilypond/lilypond"
cp -R "$bytecode/ccache" "$dest/mounts/_lily-ccache/ccache"
cp -R "$guile/lib/guile/3.0/ccache" "$dest/mounts/_guile-ccache/ccache"
chmod -R u+w "$dest"

cat > "$dest/manifest.json" <<EOF
{
  "schemaVersion": 1,
  "lilypond": "${version%%+*}",
  "variant": "$variant",
  "recipe": "local",
  "wasi": "preview1",
  "wasmExceptions": "exnref",
  "engine": "lilypond.wasm",
  "argv0": "/lilypond",
  "writableDirectory": "/work",
  "mounts": {
    "/lilypond": { "asset": "local", "path": "lilypond" },
    "/lily-ccache": { "asset": "local", "path": "ccache" },
    "/guile-ccache": { "asset": "local", "path": "ccache" }
  },
  "environment": {
    "FONTCONFIG_FILE": "/lilypond/fonts/fonts.conf",
    "FONTCONFIG_PATH": "/lilypond/fonts",
    "GUILE_AUTO_COMPILE": "0",
    "GUILE_LOAD_PATH": "/guile",
    "GUILE_LOAD_COMPILED_PATH": "/guile-ccache:/lily-ccache",
    "GUILE_SYSTEM_PATH": "/guile",
    "GUILE_SYSTEM_COMPILED_PATH": "/guile-ccache",
    "HOME": "/work/home",
    "LILYPOND_DATADIR": "/lilypond",
    "LILYPOND_LIBDIR": "/work/lily-lib",
    "TMPDIR": "/work/tmp",
    "XDG_CACHE_HOME": "/work/cache"
  },
  "formats": ["pdf", "png", "svg", "eps"]
}
EOF
echo "engine dir ready: $dest (LilyPond ${version})"
