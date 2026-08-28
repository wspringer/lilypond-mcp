import { readFile } from "node:fs/promises";
import { engraveWasm, wasmEngineVersion } from "./engine/wasm-backend.js";
import type { EnginePin } from "./engine/manifest.js";

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
  /**
   * Directories of font files (.otf/.ttf) to make available to the engraving
   * beyond the bundled ones; select them in the score with
   * `property-defaults.fonts.serif = "Family"` etc.
   */
  fontDirs?: string[];
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

// ---------------------------------------------------------------------------
// Engine
//
// Every engrave runs the lilypond-wasi engine (pinned in engine.json) in a
// child Node process via node:wasi — nothing to install beyond Node, and
// the same LilyPond on every machine. See src/engine/wasm-backend.ts.
// ---------------------------------------------------------------------------

async function loadPin(): Promise<EnginePin> {
  const url = new URL("../engine.json", import.meta.url);
  return JSON.parse(await readFile(url, "utf8"));
}

export async function engrave(req: EngraveRequest): Promise<EngraveResult> {
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
  return engraveWasm(req, await loadPin());
}

export async function lilypondVersion(): Promise<string> {
  return wasmEngineVersion(await loadPin());
}
