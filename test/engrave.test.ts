import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { engrave, lilypondVersion } from "../src/lilypond.js";

// End-to-end through the public engrave() API, which always runs the wasm
// engine. Point LILYPOND_MCP_ENGINE_DIR at a dir made by
// test/assemble-engine-dir.sh (or a fetched cache); skipped otherwise so
// plain `npm test` needs neither network nor a wasi build.
const ENGINE_DIR = process.env.LILYPOND_MCP_ENGINE_DIR;

const SNIPPET = `\\version "2.26.0"
\\header { tagline = ##f }
\\score { \\new Staff { \\clef treble <c' e' g'>1 } }
`;

describe.skipIf(!ENGINE_DIR)("engrave", { timeout: 120_000 }, () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), "lilypond-mcp-test-"));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("produces a cropped, font-embedded EPS plus a preview PNG", async () => {
    const source = path.join(dir, "triad.ly");
    await writeFile(source, SNIPPET);

    const result = await engrave({
      source,
      name: "triad",
      outputDir: path.join(dir, "out"),
      formats: ["eps"],
      crop: true,
      includeDirs: [],
    });

    expect(result.ok).toBe(true);
    expect(result.outputs.eps).toBeDefined();
    expect(result.previewPng).toBeDefined();

    const eps = await readFile(result.outputs.eps!, "latin1");
    const bbox = eps.match(/%%BoundingBox: (-?\d+) (-?\d+) (-?\d+) (-?\d+)/);
    expect(bbox).not.toBeNull();
    // A cropped EPS is music-sized, not an A4 page (595x842 pt).
    const x1 = Number(bbox![3]);
    expect(x1).toBeLessThan(400);
    expect(eps).toContain("%%BeginResource: font");
  });

  it("stamps all PDF boxes for InDesign's Place dialog", async () => {
    const source = path.join(dir, "triad.ly");
    await writeFile(source, SNIPPET);

    const result = await engrave({
      source,
      name: "triad",
      outputDir: path.join(dir, "out"),
      formats: ["pdf"],
      crop: true,
      includeDirs: [],
    });

    expect(result.ok).toBe(true);
    const pdf = await readFile(result.outputs.pdf!, "latin1");
    for (const box of ["CropBox", "BleedBox", "TrimBox", "ArtBox"]) {
      expect(pdf).toContain(`/${box}`);
    }
  });

  it("produces pdf and svg in one call", async () => {
    const source = path.join(dir, "triad.ly");
    await writeFile(source, SNIPPET);

    const result = await engrave({
      source,
      name: "triad",
      outputDir: path.join(dir, "out"),
      formats: ["pdf", "svg"],
      crop: true,
      includeDirs: [],
    });

    expect(result.ok).toBe(true);
    expect(result.outputs.pdf).toMatch(/triad\.pdf$/);
    expect(result.outputs.svg).toMatch(/triad\.svg$/);

    const svg = await readFile(result.outputs.svg!, "utf8");
    // Glyphs must be outlines, not font references, for clean imports.
    expect(svg).not.toContain("font-family");
  });

  it("resolves \\include against include_dirs", async () => {
    const lib = path.join(dir, "lib");
    await rm(lib, { recursive: true, force: true });
    await writeFile(path.join(dir, "shared.ily"), `\\version "2.26.0" \\header { tagline = ##f }`).catch(
      () => undefined,
    );
    const source = path.join(dir, "uses-include.ly");
    await writeFile(source, `\\version "2.26.0"\n\\include "shared.ily"\n{ c'1 }`);

    const result = await engrave({
      source,
      name: "uses-include",
      outputDir: path.join(dir, "out"),
      formats: ["png"],
      crop: true,
      includeDirs: [dir],
    });

    expect(result.ok).toBe(true);
    expect(result.outputs.png).toBeDefined();
  });

  it("resolves \\include of a file beside the source without include_dirs", async () => {
    await writeFile(path.join(dir, "shared.ily"), `\\version "2.26.0" \\header { tagline = ##f }`);
    const source = path.join(dir, "uses-sibling.ly");
    await writeFile(source, `\\version "2.26.0"\n\\include "shared.ily"\n{ c'1 }`);

    const result = await engrave({
      source,
      name: "uses-sibling",
      outputDir: path.join(dir, "out"),
      formats: ["png"],
      crop: true,
      includeDirs: [],
    });

    expect(result.ok).toBe(true);
    expect(result.outputs.png).toBeDefined();
  });

  it("reports LilyPond diagnostics on broken input", async () => {
    const source = path.join(dir, "broken.ly");
    await writeFile(source, `\\version "2.26.0"\n{ c' nonsense-token }`);

    const result = await engrave({
      source,
      name: "broken",
      outputDir: path.join(dir, "out"),
      formats: ["eps"],
      crop: true,
      includeDirs: [],
    });

    expect(result.ok).toBe(false);
    expect(result.errors).toMatch(/error/i);
  });

  it("rejects EPS without crop up front", async () => {
    const source = path.join(dir, "triad.ly");
    await writeFile(source, SNIPPET);

    const result = await engrave({
      source,
      name: "triad",
      outputDir: path.join(dir, "out"),
      formats: ["eps"],
      crop: false,
      includeDirs: [],
    });

    expect(result.ok).toBe(false);
    expect(result.errors).toContain("crop");
  });
});

describe.skipIf(!ENGINE_DIR)("lilypondVersion", { timeout: 120_000 }, () => {
  it("reports a version banner", async () => {
    expect(await lilypondVersion()).toMatch(/LilyPond 2\.\d+/);
  });
});
