"use client";

import { useRef, useState } from "react";
import CodeEditor from "@/components/CodeEditor";
import PageHeader from "@/components/PageHeader";
import { LANGUAGES } from "@/lib/languages";
import { useServerStatus } from "@/lib/useServerStatus";

const TARGETS = [
  ...LANGUAGES.map((l) => l.label),
  "React (hooks)",
  "React Native",
  "Next.js App Router",
  "Swift",
  "Dart",
  "Scala",
  "Lua",
];

const highlightFor = (label: string) => LANGUAGES.find((l) => l.label === label)?.id ?? "javascript";

/** The model is told not to use fences, but strip them if it does. */
const stripFences = (s: string) => s.replace(/^\s*```[\w+-]*\n/, "").replace(/\n```\s*$/, "");

export default function AiConvertPage() {
  const status = useServerStatus();
  const [from, setFrom] = useState("auto");
  const [to, setTo] = useState("TypeScript");
  const [notes, setNotes] = useState("");
  const [source, setSource] = useState(LANGUAGES.find((l) => l.id === "python")!.sample);
  const [output, setOutput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const abort = useRef<AbortController | null>(null);

  async function convert() {
    setBusy(true);
    setError(null);
    setOutput("");
    abort.current = new AbortController();
    try {
      const res = await fetch("/api/convert", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: source, from, to, notes }),
        signal: abort.current.signal,
      });
      if (!res.ok || !res.body) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? `Request failed (${res.status})`);
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let text = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        text += decoder.decode(value, { stream: true });
        setOutput(stripFences(text));
      }
    } catch (err) {
      if ((err as Error).name !== "AbortError") setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
      abort.current = null;
    }
  }

  return (
    <div className="flex h-full flex-col px-4 py-6 sm:px-7">
      <PageHeader title="AI Code Convert">
        Translate code between languages and frameworks with Claude. It keeps the behaviour and uses the target
        language&apos;s idioms. Your code is sent to the Anthropic API to convert it and is not stored here.
      </PageHeader>

      {status && !status.ai && (
        <p className="mb-4 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
          AI conversion is off: add <code className="font-mono">ANTHROPIC_API_KEY=...</code> to{" "}
          <code className="font-mono">.env.local</code> and restart the server. The Format Convert tools work without it.
        </p>
      )}

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <select value={from} onChange={(e) => setFrom(e.target.value)} className="input py-1.5" aria-label="From">
          <option value="auto">Detect language</option>
          {TARGETS.map((t) => (
            <option key={t}>{t}</option>
          ))}
        </select>
        <span className="text-zinc-500">to</span>
        <select value={to} onChange={(e) => setTo(e.target.value)} className="input py-1.5" aria-label="To">
          {TARGETS.map((t) => (
            <option key={t}>{t}</option>
          ))}
        </select>
        <input
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Optional: extra instructions, e.g. use async/await"
          className="input min-w-48 flex-1 py-1.5"
        />
        {busy ? (
          <button className="btn-secondary" onClick={() => abort.current?.abort()}>
            Stop
          </button>
        ) : (
          <button className="btn-primary" onClick={convert} disabled={!source.trim() || status?.ai === false}>
            Convert
          </button>
        )}
      </div>
      {error && <p className="mb-3 text-sm text-red-600 dark:text-red-400">{error}</p>}

      <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-2">
        <div className="flex min-h-0 flex-col gap-1.5">
          <span className="label">Source</span>
          <CodeEditor
            language={from === "auto" ? "javascript" : highlightFor(from)}
            value={source}
            onChange={setSource}
            className="h-[40vh] lg:h-auto lg:flex-1"
          />
        </div>
        <div className="flex min-h-0 flex-col gap-1.5">
          <div className="flex items-center gap-2">
            <span className="label">{to}</span>
            {busy && <span className="text-xs text-zinc-500">Converting...</span>}
            <button
              className="btn-secondary ml-auto py-1 text-xs"
              disabled={!output}
              onClick={async () => {
                await navigator.clipboard.writeText(output);
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
              }}
            >
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
          <CodeEditor
            language={highlightFor(to)}
            readOnly
            externalValue={output}
            placeholder="The converted code appears here."
            className="h-[40vh] lg:h-auto lg:flex-1"
          />
        </div>
      </div>
    </div>
  );
}
