import * as z from "zod/v4";
import { lilypondVersion } from "../lilypond.js";
import { toolResult } from "./_helpers.js";

export function makeVersionTool() {
  const inputSchema = z.object({});
  const outputSchema = z.object({
    version: z.string().describe("LilyPond version banner, e.g. 'GNU LilyPond 2.26.0 (running Guile 3.0)'"),
  });

  return {
    name: "lilypond_version",
    description:
      "Report the LilyPond version this server engraves with. " +
      "Use it to pick the right \\version header for new .ly files.",
    inputSchema,
    outputSchema,
    handler: async () => toolResult({ version: await lilypondVersion() }),
  };
}
