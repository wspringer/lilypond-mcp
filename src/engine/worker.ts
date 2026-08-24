/**
 * Child-process entry that executes one lilypond.wasm run.
 *
 * A separate process for two reasons:
 * - `wasi.start()` is synchronous and would block the MCP server's event
 *   loop for the whole engrave;
 * - Node 22 needs `--experimental-wasm-exnref` for the engine's exception
 *   encoding, and a fork can carry execArgv the parent wasn't started with.
 *
 * Job (JSON on argv[2]): { engineWasm, preopens, env, args }
 * Reply (JSON on stdout): { exitCode } or { error }
 */
import { readFile } from "node:fs/promises";
import { WASI } from "node:wasi";

interface Job {
  engineWasm: string;
  preopens: Record<string, string>;
  env: Record<string, string>;
  args: string[];
}

async function main() {
  const job: Job = JSON.parse(process.argv[2]);
  const wasi = new WASI({
    version: "preview1",
    args: job.args,
    env: job.env,
    preopens: job.preopens,
    returnOnExit: true,
  });
  const mod = await WebAssembly.compile(await readFile(job.engineWasm));
  const instance = await WebAssembly.instantiate(mod, wasi.getImportObject() as WebAssembly.Imports);
  const exitCode = wasi.start(instance);
  process.stdout.write(JSON.stringify({ exitCode }));
}

main().catch((error) => {
  process.stdout.write(JSON.stringify({ error: String(error?.stack ?? error) }));
  process.exit(0);
});
