"use client";

import { sha256 } from "@/lib/pack/encode";
import type { GeneratedScript } from "@/lib/pack/types";
import { CHUNK_BYTES, type CloudFile, type CloudList, type CloudUpload } from "./shared";

/** Fired on window after an upload, download or delete, so the sidebar count refreshes. */
export const CLOUD_CHANGED = "codehub:cloud-changed";
const changed = () => window.dispatchEvent(new Event(CLOUD_CHANGED));

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { cache: "no-store", ...init });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? `Request failed (${res.status}).`);
  }
  return (res.status === 204 ? null : res.json()) as Promise<T>;
}

export const listUploads = () => api<CloudList>("/api/scripts");
export const findUpload = (code: string) => api<CloudUpload>(`/api/scripts/${code}`);

export async function deleteUpload(code: string): Promise<void> {
  await api<null>(`/api/scripts/${code}`, { method: "DELETE" });
  changed();
}

/** Uploads generated scripts in chunks and returns the finished upload. Cleans up if anything fails. */
export async function uploadScripts(
  name: string,
  project: string,
  scripts: GeneratedScript[],
  onProgress: (sent: number, total: number) => void,
): Promise<CloudUpload> {
  const encoder = new TextEncoder();
  const bytes = scripts.map((s) => encoder.encode(s.content));
  const declared = await Promise.all(
    scripts.map(async (s, i) => ({
      fileName: s.fileName,
      format: s.format,
      part: s.part,
      parts: s.parts,
      fileCount: s.fileCount,
      size: bytes[i].length,
      sha256: await sha256(bytes[i]),
    })),
  );
  const total = bytes.reduce((n, b) => n + b.length, 0);
  const { code, files } = await api<{ code: string; files: CloudFile[] }>("/api/scripts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, project, files: declared }),
  });

  try {
    let sent = 0;
    onProgress(0, total);
    for (let i = 0; i < files.length; i++) {
      for (let seq = 0; seq < files[i].chunks; seq++) {
        const chunk = bytes[i].subarray(seq * CHUNK_BYTES, (seq + 1) * CHUNK_BYTES);
        await api<null>(`/api/scripts/${code}/chunks/${i}/${seq}`, {
          method: "PUT",
          headers: { "Content-Type": "application/octet-stream" },
          body: chunk as Uint8Array<ArrayBuffer>,
        });
        sent += chunk.length;
        onProgress(sent, total);
      }
    }
    const upload = await api<CloudUpload>(`/api/scripts/${code}`, { method: "PATCH" });
    changed();
    return upload;
  } catch (err) {
    await fetch(`/api/scripts/${code}`, { method: "DELETE" }).catch(() => {});
    throw err;
  }
}

/** Downloads one file of an upload and checks its SHA-256. Throws on any mismatch. */
export async function downloadFile(
  code: string,
  index: number,
  file: CloudFile,
  onBytes: (n: number) => void,
): Promise<Uint8Array> {
  const out = new Uint8Array(file.size);
  let offset = 0;
  for (let seq = 0; seq < file.chunks; seq++) {
    const res = await fetch(`/api/scripts/${code}/chunks/${index}/${seq}`, { cache: "no-store" });
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      throw new Error(body?.error ?? `Download failed (${res.status}).`);
    }
    const chunk = new Uint8Array(await res.arrayBuffer());
    if (offset + chunk.length > out.length) throw new Error(`${file.fileName} is larger than expected.`);
    out.set(chunk, offset);
    offset += chunk.length;
    onBytes(chunk.length);
  }
  if (offset !== file.size || (await sha256(out)) !== file.sha256) {
    throw new Error(`${file.fileName} failed the SHA-256 check. The cloud copy was kept; try again.`);
  }
  return out;
}

export function saveBlob(fileName: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement("a"), { href: url, download: fileName });
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
