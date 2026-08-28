import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { engraveWasm } from "../src/engine/wasm-backend.js";
import { ENGINE_DIR } from "./engine-dir.js";

// Offline wasm-backend tests, straight at engraveWasm with a dummy pin
// (see engine-dir.ts for the skip rule).

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

  it("handles pdf according to the engine generation", async () => {
    const source = path.join(dir, "triad.ly");
    await writeFile(source, SNIPPET);
    const manifest = JSON.parse(
      await readFile(path.join(ENGINE_DIR!, "manifest.json"), "utf8"),
    );

    const result = await engraveWasm(
      { source, name: "triad", outputDir: path.join(dir, "out"), formats: ["pdf"], crop: true, includeDirs: [] },
      PIN,
    );
    if (manifest.formats.includes("pdf")) {
      // cairo-era engine: real PDF, boxes stamped, preview delivered
      expect(result.ok).toBe(true);
      const pdf = await readFile(result.outputs.pdf!, "latin1");
      for (const box of ["CropBox", "BleedBox", "TrimBox", "ArtBox"]) {
        expect(pdf).toContain(`/${box}`);
      }
      expect(result.previewPng).toBeDefined();
    } else {
      // pre-cairo engine: clear refusal pointing at the alternatives
      expect(result.ok).toBe(false);
      expect(result.errors).toContain("engine");
    }
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

describe.skipIf(!ENGINE_DIR)("engraveWasm font_dirs", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), "wasm-backend-fonts-"));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
    delete process.env.LILYPOND_MCP_DEBUG_JOB;
  });

  it("mounts each font dir at /fonts/N and registers it via a settings include", async () => {
    const fonts = path.join(dir, "fonts");
    await mkdir(fonts);
    const source = path.join(dir, "triad.ly");
    await writeFile(source, SNIPPET);

    process.env.LILYPOND_MCP_DEBUG_JOB = "1";
    const jobs: string[] = [];
    const spy = vi.spyOn(console, "error").mockImplementation((...a: unknown[]) => {
      if (a[0] === "JOB:") jobs.push(String(a[1]));
    });
    try {
      const result = await engraveWasm(
        { source, name: "triad", outputDir: path.join(dir, "out"), formats: ["svg"], crop: true, includeDirs: [], fontDirs: [fonts] },
        PIN,
      );
      expect(result.ok).toBe(true);
    } finally {
      spy.mockRestore();
    }

    expect(jobs.length).toBeGreaterThan(0);
    const job = JSON.parse(jobs[0]);
    expect(job.preopens["/fonts/0"]).toBe(fonts);
    const settings = job.args.find((a: string) => a.startsWith("-dinclude-settings="));
    expect(settings).toBeDefined();
    // The settings file lives in the writable work dir, not in the source.
    expect(settings).toMatch(/\/fonts\.ly$/);
  }, 120_000);
});
