import { IGNORABLE_ENTRIES, MANIFEST_FILE, type ScriptMeta } from "./meta";

/**
 * Node.js extractor. Only uses built-in modules, so it runs anywhere Node 18+ runs:
 * macOS, Linux, Windows (cmd, PowerShell) and Git Bash.
 * The payload sits in a function at the bottom so the readable code stays at the top.
 */
export function nodeScript(meta: ScriptMeta, payload: string): string {
  const partLabel = meta.parts > 1 ? ` - part ${meta.part} of ${meta.parts}` : "";
  return `#!/usr/bin/env node
// ${meta.name}${partLabel} (${meta.files.length} files). Generated ${meta.generatedAt} by Code Hub.
//
// Run:   node <this file> [target-folder] [--dry-run] [--force] [--prune]
//   target-folder  where to write the project (default: current folder)
//   --dry-run      show what would change, write nothing
//   --force        write into a folder that holds something else
//   --prune        when updating, delete files that are no longer part of the project
// Needs Node.js 18 or newer. Uses only built-in modules.
import { createHash } from "node:crypto";
import { gunzipSync } from "node:zlib";
import { chmodSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { basename, dirname, isAbsolute, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const META = ${JSON.stringify(meta)};
const MANIFEST = ${JSON.stringify(MANIFEST_FILE)};
const IGNORABLE = new Set(${JSON.stringify(IGNORABLE_ENTRIES)});

const args = process.argv.slice(2);
const flags = new Set(args.filter((a) => a.startsWith("--")));
const unknown = [...flags].filter((f) => !["--dry-run", "--force", "--prune"].includes(f));
if (unknown.length) fail("Unknown option " + unknown.join(", ") + ". Options: --dry-run --force --prune");
const target = resolve(args.find((a) => !a.startsWith("--")) ?? ".");
const dryRun = flags.has("--dry-run");
const self = basename(fileURLToPath(import.meta.url));
const sha = (buf) => createHash("sha256").update(buf).digest("hex");

function fail(message) {
  console.error("\\n" + message);
  process.exit(1);
}

// 1. Check the payload is complete before touching the disk.
const gz = Buffer.from(payload().replace(/\\s+/g, ""), "base64");
if (sha(gz) !== META.payloadSha) {
  fail("This script is damaged, probably cut off while copying. Copy the whole script again.");
}
const tar = gunzipSync(gz);

// 2. Make sure we are not writing over a different project.
let previous = null;
try {
  previous = JSON.parse(readFileSync(join(target, MANIFEST), "utf8").replace(/^\\uFEFF/, ""));
} catch {}
if (!flags.has("--force")) {
  if (previous && previous.name !== META.name) {
    fail('This folder holds a different project ("' + previous.name + '"). Use an empty folder, or pass --force.');
  }
  if (!previous && existsSync(target)) {
    const others = readdirSync(target).filter((n) => n !== self && !IGNORABLE.has(n) && !n.startsWith(META.slug + "-"));
    if (others.length) {
      fail(
        "The folder " + target + " is not empty (" + others.slice(0, 3).join(", ") + (others.length > 3 ? ", ..." : "") + ").\\n" +
          "Run this in an empty folder, pass a folder: node " + self + ' "path/to/new-folder"\\n' +
          "or, to update an existing copy of " + META.name + ", pass --force.",
      );
    }
  }
}

// 3. Read the tar archive.
function* entries(buf) {
  let offset = 0;
  let paxPath = null;
  while (offset + 512 <= buf.length) {
    const h = buf.subarray(offset, offset + 512);
    if (h.every((b) => b === 0)) break;
    const field = (start, len) => {
      const raw = h.subarray(start, start + len);
      const end = raw.indexOf(0);
      return raw.subarray(0, end < 0 ? len : end).toString("utf8");
    };
    const size = parseInt(field(124, 12).trim() || "0", 8);
    const type = h[156] ? String.fromCharCode(h[156]) : "0";
    const prefix = field(345, 155);
    const body = buf.subarray(offset + 512, offset + 512 + size);
    offset += 512 + Math.ceil(size / 512) * 512;
    if (type === "x") {
      const text = body.toString("utf8");
      const m = /(?:^|\\n)\\d+ path=([^\\n]*)\\n/.exec(text);
      if (m) paxPath = m[1];
      continue;
    }
    const path = paxPath ?? (prefix ? prefix + "/" : "") + field(0, 100);
    paxPath = null;
    yield {
      path: path.replace(/\\/+$/, ""),
      type,
      mode: parseInt(field(100, 8).trim() || "644", 8),
      mtime: parseInt(field(136, 12).trim() || "0", 8),
      body,
    };
  }
}

function safePath(p) {
  const n = normalize(p);
  if (!p || isAbsolute(p) || /^[a-zA-Z]:/.test(p) || n.split(/[\\\\/]/).includes("..")) fail("Refusing unsafe path in archive: " + p);
  return join(target, n);
}

// 4. Write files.
const counts = { created: 0, updated: 0, unchanged: 0 };
if (!dryRun) mkdirSync(target, { recursive: true });
for (const e of entries(tar)) {
  const dest = safePath(e.path);
  if (e.type === "5") {
    if (!dryRun) mkdirSync(dest, { recursive: true });
    continue;
  }
  if (e.type !== "0") continue;
  const existing = existsSync(dest) ? readFileSync(dest) : null;
  const state = !existing ? "created" : sha(existing) === sha(e.body) ? "unchanged" : "updated";
  counts[state]++;
  if (dryRun) {
    if (state !== "unchanged") console.log("  would be " + state + ": " + e.path);
    continue;
  }
  if (state !== "unchanged") {
    mkdirSync(dirname(dest), { recursive: true });
    writeFileSync(dest, e.body);
  }
  if (process.platform !== "win32") chmodSync(dest, e.mode & 0o777);
  if (e.mtime) utimesSync(dest, e.mtime, e.mtime);
}

// 5. Remove files that an earlier version of this project had and this one doesn't.
const known = previous && previous.name === META.name && Array.isArray(previous.files) ? previous.files : [];
const stale = META.allPaths ? known.filter((p) => !META.allPaths.includes(p) && existsSync(join(target, p))) : [];
if (stale.length) {
  const doPrune = flags.has("--prune") && !dryRun;
  console.log("\\n" + stale.length + " file(s) are no longer part of " + META.name + (doPrune ? ", removed:" : ":"));
  for (const p of stale) {
    console.log("  " + p);
    if (doPrune) rmSync(safePath(p), { force: true });
  }
  if (!flags.has("--prune")) console.log("Run again with --prune to delete them.");
}

console.log(
  "\\n" + META.name + (META.parts > 1 ? " part " + META.part + " of " + META.parts : "") + ": " +
    counts.created + " created, " + counts.updated + " updated, " + counts.unchanged + " unchanged" +
    (dryRun ? " (dry run, nothing written)" : "") + ".",
);
if (dryRun) process.exit(0);

// 6. Verify every file against the hash taken from the original upload.
const bad = META.files.filter(([p, h]) => {
  try {
    return sha(readFileSync(join(target, p))) !== h;
  } catch {
    return true;
  }
});
if (bad.length) fail("These files did not verify: " + bad.map(([p]) => p).join(", "));
console.log("All " + META.files.length + " files verified (SHA-256 matches the upload).");

// 7. Record what we wrote, so later runs can update and prune safely.
const keep = META.allPaths && flags.has("--prune") ? known.filter((p) => META.allPaths.includes(p)) : known;
const partsDone = new Set(previous && previous.name === META.name ? previous.partsDone ?? [] : []);
partsDone.add(META.part);
writeFileSync(
  join(target, MANIFEST),
  JSON.stringify(
    {
      name: META.name,
      generatedAt: META.generatedAt,
      parts: META.parts,
      partsDone: [...partsDone].sort((a, b) => a - b),
      files: [...new Set([...keep, ...META.files.map(([p]) => p)])].sort(),
    },
    null,
    1,
  ) + "\\n",
);

if (META.parts > 1 && partsDone.size < META.parts) {
  const missing = Array.from({ length: META.parts }, (_, i) => i + 1).filter((n) => !partsDone.has(n));
  console.log("\\nStill to run: part " + missing.join(", ") + " of " + META.parts + ".");
} else {
  if (META.leftOut.length) {
    console.log("\\nNot included (copy these by hand, they may hold secrets): " + META.leftOut.join(", "));
  }
  if (META.nextSteps.length) {
    console.log("\\nNext, in " + target + ":");
    for (const step of META.nextSteps) console.log("  " + step);
  }
  console.log("\\nYou can delete " + self + " now.");
}

function payload() {
  return \`
${payload}
\`;
}
`;
}
