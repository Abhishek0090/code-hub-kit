import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { isSkippedDir } from "../src/lib/pack/filters";
import type { SourceFile } from "../src/lib/pack/types";

/** Node equivalent of what the browser does with a picked folder. */
export function readProject(dir: string, extraSkip: string[] = []): { files: SourceFile[]; emptyDirs: string[] } {
  const files: SourceFile[] = [];
  const emptyDirs: string[] = [];
  const walk = (abs: string) => {
    const entries = readdirSync(abs, { withFileTypes: true });
    const rel = relative(dir, abs).split("\\").join("/");
    if (rel && !entries.length) emptyDirs.push(rel);
    for (const e of entries) {
      const p = join(abs, e.name);
      const r = relative(dir, p).split("\\").join("/");
      if (e.isDirectory()) {
        if (!isSkippedDir(r) && !extraSkip.includes(r)) walk(p);
      } else if (e.isFile()) {
        const st = statSync(p);
        files.push({ path: r, size: st.size, mtime: st.mtimeMs, read: async () => new Uint8Array(readFileSync(p)) });
      }
    }
  };
  walk(dir);
  return { files, emptyDirs };
}
