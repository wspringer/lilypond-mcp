import { readFile } from "node:fs/promises";

export const FORMATS = ["eps", "pdf", "svg", "png"] as const;

interface ToolResultOptions {
  isError?: boolean;
  /**
   * PNG to attach as an `image` content block alongside the JSON. Clients
   * that render tool images (Claude Desktop, Claude Code) show it inline and
   * the model sees the engraving without reading a file — the only way a
   * client with no filesystem access can look at the result at all.
   */
  imagePath?: string;
}

/** Wrap a structured result in the shape MCP tool handlers must return. */
export async function toolResult<T extends object>(result: T, opts: ToolResultOptions = {}) {
  const content: Array<
    { type: "text"; text: string } | { type: "image"; data: string; mimeType: string }
  > = [{ type: "text", text: JSON.stringify(result, null, 2) }];
  if (opts.imagePath) {
    content.push({
      type: "image",
      data: (await readFile(opts.imagePath)).toString("base64"),
      mimeType: "image/png",
    });
  }
  return {
    content,
    structuredContent: { ...result },
    isError: opts.isError ?? false,
  };
}
