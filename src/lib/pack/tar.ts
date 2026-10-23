import type { PackFile } from "./types";

/**
 * Minimal POSIX (pax/ustar) tar writer. Long or non-ASCII paths get a pax "path" record,
 * which GNU tar, bsdtar (macOS, Windows tar.exe) and our own Node extractor all read.
 */

const encoder = new TextEncoder();
const BLOCK = 512;

function writeString(buf: Uint8Array, offset: number, length: number, value: string) {
  const bytes = encoder.encode(value);
  buf.set(bytes.subarray(0, length), offset);
}

function writeOctal(buf: Uint8Array, offset: number, length: number, value: number) {
  writeString(buf, offset, length, value.toString(8).padStart(length - 1, "0") + "\0");
}

function header(name: string, size: number, mode: number, mtime: number, type: string): Uint8Array {
  const h = new Uint8Array(BLOCK);
  writeString(h, 0, 100, name);
  writeOctal(h, 100, 8, mode);
  writeOctal(h, 108, 8, 0);
  writeOctal(h, 116, 8, 0);
  writeOctal(h, 124, 12, size);
  writeOctal(h, 136, 12, Math.floor(mtime / 1000));
  h.fill(0x20, 148, 156); // checksum is computed with this field as spaces
  writeString(h, 156, 1, type);
  writeString(h, 257, 6, "ustar\0");
  writeString(h, 263, 2, "00");
  let sum = 0;
  for (const b of h) sum += b;
  writeString(h, 148, 8, sum.toString(8).padStart(6, "0") + "\0 ");
  return h;
}

function paxRecord(key: string, value: string): Uint8Array {
  const body = ` ${key}=${value}\n`;
  const bodyLen = encoder.encode(body).length;
  // The length prefix counts its own digits.
  let len = bodyLen + String(bodyLen).length;
  len = bodyLen + String(len).length;
  return encoder.encode(len + body);
}

function needsPax(path: string): boolean {
  return encoder.encode(path).length > 100 || /[^\x20-\x7e]/.test(path);
}

function padded(data: Uint8Array): Uint8Array[] {
  const rest = data.length % BLOCK;
  return rest ? [data, new Uint8Array(BLOCK - rest)] : [data];
}

export function createTar(files: PackFile[], emptyDirs: string[] = []): Uint8Array {
  const chunks: Uint8Array[] = [];
  const add = (path: string, data: Uint8Array, mode: number, mtime: number, type: string) => {
    let name = path;
    if (needsPax(path)) {
      const record = paxRecord("path", path);
      chunks.push(header("PaxHeader", record.length, 0o644, mtime, "x"), ...padded(record));
      name = path.replace(/[^\x20-\x7e]/g, "_").slice(-100);
    }
    chunks.push(header(name, data.length, mode, mtime, type), ...padded(data));
  };
  for (const dir of emptyDirs) add(dir + "/", new Uint8Array(0), 0o755, Date.now(), "5");
  for (const f of files) add(f.path, f.data, f.mode, f.mtime, "0");
  chunks.push(new Uint8Array(BLOCK * 2));

  const total = chunks.reduce((n, c) => n + c.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.length;
  }
  return out;
}
