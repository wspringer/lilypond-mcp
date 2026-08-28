import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import * as z from "zod/v4";
import { engrave } from "../lilypond.js";
import { FORMATS, toolResult } from "./_helpers.js";

export function makeEngraveCodeTool() {
  const inputSchema = z.object({
    code: z.string().describe("LilyPond source code, e.g. '\\version \"2.26.0\" { c\\' e\\' g\\' }'"),
    name: z.string().default("snippet").describe("Basename for the generated assets"),
    output_dir: z
      .string()
      .default("build")
      .describe("Directory the generated assets are written to (created if missing)"),
    formats: z
      .array(z.enum(FORMATS))
      .default(["png"])
      .describe("Asset formats to generate; png is handy while iterating on a snippet"),
    crop: z.boolean().default(true).describe("Crop assets to the music itself (required for EPS)"),
    include_dirs: z
      .array(z.string())
      .default([])
      .describe("Directories searched by \\include, e.g. a shared settings library"),
    preview: z
      .boolean()
      .default(true)
      .describe(
        "Attach the preview PNG to the result as an image, so the engraving is visible inline " +
          "without reading a file. Turn off for batch runs.",
      ),
  });

  const outputSchema = z.object({
    ok: z.boolean(),
    outputs: z.partialRecord(z.enum(FORMATS), z.string()),
    previewPng: z
      .string()
      .optional()
      .describe("Cropped PNG of the engraved music — read this file to inspect the result"),
    errors: z.string().optional(),
  });

  return {
    name: "engrave_code",
    description:
      "Engrave LilyPond code passed inline, without needing a source file on disk. " +
      "Useful for iterating on a musical idea: engrave, read the preview PNG, adjust, repeat. " +
      "For anything worth keeping, write a .ly file and use engrave_file instead.",
    inputSchema,
    outputSchema,
    handler: async (args: z.infer<typeof inputSchema>) => {
      const tmpDir = await mkdtemp(path.join(os.tmpdir(), "lilypond-mcp-"));
      try {
        const source = path.join(tmpDir, `${args.name}.ly`);
        await writeFile(source, args.code);
        const result = await engrave({
          source,
          name: args.name,
          outputDir: args.output_dir,
          formats: args.formats,
          crop: args.crop,
          includeDirs: args.include_dirs,
        });
        return toolResult(result, {
          isError: !result.ok,
          imagePath: args.preview && result.ok ? result.previewPng : undefined,
        });
      } finally {
        await rm(tmpDir, { recursive: true, force: true });
      }
    },
  };
}
