"use client";

import { useEffect, useState } from "react";
import CodeEditor from "@/components/CodeEditor";
import PageHeader from "@/components/PageHeader";
import { CONVERTERS } from "@/lib/convert/formats";

export default function FormatConvertPage() {
  const [id, setId] = useState(CONVERTERS[0].id);
  const converter = CONVERTERS.find((c) => c.id === id)!;
  const [input, setInput] = useState(converter.sample);
  const [output, setOutput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Converts as you type.
  useEffect(() => {
    let cancelled = false;
    Promise.resolve()
      .then(() => converter.run(input))
      .then((out) => {
        if (cancelled) return;
        setOutput(out);
        setError(null);
      })
      .catch((err) => !cancelled && setError(err instanceof Error ? err.message : String(err)));
    return () => {
      cancelled = true;
    };
  }, [converter, input]);

  function pick(nextId: string) {
    const next = CONVERTERS.find((c) => c.id === nextId)!;
    setId(nextId);
    setInput(next.sample);
  }

  return (
    <div className="flex h-full flex-col px-4 py-6 sm:px-7">
      <PageHeader title="Format Convert">
        Convert between data formats as you type. Runs entirely in your browser.
      </PageHeader>

      <div className="mb-4 flex flex-wrap gap-1.5">
        {CONVERTERS.map((c) => (
          <button
            key={c.id}
            onClick={() => pick(c.id)}
            className={`rounded-full border px-3 py-1 text-sm ${
              c.id === id
                ? "border-blue-600 bg-blue-600 text-white"
                : "border-zinc-300 text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
            }`}
          >
            {c.label}
          </button>
        ))}
      </div>

      <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-2">
        <div className="flex min-h-0 flex-col gap-1.5">
          <span className="label">{converter.from}</span>
          <CodeEditor
            key={id}
            language={converter.inLang}
            value={converter.sample}
            onChange={setInput}
            className="h-[38vh] lg:h-auto lg:flex-1"
          />
        </div>
        <div className="flex min-h-0 flex-col gap-1.5">
          <div className="flex items-center gap-2">
            <span className="label">{converter.to}</span>
            <button
              className="btn-secondary ml-auto py-1 text-xs"
              disabled={!output || !!error}
              onClick={async () => {
                await navigator.clipboard.writeText(output);
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
              }}
            >
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
          <CodeEditor language={converter.outLang} readOnly externalValue={output} className="h-[38vh] lg:h-auto lg:flex-1" />
          {error && <p className="text-sm text-red-600 dark:text-red-400">Can&apos;t convert: {error}</p>}
        </div>
      </div>
    </div>
  );
}
