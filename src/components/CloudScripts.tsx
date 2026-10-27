"use client";

import { zipSync } from "fflate";
import Link from "next/link";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { formatBytes } from "@/lib/bytes";
import { deleteUpload, downloadFile, findUpload, listUploads, saveBlob } from "@/lib/cloud/client";
import { CODE_RE, KEEP_HOURS, normalizeCode, type CloudStorage, type CloudUpload } from "@/lib/cloud/shared";
import { FORMATS, slugify } from "@/lib/pack/generate";
import type { ScriptFormat } from "@/lib/pack/types";
import { useServerStatus } from "@/lib/useServerStatus";
import PageHeader from "./PageHeader";

const FORMAT_SHORT: Record<ScriptFormat, string> = { node: "Node.js", bash: "Bash", powershell: "PowerShell" };
const FORMAT_CHIP: Record<ScriptFormat, string> = {
  node: "bg-green-50 text-green-700 dark:bg-green-950/60 dark:text-green-300",
  bash: "bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300",
  powershell: "bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300",
};

function ago(iso: string, now: number): string {
  const min = Math.round((now - Date.parse(iso)) / 60_000);
  if (min < 1) return "just now";
  if (min < 60) return `${min} min ago`;
  const h = Math.round(min / 60);
  return h < 48 ? `${h} h ago` : `${Math.round(h / 24)} days ago`;
}

function left(iso: string, now: number): string {
  const min = Math.max(0, Math.round((Date.parse(iso) - now) / 60_000));
  return min < 60 ? `${min} min` : `${Math.round(min / 60)} h`;
}

const svg = (path: ReactNode, className = "size-4") => (
  <svg viewBox="0 0 24 24" className={`${className} shrink-0`} fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    {path}
  </svg>
);
const CLOUD = <path d="M7 18h10.5a4.5 4.5 0 0 0 .5-8.97A6 6 0 0 0 6.5 10.03 4 4 0 0 0 7 18z" />;

function Stat({ label, value, children }: { label: string; value: ReactNode; children?: ReactNode }) {
  return (
    <div className="card !p-4">
      <p className="text-xs font-medium uppercase tracking-wider text-zinc-500">{label}</p>
      <p className="mt-1 text-xl font-semibold tabular-nums">{value}</p>
      {children}
    </div>
  );
}

function Bar({ pct, tone = "bg-blue-600" }: { pct: number; tone?: string }) {
  return (
    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
      <div className={`h-full rounded-full transition-[width] ${tone}`} style={{ width: `${Math.min(100, pct)}%` }} />
    </div>
  );
}

type Busy = { code: string; done: number; total: number };

export default function CloudScripts() {
  const status = useServerStatus();
  const [uploads, setUploads] = useState<CloudUpload[] | null>(null);
  const [storage, setStorage] = useState<CloudStorage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState<Busy | null>(null);
  const [rowError, setRowError] = useState<{ code: string; message: string } | null>(null);
  const [deleteAfter, setDeleteAfter] = useState(true);
  const [codeInput, setCodeInput] = useState("");
  const [search, setSearch] = useState("");
  const [highlight, setHighlight] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [now, setNow] = useState(0);

  const apply = (l: { uploads: CloudUpload[]; storage: CloudStorage }) => {
    setUploads(l.uploads);
    setStorage(l.storage);
    setError(null);
  };
  const fail = (e: unknown) => setError(e instanceof Error ? e.message : String(e));

  useEffect(() => {
    if (!status?.cloud) return;
    let live = true;
    const load = () =>
      listUploads()
        .then((l) => {
          if (!live) return;
          setUploads(l.uploads);
          setStorage(l.storage);
          setNow(Date.now());
          setError(null);
        })
        .catch((e) => live && setError(e instanceof Error ? e.message : String(e)));
    load();
    const t = setInterval(() => {
      setNow(Date.now());
      load();
    }, 30_000);
    return () => {
      live = false;
      clearInterval(t);
    };
  }, [status?.cloud]);

  function refresh() {
    setNow(Date.now());
    listUploads().then(apply, fail);
  }

  async function find(e: FormEvent) {
    e.preventDefault();
    const code = normalizeCode(codeInput);
    if (!CODE_RE.test(code)) return fail(new Error("A code is 6 letters and digits, like K7M2QX."));
    try {
      const upload = await findUpload(code);
      setUploads((list) => [upload, ...(list ?? []).filter((u) => u.code !== code)]);
      setNow(Date.now());
      setHighlight(code);
      setSearch("");
      setError(null);
      setCodeInput("");
    } catch (err) {
      fail(err);
    }
  }

  async function copyCode(code: string) {
    await navigator.clipboard.writeText(code);
    setCopied(code);
    setTimeout(() => setCopied((c) => (c === code ? null : c)), 1500);
  }

  /** Downloads every file (one file as-is, several as a zip). Deletes the upload only after all pass SHA-256. */
  async function downloadAll(upload: CloudUpload) {
    setRowError(null);
    setNotice(null);
    const total = upload.size;
    let done = 0;
    setBusy({ code: upload.code, done, total });
    try {
      const files: Record<string, Uint8Array> = {};
      for (let i = 0; i < upload.files.length; i++) {
        const f = upload.files[i];
        files[f.fileName] = await downloadFile(upload.code, i, f, (n) => {
          done += n;
          setBusy({ code: upload.code, done, total });
        });
      }
      if (upload.files.length === 1) {
        const [f] = upload.files;
        saveBlob(f.fileName, new Blob([files[f.fileName] as Uint8Array<ArrayBuffer>], { type: "text/plain" }));
      } else {
        const zip = zipSync(files, { level: 6 });
        saveBlob(`${slugify(upload.name)}-scripts.zip`, new Blob([zip as Uint8Array<ArrayBuffer>], { type: "application/zip" }));
      }
      if (deleteAfter) {
        await deleteUpload(upload.code);
        setUploads((list) => list?.filter((u) => u.code !== upload.code) ?? null);
        setNotice(`Downloaded "${upload.name}" (all files passed SHA-256) and removed it from the cloud.`);
        listUploads().then(apply, () => {});
      } else {
        setNotice(`Downloaded "${upload.name}". All files passed SHA-256. The cloud copy was kept.`);
      }
    } catch (e) {
      setRowError({ code: upload.code, message: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(null);
    }
  }

  /** One file, never deletes: for grabbing a single format without wiping the rest. */
  async function downloadOne(upload: CloudUpload, index: number) {
    setRowError(null);
    const f = upload.files[index];
    let done = 0;
    setBusy({ code: upload.code, done, total: f.size });
    try {
      const bytes = await downloadFile(upload.code, index, f, (n) => {
        done += n;
        setBusy({ code: upload.code, done, total: f.size });
      });
      saveBlob(f.fileName, new Blob([bytes as Uint8Array<ArrayBuffer>], { type: "text/plain" }));
    } catch (e) {
      setRowError({ code: upload.code, message: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(null);
    }
  }

  async function remove(upload: CloudUpload) {
    if (!confirm(`Delete "${upload.name}" (${upload.code}) from the cloud? This can't be undone.`)) return;
    setRowError(null);
    try {
      await deleteUpload(upload.code);
      setUploads((list) => list?.filter((u) => u.code !== upload.code) ?? null);
      setNotice(`Deleted "${upload.name}".`);
      listUploads().then(apply, () => {});
    } catch (e) {
      setRowError({ code: upload.code, message: e instanceof Error ? e.message : String(e) });
    }
  }

  const header = (
    <PageHeader title="Uploaded Scripts">
      Scripts uploaded from Project to Script, waiting to be picked up on another device. Each download is checked with
      SHA-256, then the upload is deleted so the database stays clean. Anything not downloaded is deleted after{" "}
      {KEEP_HOURS} hours.
    </PageHeader>
  );

  if (status && !status.cloud) {
    return (
      <div className="w-full px-4 py-6 sm:px-7">
        {header}
        <div className="card flex gap-4">
          <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300">
            {svg(CLOUD, "size-5")}
          </span>
          <div className="text-sm text-zinc-700 dark:text-zinc-300">
            <p className="font-medium text-zinc-900 dark:text-zinc-100">Cloud upload is not set up</p>
            <ol className="mt-2 list-decimal space-y-1 pl-5">
              <li>Create a free MongoDB Atlas cluster (512 MB) and a database user.</li>
              <li>
                Allow your server&apos;s IP under Network Access (on Vercel, <code className="font-mono">0.0.0.0/0</code>).
              </li>
              <li>
                Set <code className="font-mono">MONGODB_URI</code> to the connection string in{" "}
                <code className="font-mono">.env.local</code> (or in Vercel&apos;s environment variables) and restart.
              </li>
            </ol>
          </div>
        </div>
      </div>
    );
  }

  const usedPct = storage ? (storage.used / storage.usable) * 100 : 0;
  const waitingBytes = uploads?.reduce((n, u) => n + u.size, 0) ?? 0;
  const q = search.trim().toLowerCase();
  const shown = uploads?.filter(
    (u) => !q || u.name.toLowerCase().includes(q) || u.project.toLowerCase().includes(q) || u.code.toLowerCase().includes(q),
  );

  return (
    <div className="w-full px-4 py-6 sm:px-7">
      {header}

      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="Waiting" value={uploads ? uploads.length : "-"}>
          <p className="mt-1 text-xs text-zinc-500">upload{uploads?.length === 1 ? "" : "s"} ready to download</p>
        </Stat>
        <Stat label="Waiting size" value={uploads ? formatBytes(waitingBytes) : "-"}>
          <p className="mt-1 text-xs text-zinc-500">
            max {storage ? formatBytes(storage.maxUpload) : "-"} per upload
          </p>
        </Stat>
        <Stat label="Cloud space" value={storage ? `${Math.round(usedPct)}%` : "-"}>
          {storage && (
            <>
              <Bar pct={usedPct} tone={usedPct > 85 ? "bg-red-500" : usedPct > 60 ? "bg-amber-500" : "bg-blue-600"} />
              <p className="mt-1.5 text-xs text-zinc-500 tabular-nums">
                {formatBytes(storage.used)} of {formatBytes(storage.usable)} usable ({formatBytes(storage.limit)} plan)
              </p>
            </>
          )}
        </Stat>
      </div>

      <section className="card mt-4 !p-4">
        <div className="flex flex-wrap items-center gap-3">
          <form onSubmit={find} className="flex items-center gap-2">
            <input
              value={codeInput}
              onChange={(e) => setCodeInput(e.target.value)}
              placeholder="Enter code"
              aria-label="Upload code"
              maxLength={12}
              className="input w-36 font-mono uppercase tracking-widest placeholder:normal-case placeholder:tracking-normal"
            />
            <button className="btn-primary">Find</button>
          </form>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filter by name or code"
            className="input min-w-48 flex-1"
          />
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={deleteAfter} onChange={(e) => setDeleteAfter(e.target.checked)} />
            Delete from cloud after download
          </label>
          <button onClick={refresh} className="btn-secondary flex items-center gap-1.5">
            {svg(<path d="M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7" />)}
            Refresh
          </button>
        </div>
      </section>

      {error && (
        <p className="mt-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-800 dark:bg-red-950/50 dark:text-red-300">{error}</p>
      )}
      {notice && (
        <p className="mt-4 flex items-center gap-2 rounded-lg bg-green-50 px-4 py-3 text-sm text-green-900 dark:bg-green-950/40 dark:text-green-200">
          {svg(<path d="M5 12l5 5 9-10" />)}
          {notice}
        </p>
      )}

      {!uploads && !error && (
        <ul className="mt-6 space-y-3">
          {[0, 1].map((i) => (
            <li key={i} className="card h-24 animate-pulse" />
          ))}
        </ul>
      )}

      {uploads?.length === 0 && (
        <div className="card mt-6 flex flex-col items-center py-12 text-center">
          <span className="grid size-12 place-items-center rounded-full bg-zinc-100 text-zinc-500 dark:bg-zinc-800">
            {svg(CLOUD, "size-6")}
          </span>
          <p className="mt-3 font-medium">Nothing uploaded</p>
          <p className="mt-1 text-sm text-zinc-500">Generate scripts on Project to Script, then choose Upload to cloud.</p>
          <Link href="/" className="btn-primary mt-4">
            Go to Project to Script
          </Link>
        </div>
      )}

      {uploads && uploads.length > 0 && shown?.length === 0 && (
        <p className="mt-6 text-sm text-zinc-500">No uploads match &quot;{search}&quot;.</p>
      )}

      <ul className="mt-6 space-y-3">
        {shown?.map((u) => {
          const formats = [...new Set(u.files.map((f) => f.format))];
          const parts = u.files[0]?.parts ?? 1;
          const projectFiles = u.files.filter((f) => f.format === u.files[0].format).reduce((n, f) => n + f.fileCount, 0);
          const isBusy = busy?.code === u.code;
          const expiringSoon = Date.parse(u.expiresAt) - now < 3 * 3_600_000;
          return (
            <li key={u.code} className={`card !p-0 overflow-hidden ${highlight === u.code ? "ring-2 ring-blue-500/60" : ""}`}>
              <div className="flex flex-wrap items-center gap-4 p-4 sm:p-5">
                <span className="grid size-11 shrink-0 place-items-center rounded-lg bg-gradient-to-br from-blue-600 to-violet-600 text-white">
                  {svg(CLOUD, "size-5")}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="truncate text-base font-semibold" title={u.name}>
                      {u.name}
                    </h3>
                    <button
                      onClick={() => copyCode(u.code)}
                      title="Copy code"
                      className="rounded-md border border-zinc-200 px-1.5 py-0.5 font-mono text-xs tracking-widest text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
                    >
                      {copied === u.code ? "Copied" : u.code}
                    </button>
                    {formats.map((f) => (
                      <span key={f} className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${FORMAT_CHIP[f]}`}>
                        {FORMAT_SHORT[f]}
                      </span>
                    ))}
                  </div>
                  <dl className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-xs text-zinc-500">
                    {u.project !== u.name && (
                      <div>
                        <dt className="inline">Project </dt>
                        <dd className="inline text-zinc-700 dark:text-zinc-300">{u.project}</dd>
                      </div>
                    )}
                    <div>
                      <dd className="inline text-zinc-700 dark:text-zinc-300">{u.files.length}</dd>{" "}
                      <dt className="inline">script file{u.files.length > 1 ? "s" : ""}</dt>
                      {parts > 1 && <> ({parts} parts each)</>}
                    </div>
                    <div>
                      <dd className="inline text-zinc-700 dark:text-zinc-300">{projectFiles.toLocaleString()}</dd>{" "}
                      <dt className="inline">project files</dt>
                    </div>
                    <div>
                      <dd className="inline text-zinc-700 dark:text-zinc-300 tabular-nums">{formatBytes(u.size)}</dd>
                    </div>
                    <div>
                      <dt className="inline">Uploaded </dt>
                      <dd className="inline text-zinc-700 dark:text-zinc-300" title={new Date(u.createdAt).toLocaleString()}>
                        {ago(u.createdAt, now)}
                      </dd>
                    </div>
                    <div>
                      <dt className="inline">Expires in </dt>
                      <dd
                        className={`inline ${expiringSoon ? "text-amber-600 dark:text-amber-400" : "text-zinc-700 dark:text-zinc-300"}`}
                        title={new Date(u.expiresAt).toLocaleString()}
                      >
                        {left(u.expiresAt, now)}
                      </dd>
                    </div>
                  </dl>
                </div>
                <div className="flex w-full gap-2 sm:w-auto">
                  <button
                    onClick={() => downloadAll(u)}
                    disabled={!!busy}
                    className="btn-primary flex flex-1 items-center justify-center gap-1.5 sm:flex-none"
                  >
                    {svg(<path d="M12 4v11M7 10l5 5 5-5M5 20h14" />)}
                    {isBusy ? "Downloading..." : u.files.length > 1 ? "Download all (.zip)" : "Download"}
                  </button>
                  <button
                    onClick={() => remove(u)}
                    disabled={!!busy}
                    title="Delete from cloud"
                    aria-label={`Delete ${u.name}`}
                    className="btn-secondary text-red-600 hover:!bg-red-50 disabled:opacity-50 dark:text-red-400 dark:hover:!bg-red-950/40"
                  >
                    {svg(<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" />)}
                  </button>
                </div>
              </div>

              {isBusy && (
                <div className="px-4 pb-4 sm:px-5">
                  <Bar pct={busy.total ? (busy.done / busy.total) * 100 : 0} />
                  <p className="mt-1 text-xs text-zinc-500 tabular-nums">
                    Downloading and checking: {formatBytes(busy.done)} of {formatBytes(busy.total)}
                  </p>
                </div>
              )}
              {rowError?.code === u.code && (
                <p className="mx-4 mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800 sm:mx-5 dark:bg-red-950/50 dark:text-red-300">
                  {rowError.message}
                </p>
              )}

              <details className="border-t border-zinc-100 dark:border-zinc-800">
                <summary className="cursor-pointer px-4 py-2.5 text-sm text-zinc-600 select-none hover:bg-zinc-50 sm:px-5 dark:text-zinc-400 dark:hover:bg-zinc-800/40">
                  Show {u.files.length} file{u.files.length > 1 ? "s" : ""}
                </summary>
                <div className="overflow-x-auto px-4 pb-4 sm:px-5">
                  <table className="w-full text-left text-sm">
                    <thead className="text-xs text-zinc-500">
                      <tr className="border-b border-zinc-100 dark:border-zinc-800">
                        <th className="py-2 pr-4 font-medium">File</th>
                        <th className="py-2 pr-4 font-medium">Format</th>
                        <th className="py-2 pr-4 font-medium">Part</th>
                        <th className="py-2 pr-4 text-right font-medium">Project files</th>
                        <th className="py-2 pr-4 text-right font-medium">Size</th>
                        <th className="py-2 pr-4 font-medium">SHA-256</th>
                        <th className="py-2 text-right font-medium">
                          <span className="sr-only">Actions</span>
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                      {u.files.map((f, i) => (
                        <tr key={f.fileName}>
                          <td className="py-2 pr-4 font-mono text-xs">{f.fileName}</td>
                          <td className="py-2 pr-4" title={FORMATS[f.format].label}>
                            <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${FORMAT_CHIP[f.format]}`}>
                              {FORMAT_SHORT[f.format]}
                            </span>
                          </td>
                          <td className="py-2 pr-4 text-xs tabular-nums">
                            {f.part} of {f.parts}
                          </td>
                          <td className="py-2 pr-4 text-right text-xs tabular-nums">{f.fileCount.toLocaleString()}</td>
                          <td className="py-2 pr-4 text-right text-xs tabular-nums">{formatBytes(f.size)}</td>
                          <td className="py-2 pr-4 font-mono text-xs text-zinc-500" title={f.sha256}>
                            {f.sha256.slice(0, 12)}...
                          </td>
                          <td className="py-2 text-right">
                            <button
                              onClick={() => downloadOne(u, i)}
                              disabled={!!busy}
                              className="btn-secondary px-2.5 py-1 text-xs"
                              title="Saves this file only. The upload stays in the cloud."
                            >
                              Save
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <p className="mt-2 text-xs text-zinc-500">Save downloads one file and keeps the upload in the cloud.</p>
                </div>
              </details>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
