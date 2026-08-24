# Licensing rationale

`lilypond-mcp` is MIT. It orchestrates GPL-licensed programs — GNU LilyPond
(GPL-3.0-or-later) and Ghostscript (AGPL-3.0) — and this document records
why MIT is a well-grounded choice, and which design decisions it depends
on. (Careful engineering reading of the licenses and the FSF's published
positions; not legal advice.)

## Today: subprocess execution

The server `spawn`s `lilypond` and `gs` as separate processes and
communicates via command-line arguments, files, and exit codes. This is
the textbook separate-programs case. The FSF's GPL FAQ:

> "pipes, sockets and command-line arguments are communication mechanisms
> normally used between two separate programs. So when they are used for
> communication, the modules normally are separate programs."

An MIT program executing a GPL program is two works. No shell needs to be
GPL.

## Planned: in-process WASI execution

A future backend loads `lilypond.wasm` (from the GPL-licensed
[lilypond-wasi](https://github.com/wspringer/lilypond-wasi) project) inside
the server's Node process via `node:wasi`. Analysis against the FSF's
criteria — "the mechanism of communication … and the semantics of the
communication (what kinds of information are interchanged)":

- The FAQ's plugins entry describes this invocation model directly:
  *"If the main program dynamically links plug-ins, but the communication
  between them is limited to invoking the 'main' function of the plug-in
  with some options and waiting for it to return, **that is a borderline
  case**."* That is precisely the `node:wasi` model: the host calls
  `_start` with argv and waits for an exit code.
- Every **semantic** factor the FSF names lands on the separate-programs
  side: argv in, files out, exit code back; no function calls between the
  works; no "complex internal data structures" exchanged.
- The "shared address space" concern (*"almost surely … one program"*) is
  arguably false by construction for WASI: the module's linear memory is
  isolated; neither side can address the other's memory. Communication
  passes exclusively through the WASI syscall boundary — the same
  arms-length semantics as exec.
- The FAQ's interpreter entry reinforces the framing: *"The interpreted
  program, to the interpreter, is just data."* `lilypond.wasm` is a
  complete program executed by V8, not a library linked into this one.

Conclusion: between "borderline" (the FSF's own word for the mechanism)
and "separate programs" (their semantics test) — never clearly "combined".
No court has examined the wasm boundary; the Linux Foundation's
["WebAssembly for Legal Professionals"](https://project.linuxfoundation.org/hubfs/LF%20Research/Web%20Assembly%20for%20Legal%20Professionals%20-%20Report.pdf)
notes the ambiguity. The debates that do exist in the wild (e.g. Qt/LGPL
in wasm) concern *statically linking a library into one's own module* —
the opposite direction from executing a complete GPL program.

## Design rules this position depends on

1. **Never bundle GPL bytes in the npm package.** The wasm engine, assets,
   and bytecode are fetched on demand from the lilypond-wasi GitHub
   releases (checksummed via their `SHA256SUMS`, provenance in their
   `provenance.json`). The published `lilypond-mcp` artifact contains only
   MIT-licensed code. Distribution stays unambiguous no matter how the
   in-process question is read.
2. **Keep the boundary program-shaped.** The wasm engine is invoked as a
   command — argv, mounts, env, exit code — never through added host
   bindings, shared structures, or callbacks into the module. If the
   interface ever grows beyond "run a program", redo this analysis.
3. **Escape hatch:** spawning `wasmtime` as a subprocess is pure exec and
   removes even the borderline language, at the cost of a runtime
   dependency. The backend should remain structured so this substitution
   stays trivial.
