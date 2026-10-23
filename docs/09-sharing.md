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
| `code-hub-update.mjs` | Applies this version onto an existing copy (see below) |
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

Updating a machine that already has the project, from inside its folder:

```bash
node code-hub-update.mjs --dry-run   # preview
node code-hub-update.mjs
npm run dev
```

## The update script

`code-hub-update.mjs` is the Node script template in update mode (`ScriptMeta.update` in
`src/lib/pack/templates/meta.ts`). Compared with the setup script it:

| Behaviour | Detail |
| --- | --- |
| Accepts existing copies | The folder's `package.json` name (or its manifest name) must be `code-hub` or an earlier name (`EARLIER_NAMES` in `share.ts`, currently `code-to-script`). No `--force` needed. Other projects are refused. |
| Removes dropped files by default | Files recorded in the manifest by earlier scripts, plus the `OBSOLETE` list in `share.ts`, are deleted when this version doesn't have them. Folders left empty are removed too. `--keep` keeps them. Nothing else is ever deleted. |
| Installs packages | If `package.json` or `package-lock.json` changed, it runs `npm install`. `--no-install` skips it. |
| Keeps your files | `.env.local`, notes, anything not part of the project stays. Project files are overwritten, so local edits to them are replaced. |

When a release removes or moves a file, add its old path to `OBSOLETE` in `scripts/share.ts`. Copies made from
git or a zip have no manifest, so this list is the only way the update script knows to delete it. That matters
for files that would clash, like `src/app/page.tsx`, which moved into `src/app/(tools)/`.

## When to re-run it

The scripts are snapshots. Run `npm run share` again after changing the code, and share the new
`code-hub-setup.mjs`.
