/** Wrap a structured result in the shape MCP tool handlers must return. */
export function toolResult<T extends object>(result: T, isError = false) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
    structuredContent: { ...result },
    isError,
  };
}

export const FORMATS = ["eps", "pdf", "svg", "png"] as const;
