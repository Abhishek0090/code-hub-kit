# Getting started

## Requirements

- Node.js 20.9 or newer (`node -v`). Next.js 16 needs it.
- npm (comes with Node).

## Install and run

```bash
npm install
npm run dev
```

Open http://localhost:3000. Use another port with `PORT=4000 npm run dev` (in PowerShell: `$env:PORT=4000; npm run dev`).

`npm run dev` runs `tsx server.ts`, which starts Next.js in development mode plus the codeshare WebSocket. Running
`next dev` directly also serves the pages, but codeshare rooms won't connect because nothing handles `/ws/...`.

## npm scripts

| Script | Command | What it does |
| --- | --- | --- |
| `dev` | `tsx server.ts` | Development server with hot reload |
| `build` | `next build` | Production build of the Next.js app |
| `start` | `tsx server.ts --production` | Production server (run `build` first) |
| `lint` | `eslint` | Lint, including the React Compiler rules |
| `selftest` | `tsx scripts/selftest.ts` | End-to-end test of Project to Script output |
| `share` | `tsx scripts/share.ts` | Builds `code-hub-share/` (see 09-sharing.md) |

## Environment variables

Copy `.env.example` to `.env.local`. Every variable is optional, and the app tells you in the UI when a feature
needs one.

| Variable | Used by | Effect when missing |
| --- | --- | --- |
| `ANTHROPIC_API_KEY` | AI Code Convert (`/api/convert`) | The page shows a notice and the Convert button is disabled |
| `PISTON_URL` | Run Code for server languages (`/api/run`) | Java, C, Go, etc. show how to set it up; JS, TS and Python still run |
| `PORT` | `server.ts` | Defaults to 3000 |

`ANTHROPIC_AUTH_TOKEN` also counts as configured for AI conversion, because the Anthropic SDK accepts it.

### Setting up Piston (optional)

[Piston](https://github.com/engineer-man/piston) is an open-source code execution engine. The public instance at
emkc.org has required an approved key since 15 Feb 2026, so Code Hub expects your own:

1. Run Piston with Docker as its README describes. It listens on port 2000.
2. Install the runtimes you want with its `ppman` CLI (for example java, gcc, go, rust).
3. Set `PISTON_URL=http://localhost:2000` in `.env.local` and restart Code Hub.

`/api/run` asks Piston for its installed runtimes and reports a clear error for a language that isn't installed.

## Production

```bash
npm ci
npm run build
npm start
```

Host on anything that keeps a Node process running: a VPS, Render, Railway or Fly. Put it behind a reverse proxy
that forwards WebSocket upgrades (in nginx, `proxy_set_header Upgrade $http_upgrade` and
`proxy_set_header Connection "upgrade"`). Over HTTPS the browser uses `wss://` on its own.

Rooms live in the memory of one process, so run a single instance. Two instances behind a load balancer would split
people in the same room across processes, and they wouldn't see each other's edits.

## Troubleshooting

| Symptom | Cause and fix |
| --- | --- |
| "Another next dev server is already running" | Next.js 16 allows one dev server per project folder. Stop the other one (the message shows its PID), or use it. |
| Codeshare stays on "Connecting..." | The app was started with `next dev` / `next start`, not `npm run dev` / `npm start`. Or a proxy isn't forwarding WebSocket upgrades. |
| Sidebar says "Realtime server offline" | Same as above: `/api/realtime` is served by `server.ts`, not by Next.js. |
| Python run says it couldn't load Pyodide | The browser can't reach cdn.jsdelivr.net. Python needs that download the first time. |
| AI Convert says the key is invalid | Check `ANTHROPIC_API_KEY` in `.env.local`, then restart: env files are read at startup. |
| `Yjs was already imported` in the server log | Something on the server imported Yjs a second time. Keep Yjs imports out of server-rendered code (see 05-live-codeshare.md). |
