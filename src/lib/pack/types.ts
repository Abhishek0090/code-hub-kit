/** A file found in the uploaded project. Bytes are read lazily so large skipped folders cost nothing. */
export interface SourceFile {
  /** Path relative to the project root, forward slashes, no leading "./". */
  path: string;
  size: number;
  /** Milliseconds since epoch, when the source provides it. */
  mtime?: number;
  read: () => Promise<Uint8Array>;
}

export interface SourceProject {
  name: string;
  files: SourceFile[];
  /** Directories that were empty in the source (zip and drag-and-drop only). */
  emptyDirs: string[];
  /** Folders skipped while reading (e.g. node_modules), with how many files they held. */
  skipped: SkippedDir[];
}

export interface SkippedDir {
  path: string;
  files: number;
}

/** A file ready to pack: bytes loaded, hash and mode known. */
export interface PackFile {
  path: string;
  data: Uint8Array;
  mode: number;
  mtime: number;
  sha256: string;
}

export type ScriptFormat = "node" | "bash" | "powershell";

export interface GeneratedScript {
  format: ScriptFormat;
  fileName: string;
  content: string;
  part: number;
  parts: number;
  fileCount: number;
}
