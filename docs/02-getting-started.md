# Getting started

## Requirements

- Node.js 20.9 or newer (`node -v`). Next.js 16 needs it.
- npm (comes with Node).

## Install and run

```bash
npm install
npm run dev
```

Open the URL it prints. If port 3000 is busy it tries 3001, 3002 and so on, like `next dev`. To force a port, set
`PORT=4000 npm run dev` (in PowerShell: `$env:PORT=4000; npm run dev`); with `PORT` set it fails instead of moving.

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
| `NEXT_PUBLIC_REALTIME_URL` | Live Codeshare | Rooms connect to this site's own `/ws` (works with `npm run dev` / `npm start`, not on Vercel) |

`ANTHROPIC_AUTH_TOKEN` also counts as configured for AI conversion, because the Anthropic SDK accepts it.

### Setting up Piston (optional)

[Piston](https://github.com/engineer-man/piston) is an open-source code execution engine. The public instance at
emkc.org has required an approved key since 15 Feb 2026, so Code Hub expects your own:

1. Run Piston with Docker as its README describes. It listens on port 2000.
2. Install the runtimes you want with its `ppman` CLI (for example java, gcc, go, rust).
3. Set `PISTON_URL=http://localhost:2000` in `.env.local` and restart Code Hub.

`/api/run` asks Piston for its installed runtimes and reports a clear error for a language that isn't installed.

## Production

There are two ways to deploy. Pick one.

### Option A: Vercel for the app, a small relay for Live Codeshare

Vercel functions can't hold WebSocket connections, so on Vercel the codeshare rooms connect to a separate relay. The
relay is the `relay/` folder: about 100 lines plus the shared room logic, with five dependencies and no storage.

1. **Deploy the relay on Render** (free): in Render choose New > Blueprint and pick this repository. `render.yaml`
   creates a web service named `code-hub-relay` from the `relay/` folder. Any Node host works the same way: root
   directory `relay`, build `npm install`, start `npm start`.
2. **Restrict it to your site:** set `ALLOWED_ORIGINS` on the relay to your Vercel URL, for example
   `https://code-hub.vercel.app` (comma-separate several; `https://*.vercel.app` also allows preview deployments).
3. **Point the app at it:** in Vercel > Project > Settings > Environment Variables, add
   `NEXT_PUBLIC_REALTIME_URL` = the relay's URL (for example `https://code-hub-relay.onrender.com`). Add
   `ANTHROPIC_API_KEY` and `PISTON_URL` there too if you use them.
4. **Redeploy** the Vercel project. `NEXT_PUBLIC_` values are built into the page, so a redeploy is required after
   changing it.

Check it: open `https://<relay>/health` (shows "ok"), then open a room on the Vercel site. The sidebar should say
"Realtime server connected".

Render's free plan sleeps a service after about 15 minutes without traffic. The first visitor after that waits
roughly a minute while it wakes; the room shows a notice and keeps retrying. Any room open when it went to sleep is
gone, which matches the no-storage design. A paid plan, Railway or Fly avoids the sleep.

### Option B: everything on one Node host

```bash
npm ci
npm run build
npm start
```

No relay or extra variable needed: `server.ts` serves the app and the WebSocket on one port.
Host on anything that keeps a Node process running: a VPS, Render, Railway or Fly. Put it behind a reverse proxy
that forwards WebSocket upgrades (in nginx, `proxy_set_header Upgrade $http_upgrade` and
`proxy_set_header Connection "upgrade"`). Over HTTPS the browser uses `wss://` on its own.

Rooms live in the memory of one process, so run a single instance. Two instances behind a load balancer would split
people in the same room across processes, and they wouldn't see each other's edits.

## Troubleshooting

| Symptom | Cause and fix |
| --- | --- |
| "Another next dev server is already running" | Next.js 16 allows one dev server per project folder. Stop the other one (the message shows its PID), or use it. |
| Codeshare stays on "Connecting..." | Locally: the app was started with `next dev` / `next start`, not `npm run dev` / `npm start`. On Vercel: `NEXT_PUBLIC_REALTIME_URL` isn't set (or was set without a redeploy), the relay is asleep or down, or `ALLOWED_ORIGINS` doesn't include the site. After 4 seconds the room shows which case applies. |
| Sidebar says "Realtime server offline" | Same as above: `/api/realtime` is served by `server.ts`, not by Next.js. |
| Python run says it couldn't load Pyodide | The browser can't reach cdn.jsdelivr.net. Python needs that download the first time. |
| AI Convert says the key is invalid | Check `ANTHROPIC_API_KEY` in `.env.local`, then restart: env files are read at startup. |
| `Yjs was already imported` in the server log | Something on the server imported Yjs a second time. Keep Yjs imports out of server-rendered code (see 05-live-codeshare.md). |
