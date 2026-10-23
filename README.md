# Code Hub

A dashboard of developer tools. Nothing you put in is stored: files and images stay in your browser, and
codeshare rooms live in server memory only until everyone leaves.

| Tool | What it does | Runs where |
| --- | --- | --- |
| Project to Script | Turns a project folder or .zip into one script that recreates it byte for byte | Browser |
| Live Codeshare | Shared editor rooms with live cursors, over WebSocket | Browser + this server |
| Run Code | Runs JavaScript, TypeScript, Python; other languages via Piston | Browser, or your Piston server |
| AI Code Convert | Translates code between languages with Claude | Anthropic API |
| Format Convert | JSON / YAML / CSV / TS types / TS to JS / Base64 / URL encoding | Browser |
| PNG / SVG Convert | Traces images to SVG, exports SVG to PNG at any scale | Browser |

## Run

```bash
npm install
npm run dev        # http://localhost:3000, with hot reload
```

`npm run dev` starts `server.ts`: Next.js plus the WebSocket endpoint for codeshare rooms (`/ws/<room>`) on one port.
Don't use `next dev` directly, or codeshare rooms won't connect.

Production: `npm run build`, then `npm start`. This needs a host that runs a long-lived Node process (a VPS, Render,
Railway, Fly). Vercel and other serverless hosts can't keep the WebSocket open.

## Optional configuration

Copy `.env.example` to `.env.local`. Everything works without it except:

- `ANTHROPIC_API_KEY`: turns on AI Code Convert (model `claude-opus-5-5`).
- `PISTON_URL`: a self-hosted [Piston](https://github.com/engineer-man/piston) server for Java, C, C++, C#, Go, Rust,
  PHP, Ruby, Kotlin, Bash and SQLite. The public emkc.org instance has been whitelist-only since 15 Feb 2026, so run your
  own with Docker as its README describes, install the language runtimes you want with its `ppman` CLI, and set
  `PISTON_URL=http://localhost:2000`.

## Checks

```bash
npm run lint
npm run selftest                      # end-to-end check of every Project to Script format
npm run selftest -- ../some-project   # the same against a real project
```

## Share this project

`npm run share` writes `code-hub-share/` with a setup script (Node, Bash and PowerShell versions, plus
paste-sized parts) that recreates this project on another machine. See `HOW-TO-SETUP.md` inside it.

## Code map

- `server.ts`: Next.js plus the WebSocket server; `src/server/rooms.ts` is the in-memory Yjs room relay
- `src/app/(tools)/`: one folder per tool; `src/components/DashboardShell.tsx` is the sidebar layout
- `src/app/api/`: `run` (Piston proxy), `convert` (Claude), `status` (which optional keys are set)
- `src/lib/runner.ts`: in-browser runners (sandboxed worker for JS/TS, Pyodide for Python)
- `src/lib/pack/`: Project to Script (filters, tar writer, script templates)
- `src/lib/convert/formats.ts`: the format converters
