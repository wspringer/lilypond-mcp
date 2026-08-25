import { spawn } from "node:child_process";
import { copyFile, mkdir, mkdtemp, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { EngraveRequest, EngraveResult, Format } from "../lilypond.js";
import { stampPdfBoxes } from "../lilypond.js";
import { ensureEngine, mountHostPath } from "./fetch.js";
import type { EnginePin } from "./manifest.js";

/**
 * Engrave with the WebAssembly engine from lilypond-wasi releases — no
 * installed LilyPond, no Nix, no Ghostscript. The engine is fetched once
 * into a cache and executed in a child Node process via node:wasi.
 *
 * Formats: what the release manifest declares (svg, eps). PDF and PNG need
 * Ghostscript or cairo, neither of which exists in the wasm engine — the
 * native backend remains the path for those (and for InDesign-ready PDF).
 */

const RUN_TIMEOUT_MS = 120_000;

async function exists(p: string): Promise<boolean> {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

interface WorkerReply {
  exitCode?: number;
  error?: string;
  /** Tail of the engine's stderr — LilyPond's diagnostics live there. */
  stderr?: string;
}

function runWorker(
  job: object,
  opts: { withExnrefFlag: boolean },
): Promise<{ reply?: WorkerReply; badOption: boolean }> {
  // Compiled sibling in dist/; under vitest this file runs from src/, where
  // no compiled worker exists — fall back to the dist build.
  const candidates = [
    fileURLToPath(new URL("./worker.js", import.meta.url)),
    fileURLToPath(new URL("../../dist/engine/worker.js", import.meta.url)),
  ];
  const workerPath = candidates.find(existsSync);
  if (!workerPath) {
    throw new Error(`engine worker not built — run npm run build (looked at: ${candidates.join(", ")})`);
  }
  const execArgv = opts.withExnrefFlag ? ["--experimental-wasm-exnref"] : [];
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [...execArgv, workerPath, JSON.stringify(job)],
      { stdio: ["ignore", "pipe", "pipe"], timeout: RUN_TIMEOUT_MS },
    );
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (c) => (stdout += c));
    child.stderr.on("data", (c) => (stderr += c));
    child.on("error", reject);
    child.on("close", (code, signal) => {
      // Node without this experimental flag (it graduated) exits 9 with a
      // "bad option" message before our code runs — detect and let the
      // caller retry flagless.
      if (opts.withExnrefFlag && code === 9 && /bad option/i.test(stderr)) {
        resolve({ badOption: true });
        return;
      }
      const tail = stderr.trim().split("\n").slice(-30).join("\n");
      // No JSON on stdout means the worker process itself died (segfault,
      // OOM kill, V8 fatal) before it could report — do not mistake that
      // for a quiet engine exit.
      if (stdout.trim() === "") {
        reject(new Error(
          `engine worker crashed (exit ${code}, signal ${signal ?? "none"}) — ` +
          `this is a Node/V8-level failure, not a LilyPond error. Engine stderr tail:\n${tail}`,
        ));
        return;
      }
      try {
        const reply: WorkerReply = JSON.parse(stdout);
        reply.stderr = tail;
        resolve({ reply, badOption: false });
      } catch {
        reject(new Error(`engine worker produced unparseable output (exit ${code}): ${stderr.slice(-400)}`));
      }
    });
  });
}

/** Diagnostics for a nonzero engine exit: stderr tail AND the exit code —
 * a quiet death (no stderr past the banner) must still name the code. */
function engineFailure(reply: WorkerReply): string {
  return [reply.stderr, `wasm engine exited ${reply.exitCode}`].filter(Boolean).join("\n");
}

async function runEngine(job: object): Promise<WorkerReply> {
  const first = await runWorker(job, { withExnrefFlag: true });
  const second = first.badOption ? await runWorker(job, { withExnrefFlag: false }) : first;
  if (!second.reply) throw new Error("engine worker failed twice");
  if (second.reply.error) throw new Error(second.reply.error);
  return second.reply;
}

export async function engraveWasm(req: EngraveRequest, pin: EnginePin): Promise<EngraveResult> {
  const { dir, manifest } = await ensureEngine(pin);

  const unsupported = req.formats.filter((f) => !manifest.formats.includes(f));
  if (unsupported.length > 0) {
    return {
      ok: false,
      outputs: {},
      errors:
        `this engine release supports ${manifest.formats.join(", ")} — not ${unsupported.join(", ")}. ` +
        `Use the native backend (installed LilyPond), or a newer engine release, for those formats.`,
    };
  }
  // Engines from p0.1.3 onward carry the cairo backend: one pass for
  // everything, fonts subsetted, clean exits, and a free preview PNG.
  const hasCairo = manifest.formats.includes("pdf");

  const source = path.resolve(req.source);
  if (!(await exists(source))) {
    return { ok: false, outputs: {}, errors: `source file not found: ${source}` };
  }
  const outputDir = path.resolve(req.outputDir);
  await mkdir(outputDir, { recursive: true });

  const work = await mkdtemp(path.join(os.tmpdir(), "lilypond-mcp-wasm-"));
  try {
    for (const sub of ["home", "tmp", "cache/fontconfig", "lily-lib"]) {
      await mkdir(path.join(work, sub), { recursive: true });
    }
    await copyFile(source, path.join(work, "in.ly"));

    const preopens: Record<string, string> = {
      [manifest.writableDirectory]: work,
      "/src": path.dirname(source),
    };
    for (const mountPoint of Object.keys(manifest.mounts)) {
      preopens[mountPoint] = mountHostPath(dir, manifest, mountPoint);
    }
    const includeArgs: string[] = [];
    req.includeDirs.forEach((incl, i) => {
      // Two components on purpose: LilyPond's File_name parser mangles
      // single-component absolute dirs ("/inc") when assembling search
      // paths — parsed as root+basename, the concatenation misses. Deeper
      // paths ("/include/0") assemble correctly. Found the hard way; see
      // lilypond-wasi JOURNAL.md 2026-08-24.
      const guest = `/include/${i}`;
      preopens[guest] = path.resolve(incl);
      includeArgs.push(`-I${guest}`);
    });

    // Internal debugging affordance: extra engine arguments, space-split
    // (e.g. LILYPOND_MCP_EXTRA_ARGS="--verbose" for LilyPond's debug log).
    const extraArgs = (process.env.LILYPOND_MCP_EXTRA_ARGS ?? "").split(" ").filter(Boolean);
    const baseArgs = (formatArgs: string[]) => [
      manifest.argv0,
      "-dno-point-and-click",
      ...extraArgs,
      ...(req.crop ? ["-dcrop"] : []),
      ...includeArgs,
      ...formatArgs,
      "-o",
      `${manifest.writableDirectory}/out`,
      `${manifest.writableDirectory}/in.ly`,
    ];
    const job = (formatArgs: string[]) => {
      const j = {
        engineWasm: path.join(dir, "lilypond.wasm"),
        preopens,
        env: manifest.environment,
        args: baseArgs(formatArgs),
      };
      if (process.env.LILYPOND_MCP_DEBUG_JOB) {
        console.error("JOB:", JSON.stringify(j));
      }
      return j;
    };

    if (hasCairo) {
      const fmts = new Set<Format>(req.formats);
      fmts.add("png"); // preview, near-free on the cairo backend
      const reply = await runEngine(job(["-dbackend=cairo", `--formats=${[...fmts].join(",")}`]));
      if (reply.exitCode !== 0) {
        return { ok: false, outputs: {}, errors: engineFailure(reply) };
      }
    } else {
      if (req.formats.includes("svg")) {
        const reply = await runEngine(job(["--formats=svg"]));
        if (reply.exitCode !== 0) {
          return { ok: false, outputs: {}, errors: engineFailure(reply) };
        }
      }
      if (req.formats.includes("eps")) {
        // Known issue (see the release manifest): with -dcrop the run exits
        // nonzero AFTER writing complete EPS — trust the artifact instead.
        await runEngine(job(["-dbackend=ps", "--formats=eps"]));
      }
    }

    const outputs: Partial<Record<Format, string>> = {};
    for (const fmt of req.formats) {
      const cropped = path.join(work, `out.cropped.${fmt}`);
      const plain = path.join(work, `out.${fmt}`);
      const produced = (req.crop && (await exists(cropped))) ? cropped : (await exists(plain)) ? plain : undefined;
      if (produced) {
        const dest = path.join(outputDir, `${req.name}.${fmt}`);
        await rm(dest, { force: true });
        await copyFile(produced, dest);
        outputs[fmt] = dest;
      }
    }

    // Preview PNG (cairo engines only) + InDesign box stamping, same as
    // the native backend.
    let previewPng: string | undefined = outputs.png;
    if (hasCairo && !previewPng) {
      const cand = path.join(work, req.crop ? "out.cropped.png" : "out.png");
      if (await exists(cand)) {
        previewPng = path.join(outputDir, `${req.name}.preview.png`);
        await rm(previewPng, { force: true });
        await copyFile(cand, previewPng);
      }
    }
    if (outputs.pdf) {
      await stampPdfBoxes(outputs.pdf);
    }

    const missing = req.formats.filter((f) => !outputs[f]);
    if (missing.length > 0) {
      return { ok: false, outputs, previewPng, errors: `wasm engine produced no ${missing.join(", ")} output` };
    }
    return { ok: true, outputs, previewPng };
  } finally {
    await rm(work, { recursive: true, force: true });
  }
}

export async function wasmEngineVersion(pin: EnginePin): Promise<string> {
  const { manifest } = await ensureEngine(pin);
  return `GNU LilyPond ${manifest.lilypond} (wasm, ${manifest.variant} line, recipe ${manifest.recipe})`;
}
