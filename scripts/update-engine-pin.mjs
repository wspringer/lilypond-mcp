#!/usr/bin/env node
/**
 * Pin (or re-pin) the wasm engine to a lilypond-wasi release.
 *
 *   node scripts/update-engine-pin.mjs                 # latest stable/*
 *   node scripts/update-engine-pin.mjs stable/2.26.1-p0.1.2
 *
 * Writes engine.json: { repository, tag, sha256 } with the sha256 of every
 * asset, parsed from the release's SHA256SUMS. The trail-engine workflow
 * runs this and opens a PR when the result differs.
 */
import { writeFile } from "node:fs/promises";

const REPO = "wspringer/lilypond-wasi";

async function gh(path) {
  const res = await fetch(`https://api.github.com${path}`, {
    headers: { accept: "application/vnd.github+json" },
  });
  if (!res.ok) throw new Error(`GitHub API ${res.status} for ${path}`);
  return res.json();
}

let tag = process.argv[2];
if (!tag) {
  const releases = await gh(`/repos/${REPO}/releases?per_page=30`);
  const stable = releases.find((r) => r.tag_name.startsWith("stable/") && !r.draft);
  if (!stable) throw new Error("no stable/* release found");
  tag = stable.tag_name;
}

const sumsUrl = `https://github.com/${REPO}/releases/download/${tag}/SHA256SUMS`;
const res = await fetch(sumsUrl, { redirect: "follow" });
if (!res.ok) throw new Error(`no SHA256SUMS on ${tag} (${res.status}) — pre-manifest release?`);
const sums = await res.text();

const sha256 = {};
for (const line of sums.trim().split("\n")) {
  const m = line.match(/^([0-9a-f]{64})\s+\*?(.+)$/);
  if (m) sha256[m[2].trim()] = m[1];
}
if (!sha256["runtime-manifest.json"]) {
  throw new Error(`release ${tag} has no runtime-manifest.json — the wasm backend needs it`);
}

const pin = { repository: REPO, tag, sha256 };
await writeFile(new URL("../engine.json", import.meta.url), JSON.stringify(pin, null, 2) + "\n");
console.log(`pinned ${tag} (${Object.keys(sha256).length} assets)`);
