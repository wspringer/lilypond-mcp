/**
 * The engine pin and the runtime contract.
 *
 * `engine.json` (repo root) pins one lilypond-wasi release: tag plus the
 * sha256 of every asset, taken from that release's SHA256SUMS. The
 * trail-engine workflow updates it; humans review the PR.
 *
 * `runtime-manifest.json` ships *inside* the release and describes how to
 * run the engine — mounts, env, formats, known issues — so this server
 * reads the contract instead of hardcoding it.
 */

export interface EnginePin {
  /** Release tag, e.g. "stable/2.26.1-p0.1.2". */
  tag: string;
  /** GitHub repo the release lives in. */
  repository: string;
  /** asset filename -> expected sha256 (lowercase hex). */
  sha256: Record<string, string>;
}

export interface RuntimeManifest {
  schemaVersion: number;
  lilypond: string;
  variant: string;
  recipe: string;
  wasi: string;
  wasmExceptions: string;
  engine: string;
  argv0: string;
  writableDirectory: string;
  mounts: Record<string, { asset: string; path: string }>;
  environment: Record<string, string>;
  formats: string[];
  knownIssues?: Record<string, string>;
}
