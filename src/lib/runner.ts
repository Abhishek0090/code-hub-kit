import type { Language } from "./languages";

export interface RunResult {
  exitCode: number;
  ms: number;
  where: "browser" | "server";
}

export interface RunCallbacks {
  onStdout: (text: string) => void;
  onStderr: (text: string) => void;
}

const TIMEOUT_MS = 15_000;
const LOAD_TIMEOUT_MS = 120_000;
export const PYODIDE_VERSION = "314.0.7";
const PYODIDE_URL = `https://cdn.jsdelivr.net/pyodide/v${PYODIDE_VERSION}/full/`;

/**
 * JavaScript runs in a throwaway worker: no DOM, no access to the page, killed on timeout.
 * Code is wrapped in an async function, so top-level await works.
 */
const JS_WORKER = `
const fmt = (v) => {
  if (typeof v === "string") return v;
  if (v instanceof Error) return v.stack || String(v);
  try { return JSON.stringify(v, (k, x) => typeof x === "bigint" ? x + "n" : x, 2) ?? String(v); } catch { return String(v); }
};
const out = (type) => (...args) => postMessage({ type, text: args.map(fmt).join(" ") + "\\n" });
console.log = console.info = console.debug = out("stdout");
console.error = console.warn = out("stderr");
self.onmessage = async (e) => {
  const lines = e.data.stdin.split("\\n");
  self.prompt = () => lines.shift() ?? null;
  try {
    const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
    await new AsyncFunction("input", e.data.code)(e.data.stdin);
    postMessage({ type: "exit", code: 0 });
  } catch (err) {
    postMessage({ type: "stderr", text: (err && err.stack) || String(err) });
    postMessage({ type: "exit", code: 1 });
  }
};`;

/**
 * Python via Pyodide (CPython compiled to WebAssembly). Loaded once, then reused between runs.
 * Current Pyodide releases only load in module workers.
 */
const PY_WORKER = `
const ready = import("${PYODIDE_URL}pyodide.mjs").then(({ loadPyodide }) => loadPyodide({ indexURL: "${PYODIDE_URL}" }));
self.onmessage = async (e) => {
  let py;
  try {
    py = await ready;
  } catch (err) {
    postMessage({ type: "stderr", text: "Could not load Python (Pyodide): " + (err.message || err) + "\\n" });
    postMessage({ type: "exit", code: 1 });
    return;
  }
  // The run time limit starts now, not while Pyodide downloads.
  postMessage({ type: "started" });
  py.setStdout({ batched: (s) => postMessage({ type: "stdout", text: s + "\\n" }) });
  py.setStderr({ batched: (s) => postMessage({ type: "stderr", text: s + "\\n" }) });
  const lines = e.data.stdin.split("\\n");
  py.setStdin({ stdin: () => lines.shift() ?? null });
  try {
    await py.loadPackagesFromImports(e.data.code);
    await py.runPythonAsync(e.data.code);
    postMessage({ type: "exit", code: 0 });
  } catch (err) {
    postMessage({ type: "stderr", text: String(err.message || err) });
    postMessage({ type: "exit", code: 1 });
  }
};`;

const workerFrom = (source: string, type: WorkerType = "classic") =>
  new Worker(URL.createObjectURL(new Blob([source], { type: "text/javascript" })), { type });

let pythonWorker: Worker | null = null;

/**
 * `waitForStart`: the worker first loads a runtime and posts "started" when the code begins, so the
 * run limit doesn't include the download (which gets its own, longer limit).
 */
function runInWorker(
  worker: Worker,
  code: string,
  stdin: string,
  cb: RunCallbacks,
  keep: boolean,
  waitForStart = false,
): Promise<number> {
  return new Promise((resolve) => {
    const stop = (message: string) => () => {
      worker.terminate();
      if (worker === pythonWorker) pythonWorker = null;
      cb.onStderr(message);
      resolve(124);
    };
    let timer = waitForStart
      ? setTimeout(stop("\nStopped: the runtime took longer than 2 minutes to load. Check your connection.\n"), LOAD_TIMEOUT_MS)
      : setTimeout(stop(`\nStopped: took longer than ${TIMEOUT_MS / 1000} seconds.\n`), TIMEOUT_MS);
    worker.onmessage = (e: MessageEvent<{ type: string; text?: string; code?: number }>) => {
      const m = e.data;
      if (m.type === "started") {
        clearTimeout(timer);
        timer = setTimeout(stop(`\nStopped: took longer than ${TIMEOUT_MS / 1000} seconds.\n`), TIMEOUT_MS);
      } else if (m.type === "stdout") cb.onStdout(m.text ?? "");
      else if (m.type === "stderr") cb.onStderr(m.text ?? "");
      else if (m.type === "exit") {
        clearTimeout(timer);
        if (!keep) worker.terminate();
        resolve(m.code ?? 0);
      }
    };
    worker.onerror = (e) => {
      clearTimeout(timer);
      cb.onStderr((e.message || "The worker failed to start.") + "\n");
      worker.terminate();
      if (worker === pythonWorker) pythonWorker = null;
      resolve(1);
    };
    worker.postMessage({ code, stdin });
  });
}

async function runInBrowser(lang: Language, code: string, stdin: string, cb: RunCallbacks): Promise<number> {
  if (lang.browser === "python") {
    pythonWorker ??= workerFrom(PY_WORKER, "module");
    return runInWorker(pythonWorker, code, stdin, cb, true, true);
  }
  let js = code;
  if (lang.browser === "typescript") {
    const { transform } = await import("sucrase");
    try {
      js = transform(code, { transforms: ["typescript"], disableESTransforms: true }).code;
    } catch (err) {
      cb.onStderr(`TypeScript error: ${err instanceof Error ? err.message : String(err)}\n`);
      return 1;
    }
  }
  if (/^\s*import\s.+from\s/m.test(js)) {
    cb.onStderr("Note: import statements don't work in the browser runner. Use a Piston server for packages.\n");
  }
  return runInWorker(workerFrom(JS_WORKER), js, stdin, cb, false);
}

async function runOnServer(lang: Language, code: string, stdin: string, cb: RunCallbacks): Promise<number> {
  const res = await fetch("/api/run", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ language: lang.piston, file: `main.${lang.ext}`, code, stdin }),
  });
  const data = (await res.json()) as { stdout?: string; stderr?: string; exitCode?: number; error?: string };
  if (!res.ok || data.error) {
    cb.onStderr((data.error ?? `Server error ${res.status}`) + "\n");
    return 1;
  }
  if (data.stdout) cb.onStdout(data.stdout);
  if (data.stderr) cb.onStderr(data.stderr);
  return data.exitCode ?? 0;
}

export async function runCode(
  lang: Language,
  code: string,
  stdin: string,
  cb: RunCallbacks,
  serverAvailable: boolean,
): Promise<RunResult> {
  const start = performance.now();
  const where = lang.browser ? "browser" : "server";
  let exitCode: number;
  if (lang.browser) exitCode = await runInBrowser(lang, code, stdin, cb);
  else if (serverAvailable) exitCode = await runOnServer(lang, code, stdin, cb);
  else {
    cb.onStderr(
      `${lang.label} needs a code-execution server. Set PISTON_URL in .env.local to a self-hosted Piston ` +
        "(https://github.com/engineer-man/piston) and restart. JavaScript, TypeScript and Python run in the browser without it.\n",
    );
    exitCode = 1;
  }
  return { exitCode, ms: Math.round(performance.now() - start), where };
}
