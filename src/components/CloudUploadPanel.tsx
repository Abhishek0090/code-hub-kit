"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { formatBytes } from "@/lib/bytes";
import { listUploads, uploadScripts } from "@/lib/cloud/client";
import { KEEP_HOURS, type CloudStorage, type CloudUpload } from "@/lib/cloud/shared";
import { FORMATS } from "@/lib/pack/generate";
import type { GeneratedScript, ScriptFormat } from "@/lib/pack/types";
import { useServerStatus } from "@/lib/useServerStatus";

const PANEL =
  "mt-6 rounded-xl border border-blue-200 bg-blue-50/50 p-4 sm:p-5 dark:border-blue-900/60 dark:bg-blue-950/20";

function Heading() {
  return (
    <div className="flex items-center gap-3">
      <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-gradient-to-br from-blue-600 to-violet-600 text-white">
        <svg viewBox="0 0 24 24" className="size-[18px]" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M7 18h10.5a4.5 4.5 0 0 0 .5-8.97A6 6 0 0 0 6.5 10.03 4 4 0 0 0 7 18zM12 15v-5M9.5 12.5 12 10l2.5 2.5" />
        </svg>
      </span>
      <div>
        <h3 className="font-semibold">Upload to cloud</h3>
        <p className="text-xs text-zinc-500">
          Pick it up on another device under Uploaded Files. Deleted after download, or after {KEEP_HOURS} hours.
        </p>
      </div>
    </div>
  );
}

/**
 * "Upload to cloud" under the generated scripts. Several scripts (formats, split parts) go up together as one
 * upload with one code; the checklist picks which. Remounts with each new set of results.
 */
export default function CloudUploadPanel({ scripts, project }: { scripts: GeneratedScript[]; project: string }) {
  const status = useServerStatus();
  const [name, setName] = useState(project);
  const [picked, setPicked] = useState<Set<string>>(() => new Set(scripts.map((s) => s.fileName)));
  const [storage, setStorage] = useState<CloudStorage | null>(null);
  const [progress, setProgress] = useState<{ sent: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<CloudUpload[]>([]);
  const [copied, setCopied] = useState<string | null>(null);

  const sizes = useMemo(() => {
    const encoder = new TextEncoder();
    return new Map(scripts.map((s) => [s.fileName, encoder.encode(s.content).length]));
  }, [scripts]);
  const selected = scripts.filter((s) => picked.has(s.fileName));
  const size = selected.reduce((n, s) => n + (sizes.get(s.fileName) ?? 0), 0);
  const multiple = scripts.length > 1;

  // A split script only rebuilds the project with every part, so warn when a format is partly picked.
  const partial = (Object.keys(FORMATS) as ScriptFormat[]).filter((f) => {
    const all = scripts.filter((s) => s.format === f);
    const n = all.filter((s) => picked.has(s.fileName)).length;
    return n > 0 && n < all.length;
  });

  useEffect(() => {
    if (!status?.cloud) return;
    let live = true;
    listUploads()
      .then((l) => live && setStorage(l.storage))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [status?.cloud, done.length]);

  if (!status) return null;

  const uploadLabel = `Upload ${selected.length} file${selected.length === 1 ? "" : "s"} (${formatBytes(size)})`;

  if (!status.cloud) {
    return (
      <div className={PANEL}>
        <div className="flex flex-wrap items-center gap-3">
          <Heading />
          <button disabled className="btn-primary ml-auto">
            {uploadLabel}
          </button>
        </div>
        <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
          Not set up yet. Add <code className="font-mono">MONGODB_URI</code> (a free MongoDB Atlas connection string) to{" "}
          <code className="font-mono">.env.local</code> and restart <code className="font-mono">npm run dev</code>. Then
          you can upload here and download on another device from{" "}
          <Link href="/scripts" className="underline">
            Uploaded Files
          </Link>
          .
        </p>
      </div>
    );
  }

  const tooBig = storage ? size > storage.maxUpload : false;
  const noSpace = storage ? storage.used + size > storage.usable : false;
  const last = done.at(-1);

  function toggle(fileName: string) {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(fileName)) next.delete(fileName);
      else next.add(fileName);
      return next;
    });
  }

  async function upload() {
    setError(null);
    try {
      const result = await uploadScripts(name.trim() || project, project, selected, (sent, total) =>
        setProgress({ sent, total }),
      );
      setDone((d) => [...d, result]);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setProgress(null);
    }
  }

  async function copyCode(code: string) {
    await navigator.clipboard.writeText(code);
    setCopied(code);
    setTimeout(() => setCopied((c) => (c === code ? null : c)), 2000);
  }

  return (
    <div className={PANEL}>
      <Heading />

      {done.length > 0 && (
        <ul className="mt-3 space-y-2">
          {done.map((u) => (
            <li
              key={u.code}
              className="flex flex-wrap items-center gap-3 rounded-lg bg-green-50 px-4 py-3 text-sm text-green-900 dark:bg-green-950/40 dark:text-green-200"
            >
              <span>
                Uploaded <strong>{u.name}</strong> ({u.files.length} file{u.files.length > 1 ? "s" : ""},{" "}
                {formatBytes(u.size)}). Code:
              </span>
              <code className="rounded bg-white px-2 py-0.5 font-mono text-base font-semibold tracking-widest text-zinc-900 dark:bg-black dark:text-zinc-100">
                {u.code}
              </code>
              <button className="btn-secondary py-1" onClick={() => copyCode(u.code)}>
                {copied === u.code ? "Copied" : "Copy code"}
              </button>
              {u === last && (
                <Link href="/scripts" className="btn-secondary py-1">
                  Open Uploaded Files
                </Link>
              )}
            </li>
          ))}
        </ul>
      )}

      {multiple && (
        <fieldset className="mt-4">
          <legend className="sr-only">Files to upload</legend>
          <div className="flex items-center gap-3 text-xs text-zinc-500">
            <span>
              {selected.length} of {scripts.length} files selected. They upload together under one code.
            </span>
            <button
              type="button"
              className="text-blue-600 hover:underline dark:text-blue-400"
              onClick={() => setPicked(new Set(scripts.map((s) => s.fileName)))}
            >
              All
            </button>
            <button
              type="button"
              className="text-blue-600 hover:underline dark:text-blue-400"
              onClick={() => setPicked(new Set())}
            >
              None
            </button>
          </div>
          <ul className="mt-2 max-h-56 divide-y divide-zinc-100 overflow-y-auto rounded-lg border border-zinc-200 bg-white text-sm dark:divide-zinc-800 dark:border-zinc-800 dark:bg-zinc-900">
            {scripts.map((s) => (
              <li key={s.fileName}>
                <label className="flex items-center gap-3 px-3 py-1.5">
                  <input type="checkbox" checked={picked.has(s.fileName)} onChange={() => toggle(s.fileName)} />
                  <span className="min-w-0 flex-1 truncate font-mono text-xs">{s.fileName}</span>
                  <span className="shrink-0 text-xs text-zinc-500 tabular-nums">
                    {s.fileCount} files · {formatBytes(sizes.get(s.fileName) ?? 0)}
                  </span>
                </label>
              </li>
            ))}
          </ul>
          {partial.length > 0 && (
            <p className="mt-2 text-xs text-amber-700 dark:text-amber-300">
              Only some parts of the {partial.map((f) => FORMATS[f].label.split(" (")[0]).join(" and ")} script are
              selected. The other device needs every part to rebuild the project.
            </p>
          )}
        </fieldset>
      )}

      <div className="mt-3 flex flex-wrap items-end gap-3">
        <label className="min-w-48 flex-1">
          <span className="text-xs text-zinc-500">Reference name</span>
          <input
            value={name}
            maxLength={100}
            onChange={(e) => setName(e.target.value)}
            placeholder={project}
            className="input mt-1 w-full"
          />
        </label>
        <button
          onClick={upload}
          disabled={!!progress || !selected.length || tooBig || noSpace}
          className="btn-primary"
        >
          {progress ? "Uploading..." : done.length ? `Upload again: ${uploadLabel.slice(7)}` : uploadLabel}
        </button>
      </div>

      {progress && (
        <div className="mt-3">
          <div className="h-1.5 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
            <div
              className="h-full bg-blue-600 transition-[width]"
              style={{ width: `${progress.total ? (progress.sent / progress.total) * 100 : 0}%` }}
            />
          </div>
          <p className="mt-1 text-xs text-zinc-500 tabular-nums">
            {formatBytes(progress.sent)} of {formatBytes(progress.total)}
          </p>
        </div>
      )}
      {storage && (
        <p className={`mt-2 text-xs ${tooBig || noSpace ? "text-red-700 dark:text-red-300" : "text-zinc-500"}`}>
          {tooBig
            ? `Too big: the limit is ${formatBytes(storage.maxUpload)} per upload. Select fewer files or formats.`
            : noSpace
              ? `Not enough cloud space: ${formatBytes(storage.used)} of ${formatBytes(storage.usable)} used. Download or delete older uploads first.`
              : `Limit ${formatBytes(storage.maxUpload)} per upload. Cloud space: ${formatBytes(storage.used)} of ${formatBytes(storage.usable)} used.`}
        </p>
      )}
      {error && (
        <p className="mt-3 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-800 dark:bg-red-950/50 dark:text-red-300">{error}</p>
      )}
    </div>
  );
}
