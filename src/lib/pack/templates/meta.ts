/** Everything a generated script needs to know besides the payload itself. */
export interface ScriptMeta {
  name: string;
  /** File-name-safe version of the name, used for script names and the folder check. */
  slug: string;
  part: number;
  parts: number;
  /** SHA-256 of the gzipped payload, to detect a cut-off paste before extracting anything. */
  payloadSha: string;
  /** [path, sha256] for every file in this part. */
  files: [string, string][];
  /** Every file path in the whole project (all parts), so a re-run can remove files the project dropped. */
  allPaths: string[] | null;
  /** Commands to show after extracting, e.g. "npm ci". */
  nextSteps: string[];
  /** Files left out on purpose (secrets), so the user knows to copy them by hand. */
  leftOut: string[];
  generatedAt: string;
}

export const MANIFEST_FILE = ".code-to-script.json";

/** Folder entries a target may contain before we call it "not empty". */
export const IGNORABLE_ENTRIES = [".DS_Store", "Thumbs.db", "desktop.ini", MANIFEST_FILE];
