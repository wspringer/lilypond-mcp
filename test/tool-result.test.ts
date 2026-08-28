import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { toolResult } from "../src/tools/_helpers.js";

// A 1x1 transparent PNG — enough to prove the bytes round-trip as base64.
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64",
);

describe("toolResult", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), "tool-result-test-"));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("returns JSON text plus structuredContent by default", async () => {
    const r = await toolResult({ ok: true, outputs: {} });
    expect(r.isError).toBe(false);
    expect(r.content).toHaveLength(1);
    expect(r.content[0]).toEqual({ type: "text", text: JSON.stringify({ ok: true, outputs: {} }, null, 2) });
    expect(r.structuredContent).toEqual({ ok: true, outputs: {} });
  });

  it("attaches the preview PNG as an image content block", async () => {
    const png = path.join(dir, "preview.png");
    await writeFile(png, PNG);

    const r = await toolResult({ ok: true, previewPng: png }, { imagePath: png });
    expect(r.content).toHaveLength(2);
    expect(r.content[1]).toEqual({ type: "image", data: PNG.toString("base64"), mimeType: "image/png" });
    // The JSON still carries the path for clients that prefer the file.
    expect(r.structuredContent).toEqual({ ok: true, previewPng: png });
  });

  it("marks failures and attaches nothing", async () => {
    const r = await toolResult({ ok: false, errors: "boom" }, { isError: true });
    expect(r.isError).toBe(true);
    expect(r.content).toHaveLength(1);
  });
});
