# Sharing the project

`npm run share` packs this repository into copy-paste setup scripts, so someone can recreate it on another machine
without git or a file transfer. It uses the same engine as the Project to Script tool (see 04-project-to-script.md).

## What it produces

`scripts/share.ts` writes `code-hub-share/` (ignored by git):

| File | Use |
| --- | --- |
| `code-hub-setup.mjs` | One Node script with the whole project. New machine or update. |
| `code-hub-setup.sh` | The same, for macOS / Linux / Git Bash without Node |
| `code-hub-setup.ps1` | The same, for Windows without Node |
| `parts/code-hub-part-N-of-M.mjs` | The Node script split into parts of about 90 KB, for paste tools with a size limit |
| `HOW-TO-SETUP.md` | Instructions for the person receiving it, with the real file names and sizes |

What gets packed is the same set the Project to Script page would include: everything except skipped folders
(`node_modules`, `.next`, `.git`...), `.gitignore` matches, and files that may hold secrets. `.env.local` is never
included; `.env.example` is.

## How it works

1. `readProject` (`scripts/read-project.ts`) walks the repo the same way the browser does, skipping
   `code-hub-share/` itself.
2. `classify` applies the same filters as the page.
3. `generateScripts` runs twice: once for single scripts in all three formats, once for Node parts with
   `partBytes = 90 KB`.
4. The script writes the files plus `HOW-TO-SETUP.md`, then prints the sizes.

## Using the scripts

New machine:

```bash
mkdir code-hub && cd code-hub
# paste code-hub-setup.mjs into this folder
node code-hub-setup.mjs
npm ci
npm run dev
```

Updating a machine that already has the project:

```bash
node code-hub-setup.mjs --force --prune
npm install   # if package.json changed
```

`--force` is needed only when that copy didn't come from these scripts. `--prune` deletes files the new version
no longer has (only files that earlier scripts wrote).

## When to re-run it

The scripts are snapshots. Run `npm run share` again after changing the code, and share the new
`code-hub-setup.mjs`.
