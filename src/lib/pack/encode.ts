import { gzip, gzipSync, deflateSync } from "fflate";

export async function sha256(data: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", data as Uint8Array<ArrayBuffer>);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Gzips off the main thread where workers exist (browser), synchronously otherwise (Node self-test). */
export function gzipAsync(data: Uint8Array): Promise<Uint8Array> {
  if (typeof Worker === "undefined") return Promise.resolve(gzipSync(data, { level: 9, mtime: 0 }));
  return new Promise((resolve, reject) =>
    gzip(data, { level: 9, mtime: 0 }, (err, out) => (err ? reject(err) : resolve(out))),
  );
}

/** Rough compressed size, used only to decide how to split files into parts. */
export function estimateCompressed(data: Uint8Array): number {
  return data.length < 64 ? data.length : deflateSync(data, { level: 6 }).length;
}

export function toBase64(data: Uint8Array): string {
  let binary = "";
  const step = 0x8000;
  for (let i = 0; i < data.length; i += step) {
    binary += String.fromCharCode(...data.subarray(i, i + step));
  }
  return btoa(binary);
}

export function wrapLines(text: string, width: number): string {
  const lines: string[] = [];
  for (let i = 0; i < text.length; i += width) lines.push(text.slice(i, i + width));
  return lines.join("\n");
}
