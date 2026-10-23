import { unzip } from "fflate";
import { SKIP_DIRS, skippedAncestor } from "./pack/filters";
import type { SkippedDir, SourceFile, SourceProject } from "./pack/types";

/** Counts files under skipped folders, so the UI can say "node_modules (41,203 files) skipped". */
class SkipCounter {
  private counts = new Map<string, number>();
  add(dir: string) {
    this.counts.set(dir, (this.counts.get(dir) ?? 0) + 1);
  }
  list(): SkippedDir[] {
    return [...this.counts].map(([path, files]) => ({ path, files })).sort((a, b) => b.files - a.files);
  }
}

const fileSource = (path: string, file: File): SourceFile => ({
  path,
  size: file.size,
  mtime: file.lastModified,
  read: async () => new Uint8Array(await file.arrayBuffer()),
});

/** From <input type="file" webkitdirectory>. Paths look like "my-app/src/index.ts". */
export function fromFolderInput(list: FileList): SourceProject {
  const files: SourceFile[] = [];
  const skipped = new SkipCounter();
  let name = "project";
  for (const file of Array.from(list)) {
    const [root, ...rest] = file.webkitRelativePath.split("/");
    name = root || name;
    const path = rest.join("/");
    const skip = skippedAncestor(path);
    if (skip) skipped.add(skip);
    else files.push(fileSource(path, file));
  }
  return { name, files, emptyDirs: [], skipped: skipped.list() };
}

function readAllEntries(dir: FileSystemDirectoryEntry): Promise<FileSystemEntry[]> {
  const reader = dir.createReader();
  const all: FileSystemEntry[] = [];
  return new Promise((resolve, reject) => {
    // readEntries returns at most 100 entries per call.
    const next = () =>
      reader.readEntries((batch) => {
        if (!batch.length) return resolve(all);
        all.push(...batch);
        next();
      }, reject);
    next();
  });
}

const entryFile = (entry: FileSystemFileEntry) => new Promise<File>((resolve, reject) => entry.file(resolve, reject));

/** Skipped folders on drag and drop are never walked, so a dropped node_modules costs nothing. */
async function walkEntries(entries: FileSystemEntry[], name: string): Promise<SourceProject> {
  const files: SourceFile[] = [];
  const emptyDirs: string[] = [];
  const skipped: SkippedDir[] = [];
  const walk = async (entry: FileSystemEntry, path: string) => {
    if (entry.isFile) {
      files.push(fileSource(path, await entryFile(entry as FileSystemFileEntry)));
      return;
    }
    if (path && skippedAncestor(path + "/x")) {
      skipped.push({ path, files: 0 });
      return;
    }
    const children = await readAllEntries(entry as FileSystemDirectoryEntry);
    if (path && !children.length) emptyDirs.push(path);
    for (const child of children) await walk(child, path ? `${path}/${child.name}` : child.name);
  };
  for (const e of entries) await walk(e, e.isDirectory && entries.length === 1 ? "" : e.name);
  return { name, files, emptyDirs, skipped };
}

/** Must be called synchronously inside the drop handler: the DataTransfer is cleared afterwards. */
export function fromDrop(dataTransfer: DataTransfer): Promise<SourceProject> {
  const entries = Array.from(dataTransfer.items)
    .map((item) => item.webkitGetAsEntry())
    .filter((e): e is FileSystemEntry => e !== null);
  const files = Array.from(dataTransfer.files);
  if (entries.length === 1 && entries[0].isFile && files[0]?.name.toLowerCase().endsWith(".zip")) {
    return fromZip(files[0]);
  }
  if (!entries.length) return Promise.reject(new Error("Nothing to read. Drop a folder or a .zip file."));
  const name = entries.length === 1 && entries[0].isDirectory ? entries[0].name : "project";
  return walkEntries(entries, name);
}

export async function fromZip(file: File): Promise<SourceProject> {
  const raw = new Uint8Array(await file.arrayBuffer());
  const skippedByName = new SkipCounter();
  const unzipped = await new Promise<Record<string, Uint8Array>>((resolve, reject) =>
    unzip(
      raw,
      {
        filter: (f) => {
          if (f.name.startsWith("__MACOSX/")) return false;
          const parts = f.name.split("/");
          const i = parts.findIndex((p, idx) => idx < parts.length - 1 && SKIP_DIRS.has(p));
          if (i >= 0) {
            skippedByName.add(parts.slice(0, i + 1).join("/"));
            return false;
          }
          return true;
        },
      },
      (err, data) => (err ? reject(err) : resolve(data)),
    ),
  );

  const names = Object.keys(unzipped);
  // Most zips wrap everything in one folder named after the project: strip it.
  const roots = new Set(names.map((n) => n.split("/")[0]));
  const single = roots.size === 1 && names.every((n) => n.includes("/")) ? [...roots][0] : null;
  const strip = (n: string) => (single ? n.slice(single.length + 1) : n);
  const name = single ?? file.name.replace(/\.zip$/i, "");

  const files: SourceFile[] = [];
  const dirs = new Set<string>();
  const extraSkipped = new SkipCounter();
  for (const n of names) {
    const path = strip(n);
    if (!path) continue;
    if (path.endsWith("/")) {
      dirs.add(path.slice(0, -1));
      continue;
    }
    const skip = skippedAncestor(path);
    if (skip) {
      extraSkipped.add(skip);
      continue;
    }
    const data = unzipped[n];
    files.push({ path, size: data.length, read: async () => data });
  }
  const nonEmpty = new Set<string>();
  for (const n of names) {
    const parts = strip(n).replace(/\/$/, "").split("/");
    for (let i = 1; i < parts.length; i++) nonEmpty.add(parts.slice(0, i).join("/"));
  }
  const emptyDirs = [...dirs].filter((d) => !nonEmpty.has(d) && !skippedAncestor(d + "/x"));
  const skipped = [...skippedByName.list().map((s) => ({ ...s, path: strip(s.path) })), ...extraSkipped.list()];
  return { name, files, emptyDirs, skipped };
}
