import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { engraveWasm } from "../src/engine/wasm-backend.js";

// Offline wasm-backend tests. Point LILYPOND_MCP_ENGINE_DIR at a dir made
// by test/assemble-engine-dir.sh (or a real fetched cache); skipped
// otherwise so plain `npm test` needs neither network nor a wasi build.
const ENGINE_DIR = process.env.LILYPOND_MCP_ENGINE_DIR;

const PIN = { repository: "local/test", tag: "local", sha256: {} };

const SNIPPET = `\\version "2.26.0"
\\header { tagline = ##f }
\\score { \\new Staff { \\clef treble <c' e' g'>1 } \\layout { indent = 0 } }
`;

describe.skipIf(!ENGINE_DIR)("engraveWasm", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), "wasm-backend-test-"));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("engraves svg and eps with no installed lilypond", async () => {
    const source = path.join(dir, "triad.ly");
    await writeFile(source, SNIPPET);

    const result = await engraveWasm(
      { source, name: "triad", outputDir: path.join(dir, "out"), formats: ["svg", "eps"], crop: true, includeDirs: [] },
      PIN,
    );

    expect(result.ok).toBe(true);
    const svg = await readFile(result.outputs.svg!, "utf8");
    expect(svg).toContain("<svg");
    const eps = await readFile(result.outputs.eps!, "latin1");
    expect(eps).toContain("%%BoundingBox");
    expect(eps.trimEnd().endsWith("%%EOF")).toBe(true);
  }, 120_000);

  it("resolves \\include through include_dirs mounts", async () => {
    const lib = path.join(dir, "lib");
    await rm(lib, { recursive: true, force: true });
    await writeFile(path.join(dir, "shared.ily"), `\\version "2.26.0"\n\\header { tagline = ##f }`);
    const source = path.join(dir, "uses.ly");
    await writeFile(source, `\\version "2.26.0"\n\\include "shared.ily"\n{ c'1 }`);

    const result = await engraveWasm(
      { source, name: "uses", outputDir: path.join(dir, "out"), formats: ["svg"], crop: true, includeDirs: [dir] },
      PIN,
    );
    expect(result.ok).toBe(true);
  }, 120_000);

  it("refuses formats the engine cannot produce, pointing at native", async () => {
    const source = path.join(dir, "triad.ly");
    await writeFile(source, SNIPPET);

    const result = await engraveWasm(
      { source, name: "triad", outputDir: path.join(dir, "out"), formats: ["pdf"], crop: true, includeDirs: [] },
      PIN,
    );
    expect(result.ok).toBe(false);
    expect(result.errors).toContain("native backend");
  }, 120_000);

  it("reports diagnostics on broken input", async () => {
    const source = path.join(dir, "broken.ly");
    await writeFile(source, `\\version "2.26.0"\n{ c' garbage-token }`);

    const result = await engraveWasm(
      { source, name: "broken", outputDir: path.join(dir, "out"), formats: ["svg"], crop: true, includeDirs: [] },
      PIN,
    );
    expect(result.ok).toBe(false);
  }, 120_000);
});
