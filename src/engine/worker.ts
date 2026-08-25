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
import { readdirSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { WASI } from "node:wasi";

interface Job {
  engineWasm: string;
  preopens: Record<string, string>;
  env: Record<string, string>;
  args: string[];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type WasiFns = Record<string, (...args: any[]) => number>;

/**
 * Polyfill `fd_readdir` on Windows, where Node's uvwasi returns ENOSYS —
 * without directory listing, fontconfig finds no fonts and the engine
 * aborts. Guest directory fds are tracked by wrapping
 * `fd_prestat_dir_name` (preopens) and `path_open`; listings come from
 * node's own fs against the corresponding host path.
 */
function patchWindowsReaddir(
  fns: WasiFns,
  preopens: Record<string, string>,
  getMemory: () => WebAssembly.Memory,
): void {
  const ERRNO_BADF = 8;
  const ERRNO_NOENT = 44;
  const fdGuestPath = new Map<number, string>();
  const listings = new Map<number, { name: string; type: number }[]>();

  const guestToHost = (guest: string): string | undefined => {
    let best: [string, string] | undefined;
    for (const [g, h] of Object.entries(preopens)) {
      const prefix = g.endsWith("/") ? g : `${g}/`;
      if (guest === g || guest.startsWith(prefix)) {
        if (!best || g.length > best[0].length) best = [g, h];
      }
    }
    if (!best) return undefined;
    const rest = guest.slice(best[0].length).replace(/^\/+/, "");
    return rest ? path.join(best[1], ...rest.split("/")) : best[1];
  };

  const bytes = (ptr: number, len: number) =>
    Buffer.from(getMemory().buffer, ptr, len);

  const origPrestatDirName = fns.fd_prestat_dir_name;
  fns.fd_prestat_dir_name = (fd: number, pathPtr: number, pathLen: number) => {
    const errno = origPrestatDirName(fd, pathPtr, pathLen);
    if (errno === 0) {
      fdGuestPath.set(fd, bytes(pathPtr, pathLen).toString("utf8").replace(/\0+$/, ""));
    }
    return errno;
  };

  const origPathOpen = fns.path_open;
  fns.path_open = (
    dirfd: number,
    dirflags: number,
    pathPtr: number,
    pathLen: number,
    oflags: number,
    rightsBase: bigint,
    rightsInheriting: bigint,
    fdflags: number,
    openedFdPtr: number,
  ) => {
    const errno = origPathOpen(
      dirfd, dirflags, pathPtr, pathLen, oflags, rightsBase, rightsInheriting, fdflags, openedFdPtr,
    );
    if (errno === 0) {
      const parent = fdGuestPath.get(dirfd);
      if (parent !== undefined) {
        const rel = bytes(pathPtr, pathLen).toString("utf8");
        const guest = path.posix.normalize(path.posix.join(parent, rel));
        const openedFd = new DataView(getMemory().buffer).getUint32(openedFdPtr, true);
        fdGuestPath.set(openedFd, guest);
        listings.delete(openedFd);
      }
    }
    return errno;
  };

  const origClose = fns.fd_close;
  fns.fd_close = (fd: number) => {
    const errno = origClose(fd);
    if (errno === 0) {
      fdGuestPath.delete(fd);
      listings.delete(fd);
    }
    return errno;
  };

  fns.fd_readdir = (fd: number, bufPtr: number, bufLen: number, cookie: bigint, retPtr: number) => {
    const guest = fdGuestPath.get(fd);
    if (guest === undefined) return ERRNO_BADF;
    let listing = listings.get(fd);
    if (!listing || cookie === 0n) {
      const host = guestToHost(guest);
      if (host === undefined) return ERRNO_NOENT;
      try {
        listing = readdirSync(host, { withFileTypes: true })
          .map((e) => ({
            name: e.name,
            // WASI filetype: 3 = directory, 4 = regular_file, 7 = symlink
            type: e.isDirectory() ? 3 : e.isSymbolicLink() ? 7 : 4,
          }))
          .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
      } catch {
        return ERRNO_NOENT;
      }
      listings.set(fd, listing);
    }

    // WASI preview1 dirent: u64 d_next, u64 d_ino, u32 d_namlen, u8 d_type
    // (struct padded to 24 bytes), then the name. Fill until full: a
    // truncated final entry with used == bufLen tells the caller to grow
    // its buffer / continue from the last complete entry's d_next.
    const DIRENT = 24;
    const view = new DataView(getMemory().buffer);
    let used = 0;
    for (let i = Number(cookie); i < listing.length && used < bufLen; i++) {
      const name = Buffer.from(listing[i].name, "utf8");
      const header = Buffer.alloc(DIRENT);
      header.writeBigUInt64LE(BigInt(i + 1), 0); // d_next
      header.writeBigUInt64LE(BigInt(i + 1), 8); // d_ino (synthetic)
      header.writeUInt32LE(name.length, 16); // d_namlen
      header.writeUInt8(listing[i].type, 20); // d_type
      const entry = Buffer.concat([header, name]);
      const n = Math.min(entry.length, bufLen - used);
      entry.copy(bytes(bufPtr + used, n), 0, 0, n);
      used += n;
    }
    view.setUint32(retPtr, used, true);
    return 0;
  };
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
  const imports = wasi.getImportObject() as WebAssembly.Imports;
  let instance!: WebAssembly.Instance;
  if (process.platform === "win32") {
    patchWindowsReaddir(
      imports.wasi_snapshot_preview1 as unknown as WasiFns,
      job.preopens,
      () => instance.exports.memory as WebAssembly.Memory,
    );
  }
  const mod = await WebAssembly.compile(await readFile(job.engineWasm));
  instance = await WebAssembly.instantiate(mod, imports);
  const exitCode = wasi.start(instance);
  process.stdout.write(JSON.stringify({ exitCode }));
}

main().catch((error) => {
  process.stdout.write(JSON.stringify({ error: String(error?.stack ?? error) }));
  process.exit(0);
});
