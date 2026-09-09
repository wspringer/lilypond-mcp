#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { McpServer } from "@modelcontextprotocol/server";
import { StdioServerTransport } from "@modelcontextprotocol/server/stdio";

import { makeEngraveCodeTool } from "./tools/engrave_code.js";
import { makeEngraveFileTool } from "./tools/engrave_file.js";
import { makeVersionTool } from "./tools/version.js";

async function main() {
  const pkg = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
  const server = new McpServer({ name: "lilypond-mcp", version: pkg.version });

  for (const tool of [makeEngraveFileTool(), makeEngraveCodeTool(), makeVersionTool()]) {
    server.registerTool(
      tool.name,
      {
        title: tool.title,
        annotations: tool.annotations,
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
