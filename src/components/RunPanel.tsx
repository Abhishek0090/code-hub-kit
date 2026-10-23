"use client";

import { useState } from "react";
import type { Language } from "@/lib/languages";
import { runCode, type RunResult } from "@/lib/runner";
import { useServerStatus } from "@/lib/useServerStatus";

interface Line {
  stream: "out" | "err";
  text: string;
}

/** Stdin box, Run button and output console. The caller owns the editor and passes the code in. */
export default function RunPanel({ language, getCode }: { language: Language; getCode: () => string }) {
  const status = useServerStatus();
  const [stdin, setStdin] = useState("");
  const [showStdin, setShowStdin] = useState(false);
  const [lines, setLines] = useState<Line[]>([]);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<RunResult | null>(null);

  const needsServer = !language.browser;
  const unavailable = needsServer && status !== null && !status.piston;

  async function run() {
    setRunning(true);
    setLines([]);
    setResult(null);
    const push = (stream: Line["stream"]) => (text: string) => setLines((prev) => [...prev, { stream, text }]);
    const r = await runCode(language, getCode(), stdin, { onStdout: push("out"), onStderr: push("err") }, Boolean(status?.piston));
    setResult(r);
    setRunning(false);
  }

  return (
    <div className="flex min-h-0 flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <button onClick={run} disabled={running} className="btn-primary">
          {running ? "Running..." : "Run"}
        </button>
        <button onClick={() => setShowStdin((s) => !s)} className="btn-secondary py-2">
          {showStdin ? "Hide input" : "Input (stdin)"}
        </button>
        <span className="text-xs text-zinc-500">
          {language.browser
            ? language.browser === "python"
              ? "Runs in your browser (Python via Pyodide; first run downloads it)"
              : "Runs in your browser, in a sandboxed worker"
            : unavailable
              ? "Needs a Piston server (PISTON_URL)"
              : "Runs on your Piston server"}
        </span>
        {result && (
          <span
            className={`ml-auto text-xs tabular-nums ${result.exitCode === 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}
          >
            exit {result.exitCode} · {result.ms} ms
          </span>
        )}
      </div>
      {showStdin && (
        <textarea
          value={stdin}
          onChange={(e) => setStdin(e.target.value)}
          placeholder="Text your program reads from standard input"
          className="input h-20 resize-y font-mono text-xs"
        />
      )}
      <pre className="min-h-32 flex-1 overflow-auto rounded-lg border border-zinc-200 bg-zinc-50 p-3 font-mono text-xs leading-relaxed dark:border-zinc-800 dark:bg-black">
        {lines.length === 0 && !running && <span className="text-zinc-500">Output appears here.</span>}
        {running && lines.length === 0 && <span className="text-zinc-500">Running...</span>}
        {lines.map((l, i) =>
          l.text ? (
            <span key={i} className={l.stream === "err" ? "text-red-600 dark:text-red-400" : "text-zinc-800 dark:text-green-300"}>
              {l.text}
            </span>
          ) : null,
        )}
      </pre>
    </div>
  );
}
