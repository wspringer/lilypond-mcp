// Every test engraves with the wasm engine, so every suite needs an engine
// dir: LILYPOND_MCP_ENGINE_DIR, pointing at a fetched cache
// (`node scripts/assemble-engine-dir.mjs` prints one) or a dir built by
// test/assemble-engine-dir.sh. Locally the suites skip without it; in CI a
// silent skip would go green having tested nothing, so it is an error.
export const ENGINE_DIR = process.env.LILYPOND_MCP_ENGINE_DIR;

if (process.env.CI && !ENGINE_DIR) {
  throw new Error(
    "LILYPOND_MCP_ENGINE_DIR is unset under CI — run `node scripts/assemble-engine-dir.mjs` after the build",
  );
}
