# Run Code

Runs code and shows stdout, stderr, the exit code and the time. JavaScript, TypeScript and Python run in the browser.
Other languages go through a Piston server you host. The same runner powers the Run Code page and the Run button in
codeshare rooms.

## Languages (`src/lib/languages.ts`)

Each entry in `LANGUAGES` has:

| Field | Meaning |
| --- | --- |
| `id` | Used in URLs, the editor and the codeshare `meta` map |
| `label` | Shown in dropdowns |
| `piston` | The language name Piston knows it by (`c++`, `sqlite3`, ...) |
| `browser` | `javascript`, `typescript` or `python` if it runs in the browser; absent otherwise |
| `ext` | File extension, used for the file name sent to Piston (`main.java`) |
| `highlight` | Lazy import of the CodeMirror language package |
| `sample` | Starter code |

`EXTRA_HIGHLIGHT` covers formats that are highlighted but not run (JSON, YAML, HTML, CSS, Markdown, text).

## Flow

`runCode(language, code, stdin, callbacks, serverAvailable)` in `src/lib/runner.ts`:

```text
language.browser?
  javascript -> JS worker
  typescript -> sucrase strips types -> JS worker
  python     -> Pyodide worker (created once, reused)
otherwise
  PISTON_URL set?  -> POST /api/run -> Piston
  not set          -> explains how to set up Piston
```

`RunPanel` streams output lines as they arrive and colours stderr red.

## JavaScript and TypeScript

The runner builds a Web Worker from a source string (`JS_WORKER`) through a Blob URL. Inside the worker:

- `console.log/info/debug` post to stdout; `console.error/warn` post to stderr. Objects print as indented JSON,
  BigInts as `123n`.
- The code is wrapped in an `AsyncFunction`, so top-level `await` works. The stdin text is available as the variable
  `input`, and `prompt()` returns stdin one line at a time.
- A worker has no DOM and no access to the page, cookies or localStorage, so user code can't touch the app.
- `import` statements don't work (there's no bundler), and the runner prints a note when it sees one.
- The worker is terminated after each run, or after 15 seconds (`TIMEOUT_MS`).

TypeScript goes through `sucrase` with only the `typescript` transform: types are stripped, nothing is type-checked.
Syntax errors are reported as "TypeScript error: ...".

## Python (Pyodide)

[Pyodide](https://pyodide.org) is CPython compiled to WebAssembly. Version 314.0.7 loads from
`cdn.jsdelivr.net/pyodide/v314.0.7/full/` the first time Python runs (about 10 MB, then cached by the browser).

- Current Pyodide releases refuse classic workers ("Classic web workers are not supported"), so the Python worker is
  a **module worker** that imports `pyodide.mjs`.
- One Python worker is created and reused, so later runs start instantly. The interpreter is shared between runs,
  so globals defined in one run still exist in the next. A timeout resets it.
- `loadPackagesFromImports` fetches packages the code imports that Pyodide ships (numpy, pandas and others).
- stdin is fed line by line through `setStdin`, so `input()` works.
- **Two time limits:** the worker posts `started` once Pyodide has loaded. Until then the limit is 2 minutes
  (`LOAD_TIMEOUT_MS`, for the download); after that it's the usual 15 seconds. A timed-out worker is terminated and
  the next run creates a fresh one.

## Server languages (`/api/run`)

`src/app/api/run/route.ts` is a thin proxy to Piston's v2 API:

1. Rejects the request if `PISTON_URL` is unset (503) or the code is over 200,000 characters (413).
2. Fetches `GET /api/v2/runtimes` (cached for 5 minutes) and finds the runtime by name or alias. A missing runtime
   returns a message saying which `ppman install` to run.
3. Calls `POST /api/v2/execute` with the code as one file, stdin, a 10-second run timeout and a 15-second compile
   timeout.
4. Returns `{ stdout, stderr, exitCode }`. If compilation failed, it returns the compiler output instead of run
   output. A kill signal (for example a timeout) is appended to stderr.

Nothing is logged or stored.

`/api/status` reports whether `PISTON_URL` (and `ANTHROPIC_API_KEY`) are set. It calls `connection()` so Next.js
reads the environment on every request instead of baking it in at build time. The UI fetches it once per page load
through `useServerStatus`.

## Adding a language

For a server language:

1. Add an entry to `LANGUAGES` with the Piston name, extension, a highlighter (reuse a close one, or
   `async () => []` for none) and a sample.
2. Install the runtime on your Piston server.

For a new in-browser runtime (for example SQL through sql.js):

1. Add a value to `BrowserRuntime` and set `browser` on the language.
2. Add a worker source in `runner.ts` that posts `stdout`, `stderr` and `exit` messages (and `started` if it
   downloads something first), and dispatch to it in `runInBrowser`.
