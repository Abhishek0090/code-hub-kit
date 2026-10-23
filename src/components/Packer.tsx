"use client";

import { useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import { classify, type Classified, type ExcludeReason } from "@/lib/pack/filters";
import { FORMATS, generateScripts, loadFiles } from "@/lib/pack/generate";
import type { GeneratedScript, ScriptFormat, SourceProject } from "@/lib/pack/types";
import { fromDrop, fromFolderInput, fromZip } from "@/lib/sources";
import PageHeader from "./PageHeader";

const REASON_LABEL: Record<ExcludeReason, string> = {
  secret: "May hold secrets",
  gitignore: "Matched by .gitignore",
  junk: "OS junk files",
};

const ROW_LIMIT = 300;
const LARGE_FILE = 1024 * 1024;
const LARGE_SCRIPT = 1024 * 1024;

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(n < 10 * 1024 ? 1 : 0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

function download(name: string, content: string) {
  const url = URL.createObjectURL(new Blob([content], { type: "text/plain" }));
  const a = Object.assign(document.createElement("a"), { href: url, download: name });
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function Packer() {
  const [project, setProject] = useState<SourceProject | null>(null);
  const [classified, setClassified] = useState<Classified[]>([]);
  const [overrides, setOverrides] = useState<Map<string, boolean>>(new Map());
  const [useGitignore, setUseGitignore] = useState(true);
  const [name, setName] = useState("");
  const [formats, setFormats] = useState<Set<ScriptFormat>>(new Set(["node"]));
  const [split, setSplit] = useState(false);
  const [partKB, setPartKB] = useState(100);
  const [tab, setTab] = useState<"included" | "excluded">("included");
  const [filter, setFilter] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<GeneratedScript[] | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const folderInput = useRef<HTMLInputElement>(null);
  const zipInput = useRef<HTMLInputElement>(null);

  // webkitdirectory isn't in React's input props.
  useEffect(() => {
    folderInput.current?.setAttribute("webkitdirectory", "");
  }, []);

  useEffect(() => {
    if (!project) return;
    let cancelled = false;
    classify(project.files, useGitignore).then((c) => !cancelled && setClassified(c));
    return () => {
      cancelled = true;
    };
  }, [project, useGitignore]);

  const isIncluded = (c: Classified) => overrides.get(c.file.path) ?? c.reason === null;
  const included = useMemo(() => classified.filter(isIncluded), [classified, overrides]); // eslint-disable-line react-hooks/exhaustive-deps
  const excluded = useMemo(() => classified.filter((c) => !isIncluded(c)), [classified, overrides]); // eslint-disable-line react-hooks/exhaustive-deps
  const includedBytes = included.reduce((n, c) => n + c.file.size, 0);
  const largeFiles = included.filter((c) => c.file.size > LARGE_FILE);

  async function load(read: () => Promise<SourceProject>) {
    setError(null);
    setResults(null);
    setBusy("Reading files...");
    try {
      const p = await read();
      if (!p.files.length) throw new Error("No files found. Pick the project folder itself, or a .zip of it.");
      setOverrides(new Map());
      setName(p.name);
      setProject(p);
      setTab("included");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    setDragging(false);
    let pending: Promise<SourceProject>;
    try {
      pending = fromDrop(e.dataTransfer);
    } catch (err) {
      pending = Promise.reject(err);
    }
    load(() => pending);
  }

  function toggle(c: Classified) {
    setResults(null);
    setOverrides((prev) => new Map(prev).set(c.file.path, !isIncluded(c)));
  }

  async function generate() {
    if (!project) return;
    setError(null);
    setResults(null);
    try {
      const files = included.map((c) => c.file);
      const packed = await loadFiles(files, (done) => setBusy(`Reading ${done} of ${files.length} files...`));
      setBusy("Compressing...");
      const scripts = await generateScripts({
        name: name.trim() || project.name,
        files: packed,
        emptyDirs: project.emptyDirs,
        formats: (["node", "bash", "powershell"] as const).filter((f) => formats.has(f)),
        partBytes: split ? partKB * 1024 : null,
        leftOut: excluded.filter((c) => c.reason === "secret").map((c) => c.file.path),
      });
      setResults(scripts);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  async function copy(s: GeneratedScript) {
    await navigator.clipboard.writeText(s.content);
    setCopied(s.fileName);
    setTimeout(() => setCopied((c) => (c === s.fileName ? null : c)), 2000);
  }

  const rows = (tab === "included" ? [...included].sort((a, b) => b.file.size - a.file.size) : excluded).filter(
    (c) => !filter || c.file.path.toLowerCase().includes(filter.toLowerCase()),
  );

  return (
    <div className="w-full max-w-5xl px-4 py-6 sm:px-7">
      <PageHeader title="Project to Script">
        Turn a project folder into one script. Paste it on another machine, run it, and get back exactly the same
        files, checked with SHA-256. Everything happens in your browser: nothing is uploaded.
      </PageHeader>

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={`rounded-xl border-2 border-dashed p-8 text-center transition-colors ${
          dragging
            ? "border-blue-500 bg-blue-50 dark:bg-blue-950/40"
            : "border-zinc-300 bg-white dark:border-zinc-700 dark:bg-zinc-900"
        }`}
      >
        <p className="font-medium">Drop a project folder or .zip here</p>
        <p className="mt-1 text-sm text-zinc-500">Next.js, React Native, Expo, Python, anything</p>
        <div className="mt-4 flex flex-wrap justify-center gap-3">
          <button onClick={() => folderInput.current?.click()} className="btn-primary">
            Choose folder
          </button>
          <button onClick={() => zipInput.current?.click()} className="btn-secondary">
            Choose .zip
          </button>
        </div>
        <input
          ref={folderInput}
          type="file"
          multiple
          hidden
          onChange={(e) => {
            const list = e.target.files;
            if (list?.length) load(async () => fromFolderInput(list));
            e.target.value = "";
          }}
        />
        <input
          ref={zipInput}
          type="file"
          accept=".zip,application/zip"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) load(() => fromZip(f));
            e.target.value = "";
          }}
        />
      </div>

      {busy && <p className="mt-4 text-sm text-zinc-600 dark:text-zinc-400">{busy}</p>}
      {error && (
        <p className="mt-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-800 dark:bg-red-950/50 dark:text-red-300">
          {error}
        </p>
      )}

      {project && (
        <>
          <section className="card mt-8">
            <div className="flex flex-wrap items-end gap-4">
              <label className="flex-1 min-w-48">
                <span className="label">Project name</span>
                <input value={name} onChange={(e) => setName(e.target.value)} className="input mt-1 w-full" />
              </label>
              <p className="text-sm text-zinc-600 dark:text-zinc-400">
                <strong className="text-zinc-900 dark:text-zinc-100">{included.length}</strong> files,{" "}
                {formatBytes(includedBytes)} included
                {excluded.length > 0 && <> · {excluded.length} left out</>}
                {project.skipped.length > 0 && <> · {project.skipped.length} folders skipped</>}
              </p>
            </div>

            <div className="mt-6 grid gap-6 sm:grid-cols-2">
              <fieldset>
                <legend className="label">Scripts to generate</legend>
                {(Object.keys(FORMATS) as ScriptFormat[]).map((f) => (
                  <label key={f} className="mt-2 flex items-start gap-2 text-sm">
                    <input
                      type="checkbox"
                      className="mt-0.5"
                      checked={formats.has(f)}
                      onChange={() => {
                        setResults(null);
                        setFormats((prev) => {
                          const next = new Set(prev);
                          if (next.has(f)) next.delete(f);
                          else next.add(f);
                          return next;
                        });
                      }}
                    />
                    <span>
                      <code className="font-mono">.{FORMATS[f].ext}</code> {FORMATS[f].label}
                    </span>
                  </label>
                ))}
              </fieldset>
              <fieldset>
                <legend className="label">Size</legend>
                <label className="mt-2 flex items-center gap-2 text-sm">
                  <input type="radio" checked={!split} onChange={() => (setSplit(false), setResults(null))} />
                  One script
                </label>
                <label className="mt-2 flex flex-wrap items-center gap-2 text-sm">
                  <input type="radio" checked={split} onChange={() => (setSplit(true), setResults(null))} />
                  Split into parts of about
                  <input
                    type="number"
                    min={20}
                    step={10}
                    value={partKB}
                    onChange={(e) => (setPartKB(Math.max(20, Number(e.target.value) || 100)), setResults(null))}
                    className="input w-20 py-1"
                  />
                  KB
                </label>
                <p className="mt-1 text-xs text-zinc-500">Splitting helps when a paste tool limits size.</p>
                <label className="mt-4 flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={useGitignore}
                    onChange={(e) => (setUseGitignore(e.target.checked), setResults(null))}
                  />
                  Leave out files matched by .gitignore
                </label>
              </fieldset>
            </div>

            {largeFiles.length > 0 && (
              <p className="mt-6 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
                {largeFiles.length} file{largeFiles.length > 1 ? "s are" : " is"} over 1 MB (
                {largeFiles
                  .slice(0, 3)
                  .map((c) => c.file.path)
                  .join(", ")}
                {largeFiles.length > 3 ? ", ..." : ""}). They make the script much bigger. Untick them below if the
                other machine can get them another way.
              </p>
            )}

            <button
              onClick={generate}
              disabled={!!busy || !formats.size || !included.length}
              className="btn-primary mt-6 w-full sm:w-auto"
            >
              Generate script{split || formats.size > 1 ? "s" : ""}
            </button>
          </section>

          {results && <Results results={results} copied={copied} onCopy={copy} />}

          <section className="card mt-8">
            <div className="flex flex-wrap items-center gap-2">
              {(["included", "excluded"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
                    tab === t
                      ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                      : "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
                  }`}
                >
                  {t === "included" ? `Included (${included.length})` : `Left out (${excluded.length})`}
                </button>
              ))}
              <input
                placeholder="Filter files"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                className="input ml-auto w-full py-1.5 sm:w-56"
              />
            </div>

            {tab === "excluded" && project.skipped.length > 0 && (
              <div className="mt-4 text-sm">
                <p className="label">Skipped folders (rebuilt by tools, never included)</p>
                <p className="mt-1 text-zinc-600 dark:text-zinc-400">
                  {project.skipped
                    .slice(0, 12)
                    .map((s) => (s.files ? `${s.path}/ (${s.files.toLocaleString()} files)` : `${s.path}/`))
                    .join(" · ")}
                  {project.skipped.length > 12 && ` · and ${project.skipped.length - 12} more`}
                </p>
              </div>
            )}

            <ul className="mt-4 divide-y divide-zinc-100 text-sm dark:divide-zinc-800">
              {rows.slice(0, ROW_LIMIT).map((c) => (
                <li key={c.file.path} className="flex items-center gap-3 py-1.5">
                  <input type="checkbox" checked={isIncluded(c)} onChange={() => toggle(c)} />
                  <span className="min-w-0 flex-1 truncate font-mono text-xs" title={c.file.path}>
                    {c.file.path}
                  </span>
                  {c.reason && (
                    <span
                      className={`shrink-0 rounded px-1.5 py-0.5 text-xs ${
                        c.reason === "secret"
                          ? "bg-red-50 text-red-700 dark:bg-red-950/50 dark:text-red-300"
                          : "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400"
                      }`}
                    >
                      {REASON_LABEL[c.reason]}
                    </span>
                  )}
                  <span className="w-16 shrink-0 text-right text-xs text-zinc-500 tabular-nums">
                    {formatBytes(c.file.size)}
                  </span>
                </li>
              ))}
            </ul>
            {rows.length > ROW_LIMIT && (
              <p className="mt-2 text-xs text-zinc-500">
                Showing {ROW_LIMIT} of {rows.length}. Use the filter to find others.
              </p>
            )}
            {!rows.length && <p className="mt-4 text-sm text-zinc-500">No files.</p>}
          </section>
        </>
      )}
    </div>
  );
}

function Results({
  results,
  copied,
  onCopy,
}: {
  results: GeneratedScript[];
  copied: string | null;
  onCopy: (s: GeneratedScript) => void;
}) {
  const byFormat = (Object.keys(FORMATS) as ScriptFormat[])
    .map((f) => ({ format: f, scripts: results.filter((s) => s.format === f) }))
    .filter((g) => g.scripts.length);
  const parts = results[0]?.parts ?? 1;

  return (
    <section className="card mt-8">
      <h2 className="text-lg font-semibold">Your script{results.length > 1 ? "s" : ""}</h2>
      {byFormat.map(({ format, scripts }) => {
        const total = scripts.reduce((n, s) => n + s.content.length, 0);
        return (
          <div key={format} className="mt-6">
            <h3 className="label">{FORMATS[format].label}</h3>
            <ul className="mt-2 space-y-2">
              {scripts.map((s) => (
                <li
                  key={s.fileName}
                  className="flex flex-wrap items-center gap-3 rounded-lg border border-zinc-200 px-3 py-2 dark:border-zinc-800"
                >
                  <span className="min-w-0 basis-full truncate font-mono text-sm sm:flex-1 sm:basis-auto">{s.fileName}</span>
                  <span className="text-xs text-zinc-500 tabular-nums">
                    {s.fileCount} files · {formatBytes(s.content.length)}
                  </span>
                  <button onClick={() => onCopy(s)} className="btn-secondary py-1">
                    {copied === s.fileName ? "Copied" : "Copy"}
                  </button>
                  <button onClick={() => download(s.fileName, s.content)} className="btn-secondary py-1">
                    Download
                  </button>
                </li>
              ))}
            </ul>
            {total > LARGE_SCRIPT && parts === 1 && (
              <p className="mt-2 text-xs text-amber-700 dark:text-amber-300">
                {formatBytes(total)} is a lot to paste. If the paste gets cut off, use &quot;Split into parts&quot;.
              </p>
            )}
            <HowToRun format={format} scripts={scripts} />
          </div>
        );
      })}
    </section>
  );
}

function HowToRun({ format, scripts }: { format: ScriptFormat; scripts: GeneratedScript[] }) {
  const first = scripts[0];
  const parts = first.parts;
  return (
    <div className="mt-3 rounded-lg bg-zinc-50 p-4 text-sm dark:bg-zinc-950/70">
      <p className="font-medium">On the other machine</p>
      <ol className="mt-2 list-decimal space-y-1 pl-5 text-zinc-700 dark:text-zinc-300">
        <li>Create an empty folder and open a terminal in it.</li>
        <li>
          {parts > 1 ? `For each of the ${parts} parts, paste` : "Paste"} the script into a new file named exactly{" "}
          <code className="font-mono">{parts > 1 ? first.fileName.replace("-part-1-", "-part-N-") : first.fileName}</code>{" "}
          in that folder.
        </li>
        <li>
          Run{parts > 1 ? " each part (any order)" : ""}:
          <pre className="mt-1 overflow-x-auto rounded bg-zinc-900 px-3 py-2 font-mono text-xs text-zinc-100 dark:border dark:border-zinc-700 dark:bg-black">
            {scripts.map((s) => FORMATS[format].run(s.fileName)).join("\n")}
          </pre>
        </li>
        <li>It checks every file against the original and prints the next steps (such as npm install).</li>
      </ol>
      {format === "node" && (
        <p className="mt-2 text-xs text-zinc-500">
          Needs Node.js 18+. Add <code className="font-mono">--dry-run</code> to preview,{" "}
          <code className="font-mono">--force</code> to update an existing copy, <code className="font-mono">--prune</code>{" "}
          to also delete files the project no longer has.
        </p>
      )}
      {format === "powershell" && (
        <p className="mt-2 text-xs text-zinc-500">Needs Windows 10 (1803) or newer. Add -Force to update an existing copy.</p>
      )}
      {format === "bash" && (
        <p className="mt-2 text-xs text-zinc-500">Prefix with FORCE=1 to update an existing copy.</p>
      )}
    </div>
  );
}
