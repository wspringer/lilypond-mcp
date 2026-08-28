import { spawn } from "node:child_process";
import { mkdir, readFile, rename, rm, stat } from "node:fs/promises";
import path from "node:path";

export type Format = "eps" | "pdf" | "svg" | "png";

export interface EngraveRequest {
  /** Path to the .ly source file. */
  source: string;
  /** Basename for the generated assets (no extension). */
  name: string;
  /** Directory the assets end up in; created if missing. */
  outputDir: string;
  formats: Format[];
  /**
   * Crop each asset to the music itself instead of a full page. This is
   * what you want for assets placed in a layout, and it also keeps the
   * output filenames predictable (uncropped runs write per-page
   * `NAME-1.eps`, `NAME-2.eps`, ... instead of a single `NAME.eps`).
   */
  crop: boolean;
  /** Extra include directories for \include resolution. */
  includeDirs: string[];
}

export interface EngraveResult {
  ok: boolean;
  /** Absolute path per successfully generated format. */
  outputs: Partial<Record<Format, string>>;
  /**
   * Cropped PNG rendering of the same music, always produced alongside the
   * requested formats. Read this file to see what was engraved.
   */
  previewPng?: string;
  /** LilyPond diagnostics (tail of stderr) when compilation fails. */
  errors?: string;
}

const RUN_TIMEOUT_MS = 120_000;

interface RunOutcome {
  code: number | null;
  stderr: string;
}

function runLilypond(args: string[], cwd: string): Promise<RunOutcome> {
  return new Promise((resolve, reject) => {
    const child = spawn("lilypond", args, {
      cwd,
      stdio: ["ignore", "ignore", "pipe"],
      timeout: RUN_TIMEOUT_MS,
    });
    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (code) => resolve({ code, stderr }));
  });
}

async function exists(p: string): Promise<boolean> {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

/** Prefer the cropped variant of an output file, falling back to the plain one. */
async function claimOutput(base: string, ext: string, crop: boolean): Promise<string | undefined> {
  const plain = `${base}.${ext}`;
  if (crop) {
    const cropped = `${base}.cropped.${ext}`;
    if (await exists(cropped)) {
      await rename(cropped, plain);
      return plain;
    }
  }
  return (await exists(plain)) ? plain : undefined;
}

function stderrTail(stderr: string, lines = 30): string {
  return stderr.trim().split("\n").slice(-lines).join("\n");
}

/**
 * Engrave a LilyPond source file.
 *
 * All formats come from the cairo backend in one pass — it writes PDF,
 * EPS, SVG and PNG directly and subsets its fonts. LilyPond 2.26 quirks
 * this function absorbs:
 * - uncropped runs write per-page `NAME-1.eps`; requesting EPS without
 *   crop is rejected up front rather than producing surprising names.
 * - Cropped outputs are named `NAME.cropped.EXT` next to a full-page
 *   sibling; the cropped one is renamed over the plain name.
 * - `lilypond -o` changes the working directory to the output directory,
 *   so include paths must be made absolute before the call.
 */
async function engraveNative(req: EngraveRequest): Promise<EngraveResult> {
  if (req.formats.length === 0) {
    return { ok: false, outputs: {}, errors: "no formats requested" };
  }
  if (req.formats.includes("eps") && !req.crop) {
    return {
      ok: false,
      outputs: {},
      errors: "EPS output requires crop=true: uncropped runs write per-page NAME-1.eps files",
    };
  }

  const source = path.resolve(req.source);
  if (!(await exists(source))) {
    return { ok: false, outputs: {}, errors: `source file not found: ${source}` };
  }
  const outputDir = path.resolve(req.outputDir);
  await mkdir(outputDir, { recursive: true });
  const base = path.join(outputDir, req.name);

  const commonArgs = [
    "-dno-point-and-click",
    ...(req.crop ? ["-dcrop"] : []),
    ...req.includeDirs.map((dir) => `-I${path.resolve(dir)}`),
    "-o",
    base,
    source,
  ];

  // Everything comes out of the cairo backend in a single pass: PDF, EPS,
  // SVG and PNG, with fonts subsetted. The older ps backend embedded whole
  // font programs — its cropped EPS came out 43x larger, in a form InDesign
  // refuses to render — and needed a Ghostscript pass for the preview PNG.
  // (Ghostscript still runs once afterwards, only to add PDF boxes.)
  const formats = new Set<Format>(req.formats);
  // The cropped PNG is what lets an agent look at what it engraved; on the
  // cairo backend it costs nothing extra.
  formats.add("png");

  const outcome = await runLilypond(
    ["-dbackend=cairo", `--formats=${[...formats].join(",")}`, ...commonArgs],
    process.cwd(),
  );
  if (outcome.code !== 0) {
    return { ok: false, outputs: {}, errors: stderrTail(outcome.stderr) };
  }

  const outputs: Partial<Record<Format, string>> = {};
  for (const fmt of req.formats) {
    const claimed = await claimOutput(base, fmt, req.crop);
    if (claimed) {
      outputs[fmt] = claimed;
    }
  }

  // Keep the cropped PNG as a preview, then drop the full-page leftovers
  // and any format the caller did not ask for.
  let previewPng = outputs.png;
  const strayPng = `${base}.cropped.png`;
  if (!previewPng && (await exists(strayPng))) {
    previewPng = `${base}.preview.png`;
    await rename(strayPng, previewPng);
  }
  for (const ext of ["pdf", "eps", "svg", "png"] as const) {
    await rm(`${base}.cropped.${ext}`, { force: true });
    if (!req.formats.includes(ext)) {
      await rm(`${base}.${ext}`, { force: true });
    }
  }

  // Cairo emits only a MediaBox; InDesign wants the others spelled out.
  if (outputs.pdf) {
    await stampPdfBoxes(outputs.pdf);
  }

  const missing = req.formats.filter((f) => !outputs[f]);
  if (missing.length > 0) {
    return {
      ok: false,
      outputs,
      previewPng,
      errors: `lilypond exited cleanly but produced no ${missing.join(", ")} output`,
    };
  }
  return { ok: true, outputs, previewPng };
}

/**
 * Give a PDF explicit CropBox/BleedBox/TrimBox/ArtBox entries matching its
 * MediaBox — in pure JS, no Ghostscript.
 *
 * Cairo writes only a MediaBox. The PDF spec says the others then *default*
 * to it, but InDesign does not apply that default: with the Place dialog
 * set to "Crop to: Bleed box" it refuses the file outright ("the bleed box
 * is not defined, or is empty").
 */
export async function stampPdfBoxes(pdfPath: string): Promise<void> {
  const { PDFDocument } = await import("pdf-lib");
  const doc = await PDFDocument.load(await readFile(pdfPath));
  for (const page of doc.getPages()) {
    const { x, y, width, height } = page.getMediaBox();
    page.setCropBox(x, y, width, height);
    page.setBleedBox(x, y, width, height);
    page.setTrimBox(x, y, width, height);
    page.setArtBox(x, y, width, height);
  }
  const { writeFile } = await import("node:fs/promises");
  await writeFile(pdfPath, await doc.save({ useObjectStreams: false }));
}

async function lilypondVersionNative(): Promise<string> {
  const outcome = await new Promise<{ stdout: string }>((resolve, reject) => {
    const child = spawn("lilypond", ["--version"], { stdio: ["ignore", "pipe", "ignore"] });
    let stdout = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.on("error", reject);
    child.on("close", () => resolve({ stdout }));
  });
  return outcome.stdout.split("\n")[0].trim();
}

// ---------------------------------------------------------------------------
// Backend selection
//
// "native" spawns the installed LilyPond (cairo backend: pdf/eps/svg/png,
// InDesign-ready PDF). "wasm" runs the lilypond-wasi engine via node:wasi —
// zero system dependencies; the same four formats on engines from p0.1.3
// (cairo), svg/eps only on earlier engines. Default: native when an
// installed LilyPond responds, otherwise wasm. Override with
// LILYPOND_MCP_BACKEND.
// ---------------------------------------------------------------------------

import { readFile as readFileForPin } from "node:fs/promises";
import { engraveWasm, wasmEngineVersion } from "./engine/wasm-backend.js";
import type { EnginePin } from "./engine/manifest.js";

export type Backend = "native" | "wasm";

let detected: Backend | undefined;

async function nativeAvailable(): Promise<boolean> {
  return new Promise((resolve) => {
    const child = spawn("lilypond", ["--version"], { stdio: "ignore", timeout: 10_000 });
    child.on("error", () => resolve(false));
    child.on("close", (code) => resolve(code === 0));
  });
}

export async function resolveBackend(): Promise<Backend> {
  const forced = process.env.LILYPOND_MCP_BACKEND;
  if (forced === "native" || forced === "wasm") return forced;
  if (detected) return detected;
  detected = (await nativeAvailable()) ? "native" : "wasm";
  return detected;
}

async function loadPin(): Promise<EnginePin> {
  const url = new URL("../engine.json", import.meta.url);
  return JSON.parse(await readFileForPin(url, "utf8"));
}

export async function engrave(req: EngraveRequest): Promise<EngraveResult> {
  const backend = await resolveBackend();
  if (backend === "wasm") {
    return engraveWasm(req, await loadPin());
  }
  return engraveNative(req);
}

export async function lilypondVersion(): Promise<string> {
  const backend = await resolveBackend();
  if (backend === "wasm") {
    return wasmEngineVersion(await loadPin());
  }
  return lilypondVersionNative();
}
