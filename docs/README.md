# Code Hub documentation

Code Hub is a dashboard of developer tools built with Next.js 16. These docs explain how the code is built, how each
tool works, and where to change things.

## Reading order

New to the codebase? Read 1 and 2, then the page for the tool you're working on.

| # | Document | Covers |
| --- | --- | --- |
| 1 | [Architecture](01-architecture.md) | The one-process design, what runs where, folder map, key decisions |
| 2 | [Getting started](02-getting-started.md) | Install, run, environment variables, deploy, troubleshooting |
| 3 | [Dashboard UI](03-dashboard-ui.md) | Layout, sidebar, shared components, styling, adding a tool |
| 4 | [Project to Script](04-project-to-script.md) | Folder to self-extracting script: reading, filtering, packing, script templates |
| 5 | [Live Codeshare](05-live-codeshare.md) | Realtime rooms: Yjs, the WebSocket relay, the room page |
| 6 | [Run Code](06-run-code.md) | In-browser runners (JS, TS, Python) and the Piston proxy |
| 7 | [Code Convert](07-code-convert.md) | AI conversion with Claude, and the format converters |
| 8 | [Image Convert](08-image-convert.md) | PNG to SVG tracing, SVG to PNG export |
| 9 | [Sharing the project](09-sharing.md) | `npm run share`: the copy-paste setup scripts for this repo |
| 10 | [Testing](10-testing.md) | Lint, typecheck, self-test, and the manual browser checklist |

## The one rule

Code Hub stores nothing. Uploaded folders, images and converter input are processed in the browser. Codeshare rooms
exist only in server memory and are deleted about a minute after the last person leaves. AI conversion sends code to
the Anthropic API for that one request. There is no database, and new features should keep it that way.
