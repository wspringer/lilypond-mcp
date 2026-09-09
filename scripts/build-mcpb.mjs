#!/usr/bin/env node
/**
 * Build the Claude Desktop extension: build/lilypond-mcp-<version>.mcpb
 *
 * The bundle is self-contained — the pinned wasm engine is baked in and
 * manifest.json points LILYPOND_MCP_ENGINE_DIR at it, so the extension
 * never touches the network. manifest.json is generated here from
 * package.json + the tool sources' metadata, never written by hand.
 *
 * Layout inside the bundle:
 *   manifest.json
 *   icon.png
 *   server/            package.json + dist/ + engine.json + node_modules
 *   engine/            the assembled engine dir (same layout the cache uses)
 */
import { execFileSync } from "node:child_process";
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(new URL("../package.json", import.meta.url)));
const staging = path.join(root, "build", "mcpb");

const pkg = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
const out = path.join(root, "build", `lilypond-mcp-${pkg.version}.mcpb`);

console.error("assembling engine dir (downloads on first run)...");
const engineDir = execFileSync("node", [path.join(root, "scripts", "assemble-engine-dir.mjs")], {
  encoding: "utf8",
}).trim();

await rm(staging, { recursive: true, force: true });
await mkdir(path.join(staging, "server"), { recursive: true });

await cp(path.join(root, "dist"), path.join(staging, "server", "dist"), { recursive: true });
for (const f of ["package.json", "package-lock.json", "engine.json"]) {
  await cp(path.join(root, f), path.join(staging, "server", f));
}
console.error("installing production dependencies...");
execFileSync("npm", ["ci", "--omit=dev", "--ignore-scripts", "--no-audit", "--no-fund"], {
  cwd: path.join(staging, "server"),
  stdio: ["ignore", "ignore", "inherit"],
});

console.error("copying engine...");
await cp(engineDir, path.join(staging, "engine"), { recursive: true });
await cp(path.join(root, "assets", "icon.png"), path.join(staging, "icon.png"));

// The tools' names/descriptions come from the built server itself, so the
// manifest can never disagree with what tools/list will report.
const { makeEngraveCodeTool } = await import(path.join(root, "dist", "tools", "engrave_code.js"));
const { makeEngraveFileTool } = await import(path.join(root, "dist", "tools", "engrave_file.js"));
const { makeVersionTool } = await import(path.join(root, "dist", "tools", "version.js"));
const tools = [makeEngraveFileTool(), makeEngraveCodeTool(), makeVersionTool()].map((t) => ({
  name: t.name,
  description: t.description,
}));

const manifest = {
  manifest_version: "0.3",
  name: pkg.name,
  display_name: "LilyPond",
  version: pkg.version,
  description: pkg.description,
  long_description:
    "Engraves GNU LilyPond music notation into placeable assets: PDF (InDesign-ready, " +
    "fonts subsetted and all boxes stamped), SVG, PNG, and EPS. Runs a WebAssembly build " +
    "of LilyPond bundled inside the extension — nothing to install, no network access, " +
    "identical output on every machine.",
  author: { name: "Wilfred Springer", email: "wilfred@eastpole.nl", url: pkg.homepage },
  repository: { type: "git", url: "https://github.com/wspringer/lilypond-mcp" },
  homepage: pkg.homepage,
  documentation: pkg.homepage,
  support: pkg.bugs.url,
  license: pkg.license,
  icon: "icon.png",
  server: {
    type: "node",
    entry_point: "server/dist/index.js",
    mcp_config: {
      command: "node",
      args: ["${__dirname}/server/dist/index.js"],
      env: { LILYPOND_MCP_ENGINE_DIR: "${__dirname}/engine" },
    },
  },
  tools,
  keywords: pkg.keywords,
  compatibility: { runtimes: { node: ">=22" } },
  privacy_policies: ["https://github.com/wspringer/lilypond-mcp#privacy-policy"],
};
await writeFile(path.join(staging, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");

console.error("packing...");
await rm(out, { force: true });
execFileSync("npx", ["mcpb", "pack", staging, out], { stdio: ["ignore", "inherit", "inherit"] });
console.log(out);
