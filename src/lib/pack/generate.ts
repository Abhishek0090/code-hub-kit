import { estimateCompressed, gzipAsync, sha256, toBase64, wrapLines } from "./encode";
import { guessMode } from "./filters";
import { createTar } from "./tar";
import { bashScript } from "./templates/bash";
import type { ScriptMeta, UpdateOptions } from "./templates/meta";
import { nodeScript } from "./templates/node";
import { powershellScript } from "./templates/powershell";
import type { GeneratedScript, PackFile, ScriptFormat, SourceFile } from "./types";

export const FORMATS: Record<ScriptFormat, { ext: string; label: string; run: (file: string) => string }> = {
  node: { ext: "mjs", label: "Node.js (macOS, Windows, Linux, Git Bash)", run: (f) => `node ${f}` },
  bash: { ext: "sh", label: "Bash (macOS, Linux, Git Bash), no Node needed", run: (f) => `bash ${f}` },
  powershell: {
    ext: "ps1",
    label: "PowerShell (Windows), no Node needed",
    run: (f) => `powershell -ExecutionPolicy Bypass -File .\\${f}`,
  },
};

const TEMPLATES = { node: nodeScript, bash: bashScript, powershell: powershellScript };

/** Script code around the payload, in bytes. Used to budget parts. */
const FIXED_OVERHEAD = 7000;
const PER_FILE_OVERHEAD = 90;
const LINE_WIDTH = 120;

export function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "project";
}

export async function loadFiles(files: SourceFile[], onProgress?: (done: number) => void): Promise<PackFile[]> {
  const out: PackFile[] = [];
  for (const f of files) {
    const data = await f.read();
    out.push({
      path: f.path,
      data,
      mode: guessMode(f.path, data),
      mtime: f.mtime ?? Date.now(),
      sha256: await sha256(data),
    });
    onProgress?.(out.length);
  }
  return out.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
}

/**
 * Greedy split by path order (keeps related files together, which compresses better).
 * A file bigger than the budget gets a part of its own.
 */
export function splitIntoParts(files: PackFile[], partBytes: number | null): PackFile[][] {
  if (!partBytes) return [files];
  const budget = Math.max(((partBytes - FIXED_OVERHEAD) * 3) / 4, 1024);
  const parts: PackFile[][] = [];
  let current: PackFile[] = [];
  let used = 0;
  for (const f of files) {
    const cost = estimateCompressed(f.data) + PER_FILE_OVERHEAD + f.path.length;
    if (current.length && used + cost > budget) {
      parts.push(current);
      current = [];
      used = 0;
    }
    current.push(f);
    used += cost;
  }
  if (current.length || !parts.length) parts.push(current);
  return parts;
}

/** Commands to run after unpacking, guessed from well-known files. */
export function guessNextSteps(files: PackFile[], leftOut: string[]): string[] {
  const has = (p: string) => files.some((f) => f.path === p);
  const steps: string[] = [];
  if (has("package.json")) {
    const pm = has("pnpm-lock.yaml") ? "pnpm" : has("yarn.lock") ? "yarn" : has("bun.lock") || has("bun.lockb") ? "bun" : "npm";
    steps.push(pm === "npm" ? (has("package-lock.json") ? "npm ci" : "npm install") : `${pm} install`);
    if (has("ios/Podfile")) steps.push("cd ios && pod install && cd ..   (macOS only, for the iOS app)");
    try {
      const pkg = JSON.parse(new TextDecoder().decode(files.find((f) => f.path === "package.json")!.data));
      const run = pm === "npm" ? "npm run" : pm;
      const script = ["dev", "start", "android", "ios"].find((s) => pkg.scripts?.[s]);
      if (script) steps.push(`${run} ${script}`);
    } catch {}
  }
  if (has("requirements.txt")) steps.push("pip install -r requirements.txt");
  else if (has("poetry.lock")) steps.push("poetry install");
  else if (has("uv.lock")) steps.push("uv sync");
  if (has("go.mod")) steps.push("go mod download");
  if (has("Cargo.toml")) steps.push("cargo build");
  if (has("Gemfile")) steps.push("bundle install");
  if (has("composer.json")) steps.push("composer install");
  const example = [".env.example", ".env.sample", ".env.template"].find(has);
  if (example && leftOut.some((p) => /(^|\/)\.env/.test(p))) {
    steps.unshift(`copy ${example} to .env.local or .env and fill in your values`);
  }
  return steps;
}

export interface GenerateInput {
  name: string;
  files: PackFile[];
  emptyDirs: string[];
  formats: ScriptFormat[];
  /** Target size of each script in bytes, or null for a single script. */
  partBytes: number | null;
  leftOut: string[];
  /** Makes an update script (`<name>-update`) that applies onto an existing copy. Node format only. */
  update?: UpdateOptions;
  /** Replaces the guessed "next steps" printed at the end. */
  nextSteps?: string[];
}

export async function generateScripts(input: GenerateInput): Promise<GeneratedScript[]> {
  const slug = slugify(input.name);
  const groups = splitIntoParts(input.files, input.partBytes);
  const parts = groups.length;
  const nextSteps = input.nextSteps ?? guessNextSteps(input.files, input.leftOut);
  const generatedAt = new Date().toISOString().slice(0, 16).replace("T", " ") + " UTC";
  const out: GeneratedScript[] = [];

  for (let i = 0; i < parts; i++) {
    const group = groups[i];
    const gz = await gzipAsync(createTar(group, i === 0 ? input.emptyDirs : []));
    const meta: ScriptMeta = {
      name: input.name,
      slug,
      part: i + 1,
      parts,
      payloadSha: await sha256(gz),
      files: group.map((f) => [f.path, f.sha256]),
      allPaths: parts === 1 ? input.files.map((f) => f.path) : null,
      nextSteps,
      leftOut: input.leftOut,
      generatedAt,
      update: input.update ?? null,
    };
    const payload = wrapLines(toBase64(gz), LINE_WIDTH);
    for (const format of input.formats) {
      const kind = input.update ? "update" : "setup";
      const base = parts === 1 ? `${slug}-${kind}` : `${slug}-${kind === "update" ? "update-" : ""}part-${i + 1}-of-${parts}`;
      out.push({
        format,
        fileName: `${base}.${FORMATS[format].ext}`,
        content: TEMPLATES[format](meta, payload),
        part: i + 1,
        parts,
        fileCount: group.length,
      });
    }
  }
  return out;
}
