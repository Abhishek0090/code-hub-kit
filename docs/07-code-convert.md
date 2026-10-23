# Code Convert

Two tools share this section of the sidebar: AI Code Convert (any language to any other, through Claude) and Format
Convert (deterministic data-format converters that run in the browser).

## AI Code Convert

### Page (`src/app/(tools)/convert/ai/page.tsx`)

- "From" (or "Detect language"), "To", and optional extra instructions.
- Targets are every language in `LANGUAGES` plus framework targets: React (hooks), React Native, Next.js App Router,
  Swift, Dart, Scala and Lua.
- Convert posts to `/api/convert` and reads the response body as a stream. The output pane is a read-only
  `CodeEditor` fed through `externalValue`, so text appears as the model writes it.
- Stop aborts the fetch through an `AbortController`. When the browser disconnects, the response stream's
  `cancel()` handler aborts the API call.
- If the model wraps its answer in a markdown fence anyway, `stripFences` removes it.
- Without a key, the page shows a notice and disables Convert.

### Route (`src/app/api/convert/route.ts`)

| Setting | Value | Why |
| --- | --- | --- |
| Model | `claude-opus-5-5` | Current default Opus model |
| Effort | `medium` | Conversion is well-specified work; `medium` is Opus 5.5's default, stated explicitly |
| `max_tokens` | 64,000 | Large files; streaming avoids HTTP timeouts at that size |
| Fallbacks | `fallbacks: "default"` with beta `server-side-fallback-2026-07-01` | If a safety classifier declines, the API retries on its recommended fallback model inside the same call |
| Input limit | 100,000 characters | Keeps requests bounded |

The system prompt asks for plain code without markdown fences, identical behaviour, target-language idioms over
line-by-line transliteration, kept comments, and a short comment wherever something has no direct equivalent.
The user's code goes inside `<code>` tags.

The route streams `text_delta` events to the browser as plain text. After the stream ends it checks the final
message:

- `stop_reason: "refusal"`: appends a note that the model declined.
- `stop_reason: "max_tokens"`: appends a note that the output was cut off.

Errors are caught by type (`AuthenticationError`, `RateLimitError`, other `APIError`) and written into the stream
as `[Error: ...]`, so the user sees them in the output pane.

The key is read by the SDK from `ANTHROPIC_API_KEY` (or `ANTHROPIC_AUTH_TOKEN`). Code is sent to Anthropic for that
one request; Code Hub stores nothing.

## Format Convert

### Page (`src/app/(tools)/convert/format/page.tsx`)

Pick a converter from the chips. The input editor resets to that converter's sample. Output updates as you type: an
effect runs the converter on every change, and the `cancelled` flag drops results that arrive after newer input.
Errors (for example invalid JSON) show under the output.

### Converters (`src/lib/convert/formats.ts`)

Each converter is `{ id, label, from, to, inLang, outLang, sample, run }`, where `run(text)` returns text (or a
promise) and throws on bad input.

| Converter | How |
| --- | --- |
| JSON to YAML, YAML to JSON | The `yaml` package |
| JSON to TypeScript types | Own inference (below) |
| TypeScript to JavaScript | `sucrase` (types and JSX transforms; JSX is preserved) |
| CSV to JSON | Own RFC 4180 parser: quoted fields, `""` escapes, newlines inside quotes, CRLF |
| JSON to CSV | Union of all keys as columns; nested values become JSON strings; cells quoted when needed |
| Format JSON, Minify JSON | `JSON.stringify` with and without indentation |
| Text to Base64, Base64 to Text | UTF-8 safe (TextEncoder/TextDecoder); decoding also accepts URL-safe Base64 |
| URL encode, URL decode | `encodeURIComponent` / `decodeURIComponent` (decode also turns `+` into a space) |

**JSON to TypeScript types** walks the sample:

- Each object becomes an `export interface`, named from its key in PascalCase (`owner` becomes `Owner`).
- For arrays of objects, all elements are merged, and a key missing from some elements becomes optional (`notes?`).
  The interface is named in the singular (`releases` gives `Release`).
- Objects with identical bodies share one interface.
- Mixed arrays become unions (`(string | number)[]`), empty arrays `unknown[]`.
- A top-level array or primitive gets `export type Root = ...`.

### Adding a converter

Append an object to `CONVERTERS`. It shows up as a chip automatically. Use `inLang`/`outLang` values that
`highlighter()` knows (`json`, `yaml`, `typescript`, `javascript`, `text`, ...).
