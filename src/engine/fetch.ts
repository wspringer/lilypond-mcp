import { createHash } from "node:crypto";
import { createWriteStream } from "node:fs";
import { mkdir, readFile, rename, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { spawn } from "node:child_process";
import type { EnginePin, RuntimeManifest } from "./manifest.js";

/**
 * Materialize the pinned engine release into a local cache directory and
 * return { dir, manifest }. Idempotent: a completed cache is reused.
 *
 * Layout of the cache dir after extraction:
 *   lilypond.wasm       the engine
 *   manifest.json       the release's runtime-manifest.json
 *   mounts/<name>/      one extracted directory per tarball mount
 *
 * Everything is downloaded from the release, verified against the pinned
 * sha256s, and extracted with the system `tar`. The npm package itself
 * ships none of it — see LICENSING.md.
 */

function cacheRoot(): string {
  const xdg = process.env.XDG_CACHE_HOME;
  const base = xdg && xdg.trim() !== "" ? xdg : path.join(os.homedir(), ".cache");
  return path.join(base, "lilypond-mcp", "engine");
}

async function exists(p: string): Promise<boolean> {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

async function download(url: string, dest: string): Promise<void> {
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok || !res.body) {
    throw new Error(`download failed (${res.status}) for ${url}`);
  }
  await pipeline(res.body as unknown as NodeJS.ReadableStream, createWriteStream(dest));
}

async function sha256Of(file: string): Promise<string> {
  const hash = createHash("sha256");
  hash.update(await readFile(file));
  return hash.digest("hex");
}

async function extractTarGz(tarball: string, into: string): Promise<void> {
  await mkdir(into, { recursive: true });
  await new Promise<void>((resolve, reject) => {
    const child = spawn("tar", ["-xzf", tarball, "-C", into], { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    child.stderr.on("data", (c) => (stderr += c));
    child.on("error", reject);
    child.on("close", (code) =>
      code === 0 ? resolve() : reject(new Error(`tar failed (${code}): ${stderr.trim()}`)),
    );
  });
}

export interface EngineDir {
  dir: string;
  manifest: RuntimeManifest;
}

export async function ensureEngine(pin: EnginePin): Promise<EngineDir> {
  // Escape hatch for tests and offline/nix use: point at a pre-assembled
  // cache directory (same layout as below) and skip the network entirely.
  const override = process.env.LILYPOND_MCP_ENGINE_DIR;
  if (override) {
    const manifest = JSON.parse(await readFile(path.join(override, "manifest.json"), "utf8"));
    return { dir: override, manifest };
  }

  const slug = pin.tag.replace(/[^a-zA-Z0-9._-]+/g, "-");
  const dir = path.join(cacheRoot(), slug);
  const readyMarker = path.join(dir, ".ready");
  if (await exists(readyMarker)) {
    const manifest = JSON.parse(await readFile(path.join(dir, "manifest.json"), "utf8"));
    return { dir, manifest };
  }

  // Build into a temp sibling, promote atomically on success.
  const work = `${dir}.download-${process.pid}`;
  await rm(work, { recursive: true, force: true });
  await mkdir(work, { recursive: true });
  try {
    const base = `https://github.com/${pin.repository}/releases/download/${pin.tag}`;

    const fetchVerified = async (asset: string): Promise<string> => {
      const dest = path.join(work, asset);
      await download(`${base}/${asset}`, dest);
      const expected = pin.sha256[asset];
      if (!expected) throw new Error(`no pinned sha256 for ${asset}`);
      const actual = await sha256Of(dest);
      if (actual !== expected) {
        throw new Error(`sha256 mismatch for ${asset}: expected ${expected}, got ${actual}`);
      }
      return dest;
    };

    const manifestFile = await fetchVerified("runtime-manifest.json");
    const manifest: RuntimeManifest = JSON.parse(await readFile(manifestFile, "utf8"));
    if (manifest.schemaVersion !== 1) {
      throw new Error(`unsupported runtime-manifest schemaVersion ${manifest.schemaVersion}`);
    }
    await rename(manifestFile, path.join(work, "manifest.json"));

    const engineFile = await fetchVerified(manifest.engine);
    await rename(engineFile, path.join(work, "lilypond.wasm"));

    for (const [mountPoint, source] of Object.entries(manifest.mounts)) {
      const tarball = await fetchVerified(source.asset);
      const mountDir = path.join(work, "mounts", mountPoint.replace(/\//g, "_"));
      await extractTarGz(tarball, mountDir);
      if (!(await exists(path.join(mountDir, source.path)))) {
        throw new Error(`${source.asset} did not contain expected path ${source.path}`);
      }
      await rm(tarball, { force: true });
    }

    await rename(work, dir).catch(async (e) => {
      // lost the race against a concurrent fetch — theirs is as good as ours
      if (await exists(readyMarker)) return;
      throw e;
    });
    const fs = await import("node:fs/promises");
    await fs.writeFile(readyMarker, pin.tag);
    const manifestOut = JSON.parse(await readFile(path.join(dir, "manifest.json"), "utf8"));
    return { dir, manifest: manifestOut };
  } finally {
    await rm(work, { recursive: true, force: true });
  }
}

/** Host path for a manifest mount point inside an engine cache dir. */
export function mountHostPath(dir: string, manifest: RuntimeManifest, mountPoint: string): string {
  const source = manifest.mounts[mountPoint];
  return path.join(dir, "mounts", mountPoint.replace(/\//g, "_"), source.path);
}
