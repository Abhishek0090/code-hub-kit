import type { ScriptFormat } from "@/lib/pack/types";

/**
 * Cloud upload of generated scripts, shared by the browser and the API routes.
 * Files travel in chunks because Vercel functions cap request and response bodies at 4.5 MB.
 */
export const CHUNK_BYTES = 2 * 1024 * 1024;
/** Largest single upload (all its script files together). */
export const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;
/**
 * MongoDB Atlas free tier: 512 MB of uncompressed documents plus indexes. Override with CLOUD_STORAGE_MB on a
 * paid cluster.
 */
export const DEFAULT_STORAGE_MB = 512;
/** Uploads are refused past this share of the limit, leaving room for BSON and index overhead. */
export const STORAGE_HEADROOM = 0.9;
/** Uploads nobody downloads are deleted by a MongoDB TTL index after this long. */
export const KEEP_HOURS = 72;
/** An upload that never finishes (tab closed mid-way) is deleted after this long. */
export const PENDING_MINUTES = 60;

/** Six characters, no 0/O/1/I so the code survives being read aloud or retyped. */
export const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const CODE_RE = /^[A-HJ-NP-Z2-9]{6}$/;
export const FILE_NAME_RE = /^[A-Za-z0-9._-]{1,200}$/;
export const SCRIPT_FORMATS: ScriptFormat[] = ["node", "bash", "powershell"];
/** "file" is a plain file from Upload Files, stored as-is. */
export type CloudFormat = ScriptFormat | "file";
export const CLOUD_FORMATS: CloudFormat[] = [...SCRIPT_FORMATS, "file"];

export interface CloudFile {
  fileName: string;
  format: CloudFormat;
  part: number;
  parts: number;
  /** Project files inside this script. */
  fileCount: number;
  /** Script size in bytes (UTF-8). */
  size: number;
  sha256: string;
  chunks: number;
}

export interface CloudUpload {
  code: string;
  /** Reference name chosen at upload. */
  name: string;
  /** Project name the scripts were generated from. */
  project: string;
  files: CloudFile[];
  size: number;
  createdAt: string;
  expiresAt: string;
}

export interface CloudList {
  uploads: CloudUpload[];
  storage: CloudStorage;
}

export interface CloudStorage {
  /** Bytes MongoDB counts against the limit: documents plus indexes. */
  used: number;
  /** Bytes uploads may fill (limit x headroom). */
  usable: number;
  limit: number;
  maxUpload: number;
}

export const chunkCount =(size: number) => Math.max(1, Math.ceil(size / CHUNK_BYTES));

/** Bytes chunk `seq` of a file must hold. */
export const chunkLength = (size: number, seq: number) => Math.max(0, Math.min(CHUNK_BYTES, size - seq * CHUNK_BYTES));

/** Turns any file name into one FILE_NAME_RE accepts: "my report (1).pdf" becomes "my_report_1_.pdf". */
export function safeFileName(name: string): string {
  return name.replace(/[^A-Za-z0-9._-]+/g, "_").slice(-200) || "file";
}

export function normalizeCode(input: string): string {
  return input.toUpperCase().replace(/[^A-Z0-9]/g, "");
}
