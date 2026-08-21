import path from "node:path";
import * as z from "zod/v4";
import { engrave } from "../lilypond.js";
import { FORMATS, toolResult } from "./_helpers.js";

export function makeEngraveFileTool() {
  const inputSchema = z.object({
    source: z.string().describe("Path to the .ly file, relative to the project root or absolute"),
    output_dir: z
      .string()
      .default("build")
      .describe("Directory the generated assets are written to (created if missing)"),
    formats: z
      .array(z.enum(FORMATS))
      .default(["eps"])
      .describe("Asset formats to generate"),
    crop: z
      .boolean()
      .default(true)
      .describe(
        "Crop assets to the music itself instead of a full page. Required for EPS; " +
          "what you want for assets placed in a layout.",
      ),
    include_dirs: z
      .array(z.string())
      .default([])
      .describe("Directories searched by \\include, e.g. a shared settings library"),
    name: z
      .string()
      .optional()
      .describe("Basename for the assets; defaults to the source filename without .ly"),
  });

  const outputSchema = z.object({
    ok: z.boolean(),
    outputs: z
      .partialRecord(z.enum(FORMATS), z.string())
      .describe("Absolute path per generated format"),
    previewPng: z
      .string()
      .optional()
      .describe("Cropped PNG of the engraved music — read this file to inspect the result"),
    errors: z.string().optional().describe("LilyPond diagnostics when compilation fails"),
  });

  return {
    name: "engrave_file",
    description:
      "Engrave a LilyPond (.ly) source file into publication-quality music notation assets. " +
      "Cropped EPS/PDF/SVG are self-contained (fonts embedded or converted to outlines) and " +
      "sized to the music, ready to place in page-layout software such as InDesign. " +
      "On failure, `errors` carries the LilyPond diagnostics, including line numbers.",
    inputSchema,
    outputSchema,
    handler: async (args: z.infer<typeof inputSchema>) => {
      const result = await engrave({
        source: args.source,
        name: args.name ?? path.basename(args.source, ".ly"),
        outputDir: args.output_dir,
        formats: args.formats,
        crop: args.crop,
        includeDirs: args.include_dirs,
      });
      return toolResult(result, !result.ok);
    },
  };
}
