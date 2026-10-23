import ignore, { type Ignore } from "ignore";
import type { SourceFile } from "./types";

/**
 * Folder names skipped anywhere in the tree. They are rebuilt by package managers or build tools,
 * and usually make up most of a project's size.
 */
export const SKIP_DIRS = new Set([
  "node_modules",
  ".git",
  ".next",
  ".nuxt",
  ".svelte-kit",
  ".turbo",
  ".vercel",
  ".expo",
  ".cache",
  ".parcel-cache",
  ".gradle",
  ".idea",
  "Pods",
  "DerivedData",
  "__pycache__",
  ".venv",
  "venv",
  ".pytest_cache",
  ".mypy_cache",
  "coverage",
]);

/** Build output folders, skipped only at these exact paths (a top-level `build/` can be source code). */
export const SKIP_PATHS = ["android/build", "android/app/build", "android/.cxx", "android/app/.cxx", "ios/build"];

const JUNK_FILES = new Set([".DS_Store", "Thumbs.db", "desktop.ini"]);

/** Files that usually hold keys or passwords. Excluded unless the user opts in per file. */
const SECRET_PATTERNS: RegExp[] = [
  /^\.env(\..+)?$/,
  /\.(pem|key|p12|pfx|keystore|jks|mobileprovision|p8)$/i,
  /^google-services\.json$/,
  /^GoogleService-Info\.plist$/,
  /^id_(rsa|dsa|ecdsa|ed25519)(\.pub)?$/,
  /^\.npmrc$/,
  /^credentials\.json$/,
  /^service-?account.*\.json$/i,
];

const SAFE_ENV = /^\.env\.(example|sample|template|defaults)$/;

export function isSkippedDir(dirPath: string): boolean {
  const name = dirPath.split("/").pop() ?? "";
  return SKIP_DIRS.has(name) || SKIP_PATHS.includes(dirPath);
}

/** Returns the skipped folder that contains this path, or null. */
export function skippedAncestor(path: string): string | null {
  const parts = path.split("/");
  for (let i = 1; i < parts.length; i++) {
    const dir = parts.slice(0, i).join("/");
    if (isSkippedDir(dir)) return dir;
  }
  return null;
}

export function isJunk(path: string): boolean {
  return JUNK_FILES.has(path.split("/").pop() ?? "");
}

export function isSecret(path: string): boolean {
  const name = path.split("/").pop() ?? "";
  if (SAFE_ENV.test(name)) return false;
  return SECRET_PATTERNS.some((re) => re.test(name));
}

/**
 * Applies every .gitignore in the project, deepest last, so nested files can re-include
 * (`!pattern`) what a parent excluded. Close to git's rules without the edge cases nobody relies on.
 */
export async function loadGitignore(files: SourceFile[]): Promise<(path: string) => boolean> {
  const rules: { dir: string; ig: Ignore }[] = [];
  const decoder = new TextDecoder();
  for (const f of files) {
    if (f.path !== ".gitignore" && !f.path.endsWith("/.gitignore")) continue;
    const dir = f.path.slice(0, -".gitignore".length).replace(/\/$/, "");
    rules.push({ dir, ig: ignore().add(decoder.decode(await f.read())) });
  }
  rules.sort((a, b) => a.dir.split("/").length - b.dir.split("/").length);
  return (path) => {
    let ignored = false;
    for (const { dir, ig } of rules) {
      if (dir && !path.startsWith(dir + "/")) continue;
      const rel = dir ? path.slice(dir.length + 1) : path;
      const result = ig.test(rel);
      if (result.ignored) ignored = true;
      else if (result.unignored) ignored = false;
    }
    return ignored;
  };
}

export type ExcludeReason = "gitignore" | "secret" | "junk";

export interface Classified {
  file: SourceFile;
  /** Null when the file is included by default. */
  reason: ExcludeReason | null;
}

export async function classify(files: SourceFile[], useGitignore: boolean): Promise<Classified[]> {
  const ignored = useGitignore ? await loadGitignore(files) : () => false;
  return files.map((file) => {
    let reason: ExcludeReason | null = null;
    if (isJunk(file.path)) reason = "junk";
    else if (isSecret(file.path)) reason = "secret";
    else if (ignored(file.path)) reason = "gitignore";
    return { file, reason };
  });
}

/** Unix permission bits. Browsers don't expose them, so executables are recognised by name or shebang. */
export function guessMode(path: string, data: Uint8Array): number {
  const name = path.split("/").pop() ?? "";
  const executable =
    (data[0] === 0x23 && data[1] === 0x21) || // "#!"
    ["gradlew", "mvnw"].includes(name) ||
    /\.(sh|command)$/.test(name) ||
    (path.startsWith(".husky/") && !name.startsWith(".") && !path.startsWith(".husky/_/"));
  return executable ? 0o755 : 0o644;
}
