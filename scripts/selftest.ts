/**
 * End-to-end check: packs a fixture project (or a real folder), runs every generated script
 * and compares the result byte for byte with the source.
 *
 *   npm run selftest                 built-in fixture with the awkward cases
 *   npm run selftest -- <folder>     a real project
 */
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import { classify } from "../src/lib/pack/filters";
import { generateScripts, loadFiles } from "../src/lib/pack/generate";
import type { ScriptFormat } from "../src/lib/pack/types";
import { readProject } from "./read-project";

const root = mkdtempSync(join(tmpdir(), "c2s-test-"));
let failures = 0;

function check(ok: boolean, label: string) {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}`);
  if (!ok) failures++;
}

function makeFixture(dir: string) {
  const write = (p: string, data: string | Uint8Array) => {
    mkdirSync(join(dir, p, ".."), { recursive: true });
    writeFileSync(join(dir, p), data);
  };
  write("package.json", JSON.stringify({ name: "fixture", scripts: { dev: "next dev" } }, null, 2));
  write("package-lock.json", "{}\n");
  write("src/app/page.tsx", "export default function Page() {\n  return <p>hi `${x}` $HOME</p>;\n}\n");
  write("windows-crlf.txt", "line one\r\nline two\r\n");
  write("public/random.bin", randomBytes(150_000));
  write("public/logo.png", randomBytes(3000));
  write("gradlew", "#!/bin/sh\necho gradle\n");
  write("caf\u00e9/na\u00efve \u65e5\u672c.txt", "unicode path\n");
  write("it's quoted & spaced/file name.txt", "quotes\n");
  write("a".repeat(60) + "/" + "b".repeat(60) + "/long-path-file.ts", "export {};\n");
  write("empty.txt", "");
  write(".gitignore", "*.log\n/out\n");
  write("debug.log", "ignored by .gitignore\n");
  write("out/ignored.js", "ignored\n");
  write(".env", "SECRET=1\n");
  write(".env.example", "SECRET=\n");
  write("node_modules/pkg/index.js", "skipped\n");
  mkdirSync(join(dir, "empty-dir"), { recursive: true });
}

function run(format: ScriptFormat, script: string, cwd: string, extra: string[] = []) {
  const [cmd, args] =
    format === "node"
      ? ["node", [script, ...extra]]
      : format === "bash"
        ? ["bash", [script, ...extra]]
        : ["powershell", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", script, ...extra]];
  return spawnSync(cmd, args as string[], { cwd, encoding: "utf8" });
}

function sameTree(expected: Map<string, Buffer>, dir: string): string[] {
  const problems: string[] = [];
  for (const [p, data] of expected) {
    let got: Buffer;
    try {
      got = readFileSync(join(dir, p));
    } catch {
      problems.push(`missing ${p}`);
      continue;
    }
    if (!got.equals(data)) problems.push(`differs ${p}`);
  }
  return problems;
}

async function main() {
  const source = process.argv[2] ? resolve(process.argv[2]) : join(root, "source");
  if (!process.argv[2]) makeFixture(source);
  const { files: all, emptyDirs } = readProject(source);
  const classified = await classify(all, true);
  const included = classified.filter((c) => !c.reason).map((c) => c.file);
  const leftOut = classified.filter((c) => c.reason === "secret").map((c) => c.file.path);
  const packed = await loadFiles(included);
  const expected = new Map(packed.map((f) => [f.path, Buffer.from(f.data)]));
  console.log(`Source ${source}: ${all.length} files read, ${packed.length} included, left out: ${leftOut.join(", ") || "none"}\n`);

  if (!process.argv[2]) {
    check(!expected.has("debug.log") && !expected.has("out/ignored.js"), ".gitignore rules applied");
    check(!expected.has(".env") && expected.has(".env.example"), ".env left out, .env.example kept");
    check(![...expected.keys()].some((p) => p.startsWith("node_modules/")), "node_modules skipped");
    check(packed.find((f) => f.path === "gradlew")?.mode === 0o755, "gradlew marked executable");
  }

  const hasPowershell = spawnSync("powershell", ["-NoProfile", "-Command", "exit 0"]).status === 0;
  const formats: ScriptFormat[] = ["node", "bash", ...(hasPowershell ? (["powershell"] as const) : [])];

  for (const partBytes of [null, 60_000]) {
    const scripts = await generateScripts({ name: basename(source), files: packed, emptyDirs, formats, partBytes, leftOut });
    for (const format of formats) {
      const mine = scripts.filter((s) => s.format === format);
      const label = `${format}, ${mine.length === 1 ? "single script" : `${mine.length} parts`}`;
      const target = join(root, `out-${format}-${partBytes ?? "single"}`);
      mkdirSync(target);
      let ok = true;
      // Run parts in reverse order to prove order doesn't matter.
      for (const s of [...mine].reverse()) {
        const scriptPath = join(target, s.fileName);
        writeFileSync(scriptPath, s.content);
        const r = run(format, scriptPath, target);
        rmSync(scriptPath);
        if (r.status !== 0) {
          ok = false;
          console.log(r.stdout, r.stderr);
        }
      }
      const problems = sameTree(expected, target);
      if (problems.length) console.log("  " + problems.slice(0, 5).join("\n  "));
      check(ok && !problems.length, `${label}: all ${expected.size} files identical`);
      if (!process.argv[2]) check(statSync(join(target, "empty-dir"), { throwIfNoEntry: false })?.isDirectory() === true, `${label}: empty folder kept`);
      if (format === "node" && !partBytes && process.platform !== "win32") {
        check((statSync(join(target, "gradlew")).mode & 0o111) !== 0, "node: gradlew is executable");
      }
    }

    if (partBytes === null && !process.argv[2]) {
      const node = scripts.find((s) => s.format === "node")!;
      const bash = scripts.find((s) => s.format === "bash")!;

      // A paste that was cut off must be refused before anything is written.
      const cutDir = join(root, "cut");
      mkdirSync(cutDir);
      const cut = node.content.slice(0, Math.floor(node.content.length * 0.7)) + "\n`;\n}\n";
      writeFileSync(join(cutDir, "x.mjs"), cut);
      const r = run("node", join(cutDir, "x.mjs"), cutDir);
      check(r.status !== 0 && /damaged/.test(r.stderr) && readdirSync(cutDir).length === 1, "node: cut-off script refused, nothing written");

      // Refuses a folder holding something else, unless --force.
      const busy = join(root, "busy");
      mkdirSync(busy);
      writeFileSync(join(busy, "other.txt"), "x");
      writeFileSync(join(busy, node.fileName), node.content);
      check(run("node", join(busy, node.fileName), busy).status !== 0, "node: refuses a non-empty folder");
      check(run("node", join(busy, node.fileName), busy, ["--force"]).status === 0, "node: --force writes into it");

      // Update: a file from an older version is reported, and removed with --prune.
      const upd = join(root, "out-node-single");
      const manifest = JSON.parse(readFileSync(join(upd, ".code-to-script.json"), "utf8"));
      manifest.files.push("old-file.ts");
      writeFileSync(join(upd, ".code-to-script.json"), JSON.stringify(manifest));
      writeFileSync(join(upd, "old-file.ts"), "old");
      writeFileSync(join(upd, "src/app/page.tsx"), "locally edited");
      writeFileSync(join(upd, node.fileName), node.content);
      const dry = run("node", join(upd, node.fileName), upd, ["--dry-run"]);
      check(/would be updated: src\/app\/page.tsx/.test(dry.stdout) && readFileSync(join(upd, "src/app/page.tsx"), "utf8") === "locally edited", "node: --dry-run reports without writing");
      const up = run("node", join(upd, node.fileName), upd, ["--prune"]);
      check(up.status === 0 && /1 updated/.test(up.stdout), "node: update restores an edited file");
      check(!readdirSync(upd).includes("old-file.ts"), "node: --prune removes a dropped file");

      // CRLF: a bash script saved by a Windows editor still runs.
      const crlfDir = join(root, "crlf");
      mkdirSync(crlfDir);
      writeFileSync(join(crlfDir, "x.sh"), bash.content.replace(/\n/g, "\r\n"));
      const rc = run("bash", join(crlfDir, "x.sh"), crlfDir);
      if (rc.status) console.log(rc.stdout, rc.stderr);
      check(rc.status === 0 && !sameTree(expected, crlfDir).length, "bash: runs with CRLF line endings");

      const sizes = scripts.map((s) => `${s.fileName} ${(s.content.length / 1024).toFixed(0)} KB`).join(", ");
      console.log(`\nSizes: ${sizes}`);
    }
  }

  rmSync(root, { recursive: true, force: true });
  console.log(failures ? `\n${failures} check(s) failed.` : "\nAll checks passed.");
  process.exit(failures ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
