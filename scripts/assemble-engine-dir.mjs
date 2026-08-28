// Download the pinned engine release into the cache exactly as a consumer
// would, then export LILYPOND_MCP_ENGINE_DIR so the test suites run against
// it. CI helper; run after `npm run build`.
//
//   node scripts/assemble-engine-dir.mjs
//
// Appends to $GITHUB_ENV when set (GitHub Actions), and always prints the
// dir so a shell can capture it: LILYPOND_MCP_ENGINE_DIR=$(node scripts/...).
import { appendFile, readFile } from "node:fs/promises";
import { ensureEngine } from "../dist/engine/fetch.js";

const pin = JSON.parse(await readFile(new URL("../engine.json", import.meta.url), "utf8"));
const { dir } = await ensureEngine(pin);
if (process.env.GITHUB_ENV) {
  await appendFile(process.env.GITHUB_ENV, `LILYPOND_MCP_ENGINE_DIR=${dir}\n`);
}
console.log(dir);
