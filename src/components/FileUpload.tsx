"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type DragEvent, type ReactNode } from "react";
import { formatBytes } from "@/lib/bytes";
import { listUploads, uploadFiles } from "@/lib/cloud/client";
import { KEEP_HOURS, type CloudStorage, type CloudUpload } from "@/lib/cloud/shared";
import { useServerStatus } from "@/lib/useServerStatus";
import PageHeader from "./PageHeader";

const svg = (path: ReactNode, className = "size-4") => (
  <svg viewBox="0 0 24 24" className={`${className} shrink-0`} fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    {path}
  </svg>
);
const UPLOAD = <path d="M7 18h10.5a4.5 4.5 0 0 0 .5-8.97A6 6 0 0 0 6.5 10.03 4 4 0 0 0 7 18zM12 15v-5M9.5 12.5 12 10l2.5 2.5" />;
const FILE = <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8zM14 3v5h5" />;

const key = (f: File) => `${f.name}:${f.size}:${f.lastModified}`;

/** Upload any files to the cloud under one code. They show up under Uploaded Files. */
export default function FileUpload() {
  const status = useServerStatus();
  const input = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [name, setName] = useState("");
  const [dragging, setDragging] = useState(false);
  const [storage, setStorage] = useState<CloudStorage | null>(null);
  const [progress, setProgress] = useState<{ sent: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<CloudUpload | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!status?.cloud) return;
    let live = true;
    listUploads()
      .then((l) => live && setStorage(l.storage))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [status?.cloud, done]);

  const size = files.reduce((n, f) => n + f.size, 0);
  const tooBig = storage ? size > storage.maxUpload : false;
  const noSpace = storage ? storage.used + size > storage.usable : false;
  const defaultName = files.length === 1 ? files[0].name : files.length ? `${files.length} files` : "";

  function add(list: FileList | File[]) {
    setDone(null);
    setError(null);
    setFiles((prev) => {
      const seen = new Set(prev.map(key));
      return [...prev, ...Array.from(list).filter((f) => !seen.has(key(f)))];
    });
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    setDragging(false);
    if (e.dataTransfer.files.length) add(e.dataTransfer.files);
  }

  async function upload() {
    setError(null);
    try {
      const result = await uploadFiles(name.trim() || defaultName, files, (sent, total) => setProgress({ sent, total }));
      setDone(result);
      setFiles([]);
      setName("");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setProgress(null);
    }
  }

  async function copyCode(code: string) {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const header = (
    <PageHeader title="Upload Files">
      Upload any files to the cloud and pick them up on another device under Uploaded Files. Every file is checked with
      SHA-256 on download. Files are deleted after download, or after {KEEP_HOURS} hours.
    </PageHeader>
  );

  if (status && !status.cloud) {
    return (
      <div className="w-full px-4 py-6 sm:px-7">
        {header}
        <p className="rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
          Cloud upload is not set up. Add <code className="font-mono">MONGODB_URI</code> (a free MongoDB Atlas connection
          string) to <code className="font-mono">.env.local</code> and restart <code className="font-mono">npm run dev</code>.
        </p>
      </div>
    );
  }

  return (
    <div className="w-full px-4 py-6 sm:px-7">
      {header}

      {done && (
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl bg-green-50 px-4 py-3 text-sm text-green-900 dark:bg-green-950/40 dark:text-green-200">
          {svg(<path d="M5 12l5 5 9-10" />)}
          <span>
            Uploaded <strong>{done.name}</strong> ({done.files.length} file{done.files.length > 1 ? "s" : ""},{" "}
            {formatBytes(done.size)}). Code:
          </span>
          <code className="rounded bg-white px-2 py-0.5 font-mono text-base font-semibold tracking-widest text-zinc-900 dark:bg-black dark:text-zinc-100">
            {done.code}
          </code>
          <button className="btn-secondary py-1" onClick={() => copyCode(done.code)}>
            {copied ? "Copied" : "Copy code"}
          </button>
          <Link href="/scripts" className="btn-secondary py-1">
            Open Uploaded Files
          </Link>
        </div>
      )}

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
        <span className="mx-auto grid size-12 place-items-center rounded-full bg-gradient-to-br from-blue-600 to-violet-600 text-white">
          {svg(UPLOAD, "size-6")}
        </span>
        <p className="mt-3 font-medium">Drop files here</p>
        <p className="mt-1 text-sm text-zinc-500">
          Any type: documents, images, archives, code
          {storage && <>. Up to {formatBytes(storage.maxUpload)} per upload</>}
        </p>
        <button onClick={() => input.current?.click()} className="btn-primary mt-4">
          Choose files
        </button>
        <input
          ref={input}
          type="file"
          multiple
          hidden
          onChange={(e) => {
            if (e.target.files?.length) add(e.target.files);
            e.target.value = "";
          }}
        />
      </div>

      {files.length > 0 && (
        <section className="card mt-4">
          <div className="flex items-center gap-3 text-sm">
            <span className="font-medium">
              {files.length} file{files.length > 1 ? "s" : ""} selected
            </span>
            <span className="text-zinc-500 tabular-nums">{formatBytes(size)}</span>
            <button
              type="button"
              onClick={() => setFiles([])}
              disabled={!!progress}
              className="ml-auto text-xs text-blue-600 hover:underline disabled:opacity-50 dark:text-blue-400"
            >
              Clear all
            </button>
          </div>

          <ul className="mt-3 max-h-72 divide-y divide-zinc-100 overflow-y-auto rounded-lg border border-zinc-200 text-sm dark:divide-zinc-800 dark:border-zinc-800">
            {files.map((f) => (
              <li key={key(f)} className="flex items-center gap-3 px-3 py-2">
                <span className="text-zinc-400">{svg(FILE)}</span>
                <span className="min-w-0 flex-1 truncate" title={f.name}>
                  {f.name}
                </span>
                <span className="shrink-0 text-xs text-zinc-500 tabular-nums">{formatBytes(f.size)}</span>
                <button
                  onClick={() => setFiles((prev) => prev.filter((x) => x !== f))}
                  disabled={!!progress}
                  aria-label={`Remove ${f.name}`}
                  className="rounded p-1 text-zinc-400 hover:bg-zinc-100 hover:text-red-600 disabled:opacity-50 dark:hover:bg-zinc-800"
                >
                  {svg(<path d="M6 6l12 12M18 6L6 18" />)}
                </button>
              </li>
            ))}
          </ul>

          <div className="mt-4 flex flex-wrap items-end gap-3">
            <label className="min-w-48 flex-1">
              <span className="text-xs text-zinc-500">Reference name</span>
              <input
                value={name}
                maxLength={100}
                onChange={(e) => setName(e.target.value)}
                placeholder={defaultName}
                className="input mt-1 w-full"
              />
            </label>
            <button onClick={upload} disabled={!!progress || tooBig || noSpace} className="btn-primary flex items-center gap-1.5">
              {svg(UPLOAD)}
              {progress ? "Uploading..." : `Upload ${files.length} file${files.length > 1 ? "s" : ""} (${formatBytes(size)})`}
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
          {storage && (tooBig || noSpace) && (
            <p className="mt-2 text-xs text-red-700 dark:text-red-300">
              {tooBig
                ? `Too big: the limit is ${formatBytes(storage.maxUpload)} per upload. Remove some files.`
                : `Not enough cloud space: ${formatBytes(storage.used)} of ${formatBytes(storage.usable)} used. Download or delete older uploads first.`}
            </p>
          )}
        </section>
      )}

      {error && (
        <p className="mt-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-800 dark:bg-red-950/50 dark:text-red-300">{error}</p>
      )}
    </div>
  );
}
