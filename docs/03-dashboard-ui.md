# Dashboard UI

## Layout

Every tool page lives in the route group `src/app/(tools)/`. The parentheses keep "tools" out of the URL, and the
group's `layout.tsx` wraps each page in `DashboardShell`:

```text
RootLayout (src/app/layout.tsx)        <html>, fonts, metadata
  ToolsLayout ((tools)/layout.tsx)
    DashboardShell                     sidebar + top bar + scrolling <main>
      the page
```

## DashboardShell (`src/components/DashboardShell.tsx`)

- **`NAV`** is the single source of the sidebar: groups (Transfer, Collaborate, Convert), each with items
  (`href`, `label`, inline SVG icon, optional badge). The top-bar breadcrumb reads the same list.
- **Active item:** `isActive` matches the current path (`/` exactly, everything else by prefix, so
  `/codeshare/abc-defg` highlights Live Codeshare).
- **Live badge and status:** `useLiveRooms` polls `GET /api/realtime` every 15 seconds. `server.ts` answers that
  route itself with `{ rooms, people }`. A failed request shows "Realtime server offline".
- **Mobile:** below the `lg` breakpoint the sidebar is hidden and a menu button opens it as a drawer. Clicking a link
  closes the drawer through `onNavigate`.

### Why the sidebar and breadcrumb sit behind Suspense

Next.js 16 prerenders the static shell of every page. `usePathname()` reads the URL, and on a dynamic route
(`/codeshare/[room]`) the URL isn't known at build time. Next fails the build if that read happens outside a
`<Suspense>` boundary. So `Sidebar` and `Breadcrumb` render inside `<Suspense fallback={null}>`, and page content
outside them still prerenders. The room page does the same around `await params`
(`src/app/(tools)/codeshare/[room]/page.tsx`).

## Shared components

| Component | Purpose |
| --- | --- |
| `PageHeader` | Page title plus one intro paragraph |
| `CodeEditor` | CodeMirror 6 editor, used by every code tool |
| `LanguageSelect` | Language dropdown, grouped into "Runs in the browser" and "Runs on the server" |
| `RunPanel` | Run button, optional stdin box, output console, exit code and timing |

### CodeEditor (`src/components/CodeEditor.tsx`)

A thin wrapper that creates one `EditorView` and reconfigures it through CodeMirror **compartments**, so language and
theme changes don't recreate the editor.

| Prop | Meaning |
| --- | --- |
| `language` | Id from `src/lib/languages.ts` (or `json`, `yaml`, `text`...). The highlighter loads lazily. |
| `value` | Initial text. The editor is uncontrolled: it owns its text after mounting. |
| `onChange` | Called with the full text after every edit |
| `readOnly` | For output panes |
| `externalValue` | Replaces the whole text when it changes; used to stream AI output into a read-only pane |
| `collab` | A `yCollab(...)` extension for Live Codeshare. When set, the shared document provides the text. |

To reset an uncontrolled editor, change its React `key` (the Run Code page uses `key={langId-resetCount}`).

The theme follows the operating system: One Dark in dark mode, CodeMirror's default in light mode, switching live
through a `matchMedia` listener.

## Styling

- Tailwind CSS v4, configured in CSS (`src/app/globals.css`), with no `tailwind.config` file.
- Colour tokens `--background` and `--foreground` on `:root`, overridden for dark mode under
  `prefers-color-scheme: dark`. Components use Tailwind's `dark:` variants.
- Shared classes in `@layer components`: `.card`, `.label`, `.input`, `.btn-primary`, `.btn-secondary`. Use these
  instead of repeating long class lists.
- Fonts: Geist and Geist Mono through `next/font` in the root layout.

## Adding a new tool

1. Create `src/app/(tools)/<your-tool>/page.tsx`. Start it with `"use client"` if it needs state or browser APIs,
   and open with `<PageHeader title="...">intro</PageHeader>`.
2. Add an item to the right group in `NAV` in `DashboardShell.tsx`: `href`, `label` and an icon built with the
   `icon(...)` helper (24x24 stroke paths).
3. Keep processing in the browser if you can. If you need a server route, put it in `src/app/api/<name>/route.ts`,
   and store nothing.
4. If the page reads `params`, `searchParams` or `usePathname()` on a dynamic route, wrap that part in `<Suspense>`.
5. Run `npm run lint` and `npm run build`. The build catches prerender problems that dev mode doesn't.

## React rules the linter enforces

The Next.js ESLint config includes the React Compiler rules. Two of them shaped this code:

- **No impure calls during render** (`Math.random()`, `Date.now()`). The codeshare room picks a random colour inside
  its effect and keeps it in a ref.
- **No `setState` directly in an effect body.** Set state from callbacks (event listeners, provider events,
  promise `.then`). The room sets its editor binding from the provider's first `status` event for this reason.
