/**
 * Builds copy-paste setup scripts for this project into code-hub-share/, using the app's own generator:
 *   code-hub-setup.mjs / .sh / .ps1   one file with everything, for a new machine
 *   code-hub-update.mjs                applies this version onto an existing copy
 *   parts/                                  the Node script split into paste-sized pieces
 *   HOW-TO-SETUP.md                         instructions
 * Run: npm run share
 */
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { classify } from "../src/lib/pack/filters";
import { generateScripts, loadFiles } from "../src/lib/pack/generate";
import type { GeneratedScript } from "../src/lib/pack/types";
import { readProject } from "./read-project";

const ROOT = process.cwd();
const OUT_DIR = "code-hub-share";
const OUT = join(ROOT, OUT_DIR);
const NAME = "code-hub";
const PART_BYTES = 90 * 1024;

/** Earlier names of this project, so the update script recognises copies made under them. */
const EARLIER_NAMES = ["code-to-script"];
/** Files earlier versions shipped and this one doesn't. The update script deletes them if present. */
const OBSOLETE = [
  "src/app/page.tsx", // moved to src/app/(tools)/page.tsx; both would claim "/"
  "src/server/rooms.ts", // moved to relay/rooms.ts
];

const kb = (s: GeneratedScript) => `${Math.round(s.content.length / 1024)} KB`;

async function main() {
  const { files, emptyDirs } = readProject(ROOT, [OUT_DIR]);
  const classified = await classify(files, true);
  const included = classified.filter((c) => !c.reason).map((c) => c.file);
  const leftOut = classified.filter((c) => c.reason === "secret").map((c) => c.file.path);
  const packed = await loadFiles(included);

  const base = { name: NAME, files: packed, emptyDirs, leftOut };
  const single = await generateScripts({ ...base, formats: ["node", "bash", "powershell"], partBytes: null });
  const parts = await generateScripts({ ...base, formats: ["node"], partBytes: PART_BYTES });
  const [update] = await generateScripts({
    ...base,
    formats: ["node"],
    partBytes: null,
    update: { projectNames: [NAME, ...EARLIER_NAMES], obsolete: OBSOLETE },
    nextSteps: ["npm run dev"],
  });

  rmSync(OUT, { recursive: true, force: true });
  mkdirSync(join(OUT, "parts"), { recursive: true });
  for (const s of [...single, update]) writeFileSync(join(OUT, s.fileName), s.content);
  for (const s of parts) writeFileSync(join(OUT, "parts", s.fileName), s.content);

  const node = single.find((s) => s.format === "node")!;
  const bash = single.find((s) => s.format === "bash")!;
  const ps = single.find((s) => s.format === "powershell")!;
  const date = new Date().toISOString().slice(0, 10);

  const howTo = `# Code Hub - set up or update on another machine

Code Hub is a developer dashboard: Project to Script, Live Codeshare (realtime rooms over WebSocket, nothing
stored), Run Code, AI Code Convert, Format Convert and PNG / SVG Convert. How the code works is documented in
\`docs/README.md\` (included in these scripts).

These scripts contain the whole project (${packed.length} files, compressed). Generated ${date} with \`npm run share\`.
Each one checks every file with SHA-256 after writing it.

Not included: \`node_modules\`, \`.next\`, \`.git\` and anything in \`.gitignore\`.${
    leftOut.length ? ` Also left out (may hold secrets, copy by hand): ${leftOut.map((p) => `\`${p}\``).join(", ")}.` : ""
  }

## New machine (${kb(node)})

1. Create an empty folder (e.g. \`code-hub\`) and copy \`${node.fileName}\` into it.
2. In a terminal in that folder:

\`\`\`bash
node ${node.fileName}
npm ci
npm run dev
\`\`\`

Then open http://localhost:3000. Needs Node.js 20.9 or newer to run the app (\`node -v\`).
\`npm run dev\` starts \`server.ts\`: Next.js plus the WebSocket for codeshare rooms, on one port. For production run
\`npm run build\` then \`npm start\` on a Node host, or deploy to Vercel plus the small relay in \`relay/\` (Vercel
can't run the WebSocket itself; see \`docs/02-getting-started.md\`).

### Optional keys

Copy \`.env.example\` to \`.env.local\`, fill in what you need, and restart:

- \`ANTHROPIC_API_KEY\`: turns on AI Code Convert.
- \`PISTON_URL\`: your own Piston server (https://github.com/engineer-man/piston) for Java, C, C++, Go, Rust and
  more. JavaScript, TypeScript and Python run in the browser without it.

Everything else works with no keys.

No Node yet? Use \`${bash.fileName}\` (${kb(bash)}, macOS / Linux / Git Bash: \`bash ${bash.fileName}\`) or
\`${ps.fileName}\` (${kb(ps)}, Windows: \`powershell -ExecutionPolicy Bypass -File .\\${ps.fileName}\`) to get the files,
then install Node to run the app.

## Update an existing copy (${kb(update)})

Use \`${update.fileName}\`. It works on any earlier copy of this project (also one named \`code-to-script\`), however
you got it: an earlier script, git, or a zip. If the copy is a git repo, commit first so you can review the diff.

1. Copy \`${update.fileName}\` into the project folder (the one with \`package.json\`).
2. Preview, then apply:

\`\`\`bash
node ${update.fileName} --dry-run
node ${update.fileName}
npm run dev
\`\`\`

It overwrites project files with this version (local edits to those files are replaced), deletes files this
version no longer uses (only project files; add \`--keep\` to keep them), and runs \`npm install\` when packages
changed (\`--no-install\` to skip). \`.env.local\` and your other files are left alone.

On Vercel: after updating, commit and push as usual. If you run the relay on Render and \`relay/\` changed, it
redeploys from the same push.

## ${parts.length} smaller parts (easier to paste through codeshare)

| Part | Size | Contains |
| --- | --- | --- |
${parts.map((s) => `| \`parts/${s.fileName}\` | ${kb(s)} | ${s.fileCount} files |`).join("\n")}

For each part: paste it into a new file with exactly the same name in the project folder, then run it, e.g.
\`node ${parts[0].fileName}\`. Parts can run in any order, but run all ${parts.length}. Then continue with \`npm ci\` above.

## Troubleshooting

- \`This script is damaged\`: the paste was cut off. Copy that file again in full.
- \`The folder ... is not empty\`: you are in another folder. \`cd\` into an empty one, or pass a path:
  \`node ${node.fileName} "path/to/folder"\`.
- \`npm ci\` fails: delete \`node_modules\` and try again, or use \`npm install\`.

Delete the setup files from the project folder afterwards. This \`${OUT_DIR}\` folder is ignored by git.
`;
  writeFileSync(join(OUT, "HOW-TO-SETUP.md"), howTo);

  console.log(`${packed.length} files packed into ${OUT_DIR}/`);
  for (const s of [...single, update]) console.log(`  ${s.fileName.padEnd(36)} ${kb(s)}`);
  for (const s of parts) console.log(`  parts/${s.fileName.padEnd(30)} ${kb(s)} (${s.fileCount} files)`);
  if (leftOut.length) console.log(`Left out (secrets): ${leftOut.join(", ")}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
