"use client";

import { useState } from "react";
import CodeEditor from "@/components/CodeEditor";
import LanguageSelect from "@/components/LanguageSelect";
import PageHeader from "@/components/PageHeader";
import RunPanel from "@/components/RunPanel";
import { findLanguage, LANGUAGES } from "@/lib/languages";

export default function RunPage() {
  const [langId, setLangId] = useState("python");
  const [resets, setResets] = useState(0);
  // Code per language, so switching back and forth keeps what you typed (in this tab only).
  const [codes, setCodes] = useState<Record<string, string>>({});
  const language = findLanguage(langId) ?? LANGUAGES[0];
  const code = codes[langId] ?? language.sample;

  return (
    <div className="flex h-full flex-col px-4 py-6 sm:px-7">
      <PageHeader title="Run Code">
        JavaScript, TypeScript and Python run in your browser. Java, C, C++, Go, Rust and the rest run on your own
        Piston server when PISTON_URL is set. Code is never stored.
      </PageHeader>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <LanguageSelect value={langId} onChange={setLangId} />
        <button
          className="btn-secondary py-1.5"
          onClick={() => {
            setCodes((c) => {
              const next = { ...c };
              delete next[langId];
              return next;
            });
            setResets((n) => n + 1);
          }}
        >
          Reset sample
        </button>
      </div>
      <div className="grid min-h-0 flex-1 gap-4 xl:grid-cols-2">
        <CodeEditor
          key={`${langId}-${resets}`}
          language={langId}
          value={code}
          onChange={(v) => setCodes((c) => ({ ...c, [langId]: v }))}
          className="h-[45vh] xl:h-auto"
        />
        <RunPanel language={language} getCode={() => code} />
      </div>
    </div>
  );
}
