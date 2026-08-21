import { spawn } from "node:child_process";
import { mkdir, rename, rm, stat } from "node:fs/promises";
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
   * what you want for assets placed in a layout; it is also the only way
   * LilyPond 2.26 produces EPS at all.
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
   * Cropped PNG rendering of the same music, produced as a byproduct of
   * the PostScript backend. Read this file to see what was engraved.
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
 * LilyPond 2.26 quirks this function absorbs:
 * - EPS only comes out of the `ps` backend combined with `-dcrop`
 *   (`-dbackend=eps` no longer exists); requesting EPS without crop is
 *   rejected up front rather than silently producing nothing.
 * - SVG needs its own backend, so it runs as a second pass.
 * - Cropped outputs are named `NAME.cropped.EXT` next to a full-page
 *   sibling; the cropped one is renamed over the plain name.
 * - `lilypond -o` changes the working directory to the output directory,
 *   so include paths must be made absolute before the call.
 */
export async function engrave(req: EngraveRequest): Promise<EngraveResult> {
  if (req.formats.length === 0) {
    return { ok: false, outputs: {}, errors: "no formats requested" };
  }
  if (req.formats.includes("eps") && !req.crop) {
    return {
      ok: false,
      outputs: {},
      errors: "EPS output requires crop=true: LilyPond 2.26 only emits EPS as a cropped file",
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

  // The ps backend covers eps, pdf, and png in one run; svg has its own
  // backend and needs a separate pass.
  const psFormats = req.formats.filter((f) => f !== "svg");
  const wantsSvg = req.formats.includes("svg");

  if (psFormats.length > 0) {
    const outcome = await runLilypond(
      ["-dbackend=ps", `--formats=${psFormats.join(",")}`, ...commonArgs],
      process.cwd(),
    );
    if (outcome.code !== 0) {
      return { ok: false, outputs: {}, errors: stderrTail(outcome.stderr) };
    }
  }

  if (wantsSvg) {
    const outcome = await runLilypond(["--formats=svg", ...commonArgs], process.cwd());
    if (outcome.code !== 0) {
      return { ok: false, outputs: {}, errors: stderrTail(outcome.stderr) };
    }
  }

  const outputs: Partial<Record<Format, string>> = {};
  for (const fmt of req.formats) {
    const claimed = await claimOutput(base, fmt, req.crop);
    if (claimed) {
      outputs[fmt] = claimed;
    }
  }

  // Keep the cropped PNG as a preview; drop the PostScript intermediate
  // and any full-page leftovers nobody asked for.
  let previewPng = outputs.png;
  const strayPng = `${base}.cropped.png`;
  if (!previewPng && (await exists(strayPng))) {
    previewPng = `${base}.preview.png`;
    await rename(strayPng, previewPng);
  }
  for (const stray of [`${base}.ps`, `${base}.cropped.pdf`, `${base}.cropped.svg`, `${base}.cropped.png`]) {
    await rm(stray, { force: true });
  }
  if (!req.formats.includes("pdf")) {
    await rm(`${base}.pdf`, { force: true });
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

export async function lilypondVersion(): Promise<string> {
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
