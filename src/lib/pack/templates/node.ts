import { IGNORABLE_ENTRIES, MANIFEST_FILE, type ScriptMeta } from "./meta";

/**
 * Node.js extractor. Only uses built-in modules, so it runs anywhere Node 18+ runs:
 * macOS, Linux, Windows (cmd, PowerShell) and Git Bash.
 * The payload sits in a function at the bottom so the readable code stays at the top.
 */
const SETUP_USAGE = `// Run:   node <this file> [target-folder] [--dry-run] [--force] [--prune]
//   target-folder  where to write the project (default: current folder)
//   --dry-run      show what would change, write nothing
//   --force        write into a folder that holds something else
//   --prune        when updating, delete files that are no longer part of the project`;

const UPDATE_USAGE = `// Update an existing copy: run it inside the project folder (the one with package.json).
// Run:   node <this file> [project-folder] [--dry-run] [--keep] [--no-install] [--force]
//   --dry-run      show what would change, write nothing
//   --keep         don't delete files this version no longer uses
//   --no-install   don't run npm install, even if packages changed
//   --force        apply even if the folder doesn't look like this project
// Your .env files and anything else that isn't part of the project are left alone.`;

export function nodeScript(meta: ScriptMeta, payload: string): string {
  const partLabel = meta.parts > 1 ? ` - part ${meta.part} of ${meta.parts}` : "";
  return `#!/usr/bin/env node
// ${meta.name}${meta.update ? " update" : ""}${partLabel} (${meta.files.length} files). Generated ${meta.generatedAt} by Code Hub.
//
${meta.update ? UPDATE_USAGE : SETUP_USAGE}
// Needs Node.js 18 or newer. Uses only built-in modules.
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { gunzipSync } from "node:zlib";
import { chmodSync, existsSync, mkdirSync, readdirSync, readFileSync, rmdirSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { basename, dirname, isAbsolute, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const META = ${JSON.stringify(meta)};
const MANIFEST = ${JSON.stringify(MANIFEST_FILE)};
const IGNORABLE = new Set(${JSON.stringify(IGNORABLE_ENTRIES)});

const UPDATE = META.update;
const OPTIONS = UPDATE ? ["--dry-run", "--keep", "--no-install", "--force"] : ["--dry-run", "--force", "--prune"];
const args = process.argv.slice(2);
const flags = new Set(args.filter((a) => a.startsWith("--")));
const unknown = [...flags].filter((f) => !OPTIONS.includes(f));
if (unknown.length) fail("Unknown option " + unknown.join(", ") + ". Options: " + OPTIONS.join(" "));
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
// Names this project has had (an update script accepts copies made under an earlier name).
const NAMES = UPDATE ? UPDATE.projectNames : [META.name];
const sameProject = (name) => NAMES.includes(name);
if (UPDATE && !flags.has("--force")) {
  let pkgName = null;
  try {
    pkgName = JSON.parse(readFileSync(join(target, "package.json"), "utf8")).name;
  } catch {}
  if (pkgName === null && !previous) {
    fail(
      "No package.json in " + target + ".\\nRun this inside your " + META.name + " project folder, or pass the folder: node " + self + ' "path/to/project"' +
        "\\nFor a new copy, use the setup script instead.",
    );
  }
  if (!sameProject(pkgName) && !(previous && sameProject(previous.name))) {
    fail('This folder holds a different project ("' + (pkgName ?? previous.name) + '"). Run it in your ' + META.name + " folder, or pass --force.");
  }
} else if (!flags.has("--force")) {
  if (previous && previous.name !== META.name) {
    fail('This folder holds a different project ("' + previous.name + '"). Use an empty folder, or pass --force.');
  }
  if (!previous && existsSync(target)) {
    // No manifest: an existing copy from git or a zip is fine, as long as it is this project.
    let pkgName = null;
    try {
      pkgName = JSON.parse(readFileSync(join(target, "package.json"), "utf8")).name ?? null;
    } catch {}
    if (META.packageName && pkgName && pkgName !== META.packageName) {
      fail('This folder holds a different project ("' + pkgName + '"). Use an empty folder, or pass --force.');
    }
    const allowed = new Set(META.knownEntries);
    const present = readdirSync(target).filter((n) => n !== self && !IGNORABLE.has(n) && !n.startsWith(META.slug + "-"));
    const others = present.filter((n) => !allowed.has(n));
    const sameCopy = META.packageName !== null && pkgName === META.packageName;
    if (others.length && !sameCopy) {
      fail(
        "The folder " + target + " has files that are not part of " + META.name + " (" + others.slice(0, 3).join(", ") + (others.length > 3 ? ", ..." : "") + ").\\n" +
          "Run this in an empty folder: node " + self + ' "path/to/new-folder"\\n' +
          "or write into this folder anyway: node " + self + " --force",
      );
    }
    if (present.length) {
      console.log("Found an existing copy of " + META.name + ". Changed files are overwritten; your other files are kept.");
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
const PACKAGE_FILES = ["package.json", "package-lock.json"];
const packagesChanged = [];
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
  if (state !== "unchanged" && PACKAGE_FILES.includes(e.path)) packagesChanged.push(e.path);
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

// 5. Remove files that an earlier version of this project had and this one doesn't. Only files that
//    earlier scripts recorded in the manifest, or that this update lists as obsolete, are ever touched.
const known = previous && sameProject(previous.name) && Array.isArray(previous.files) ? previous.files : [];
const candidates = [...new Set([...known, ...(UPDATE ? UPDATE.obsolete : [])])];
const stale = META.allPaths ? candidates.filter((p) => !META.allPaths.includes(p) && existsSync(join(target, p))) : [];
const pruning = UPDATE ? !flags.has("--keep") : flags.has("--prune");

/** Deletes folders left empty by a removed file, up to (not including) the project folder. */
function removeEmptyParents(file) {
  let dir = dirname(file);
  while (dir.length > target.length && dir.startsWith(target)) {
    try {
      if (readdirSync(dir).length) return;
      rmdirSync(dir);
    } catch {
      return;
    }
    dir = dirname(dir);
  }
}

if (stale.length) {
  const doPrune = pruning && !dryRun;
  console.log(
    "\\n" + stale.length + " file(s) are no longer part of " + META.name +
      (doPrune ? ", removed:" : dryRun && pruning ? ", would be removed:" : ":"),
  );
  for (const p of stale) {
    console.log("  " + p);
    if (doPrune) {
      const abs = safePath(p);
      rmSync(abs, { force: true });
      removeEmptyParents(abs);
    }
  }
  if (!pruning) console.log(UPDATE ? "They were kept because of --keep." : "Run again with --prune to delete them.");
}

console.log(
  "\\n" + META.name + (META.parts > 1 ? " part " + META.part + " of " + META.parts : "") + ": " +
    counts.created + " created, " + counts.updated + " updated, " + counts.unchanged + " unchanged" +
    (dryRun ? " (dry run, nothing written)" : "") + ".",
);
if (dryRun) {
  if (UPDATE && packagesChanged.length) console.log("Packages changed, so the update would run npm install.");
  process.exit(0);
}

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
const keep = META.allPaths && pruning ? known.filter((p) => META.allPaths.includes(p)) : known;
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

// 8. Update scripts install changed packages themselves.
if (UPDATE && packagesChanged.length) {
  if (flags.has("--no-install")) {
    console.log("\\nPackages changed (" + packagesChanged.join(", ") + "). Run npm install before starting the app.");
  } else {
    console.log("\\nPackages changed, running npm install...");
    const r = spawnSync("npm", ["install"], { cwd: target, stdio: "inherit", shell: process.platform === "win32" });
    if (r.status !== 0) console.log("\\nnpm install failed. Fix the error above, then run npm install yourself.");
  }
}

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
