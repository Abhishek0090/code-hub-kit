# Testing

## Automated

```bash
npx tsc --noEmit   # types
npm run lint       # ESLint, including the React Compiler rules
npm run build      # catches prerender problems that dev mode doesn't
npm run selftest   # Project to Script end to end
```

### `npm run selftest` (`scripts/selftest.ts`)

Builds a fixture project with the awkward cases, then for every script format (Node, Bash, PowerShell when
available), as a single script and as parts run in reverse order, it runs the script in an empty folder and compares
every file byte for byte.

The fixture covers: binary files, CRLF line endings, a path longer than 100 characters, accented and Japanese file
names, a quote and an ampersand in a folder name, an empty file, an empty folder, an executable `gradlew`, a
`.gitignore` with rules, `.env` next to `.env.example`, and a `node_modules` folder.

It also checks that:

- a cut-off script is refused and writes nothing;
- a non-empty folder is refused without `--force` and accepted with it;
- `--dry-run` reports without writing, an update restores an edited file, and `--prune` removes a dropped file;
- the Bash script still runs after its line endings are converted to CRLF.

Run it against a real project with `npm run selftest -- ../some-project`.

## Manual browser checklist

Run `npm run dev` and check each tool. Use two browser windows (or one normal and one private) for codeshare.

| Tool | Check |
| --- | --- |
| Project to Script | Pick a folder; `node_modules` shows under "Left out"; generate; run the downloaded `.mjs` in an empty folder; it prints "All N files verified" |
| Live Codeshare | New room; open the link in a second window; typing in one appears in the other; both avatars show; changing the language changes it for both; the sidebar shows "1 live" |
| Live Codeshare | Close both windows; within about a minute `GET /api/realtime` shows 0 rooms |
| Run Code | JavaScript, TypeScript and Python print "Hello, world!"; the first Python run takes a few seconds; `while True: pass` stops after 15 seconds |
| Run Code | Go without `PISTON_URL` explains how to set it up |
| AI Code Convert | Without a key: the notice shows and Convert is disabled. With a key: Python to TypeScript streams in; Stop works |
| Format Convert | JSON to YAML converts the sample as you type; invalid JSON shows an error |
| Image Convert | Trace a logo PNG to SVG and download it; export an SVG at 4x and check the pixel size |
| Layout | At phone width the menu button opens the sidebar; dark and light mode both read well |

During development, an automated Playwright run in Microsoft Edge covered codeshare sync between two browsers,
the three in-browser runners, the Piston notice, the format and image converters, and the AI no-key notice. That
script isn't in the repo (it would add a Playwright dependency), so use the table above for the full pass.
