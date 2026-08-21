#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/server";
import { StdioServerTransport } from "@modelcontextprotocol/server/stdio";

import { makeEngraveCodeTool } from "./tools/engrave_code.js";
import { makeEngraveFileTool } from "./tools/engrave_file.js";
import { makeVersionTool } from "./tools/version.js";

async function main() {
  const server = new McpServer({ name: "lilypond-mcp", version: "0.1.0" });

  for (const tool of [makeEngraveFileTool(), makeEngraveCodeTool(), makeVersionTool()]) {
    server.registerTool(
      tool.name,
      {
        description: tool.description,
        inputSchema: tool.inputSchema,
        outputSchema: tool.outputSchema,
      },
      (args: unknown) => tool.handler(tool.inputSchema.parse(args) as never),
    );
  }

  await server.connect(new StdioServerTransport());
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
