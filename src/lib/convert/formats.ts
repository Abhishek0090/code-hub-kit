import { parse as parseYaml, stringify as stringifyYaml } from "yaml";

/** Deterministic converters that run in the browser. Each takes text and returns text, or throws. */
export interface Converter {
  id: string;
  label: string;
  from: string;
  to: string;
  /** Syntax highlighting for each side. */
  inLang: string;
  outLang: string;
  sample: string;
  run: (input: string) => string | Promise<string>;
}

const utf8ToBase64 = (s: string) => {
  const bytes = new TextEncoder().encode(s);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
};

const base64ToUtf8 = (s: string) => {
  const bin = atob(s.replace(/\s+/g, "").replace(/-/g, "+").replace(/_/g, "/"));
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
};

/** RFC 4180 CSV: quoted fields, escaped quotes, newlines inside quotes. */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += c;
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((f) => f !== ""));
}

const csvCell = (v: unknown) => {
  const s = v === null || v === undefined ? "" : typeof v === "object" ? JSON.stringify(v) : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** Infers TypeScript interfaces from a JSON sample. Objects with the same shape share one interface. */
function jsonToTs(input: string): string {
  const root = JSON.parse(input);
  const interfaces: string[] = [];
  const seen = new Map<string, string>();
  const pascal = (s: string) =>
    s.replace(/(^|[^a-zA-Z0-9]+)([a-zA-Z0-9])/g, (_, __, c: string) => c.toUpperCase()).replace(/^[0-9]/, "_$&") || "Item";
  const singular = (s: string) => (s.endsWith("ies") ? s.slice(0, -3) + "y" : s.endsWith("s") ? s.slice(0, -1) : s + "Item");
  const key = (k: string) => (/^[A-Za-z_$][\w$]*$/.test(k) ? k : JSON.stringify(k));

  const typeOf = (value: unknown, name: string): string => {
    if (value === null) return "null";
    if (Array.isArray(value)) {
      if (!value.length) return "unknown[]";
      const objects = value.filter((v) => v && typeof v === "object" && !Array.isArray(v));
      if (objects.length === value.length) {
        // Merge all elements so optional keys are found.
        const merged: Record<string, unknown> = {};
        const counts: Record<string, number> = {};
        for (const o of objects as Record<string, unknown>[]) {
          for (const [k, v] of Object.entries(o)) {
            if (!(k in merged) || merged[k] === null) merged[k] = v;
            counts[k] = (counts[k] ?? 0) + 1;
          }
        }
        const optional = new Set(Object.keys(counts).filter((k) => counts[k] < objects.length));
        return `${objectType(merged, singular(name), optional)}[]`;
      }
      const types = [...new Set(value.map((v) => typeOf(v, singular(name))))];
      return types.length === 1 ? `${types[0]}[]` : `(${types.join(" | ")})[]`;
    }
    if (typeof value === "object") return objectType(value as Record<string, unknown>, name, new Set());
    return typeof value;
  };

  const objectType = (obj: Record<string, unknown>, name: string, optional: Set<string>): string => {
    const body = Object.entries(obj)
      .map(([k, v]) => `  ${key(k)}${optional.has(k) ? "?" : ""}: ${typeOf(v, pascal(k))};`)
      .join("\n");
    const existing = seen.get(body);
    if (existing) return existing;
    let iname = pascal(name);
    while ([...seen.values()].includes(iname)) iname += "2";
    seen.set(body, iname);
    interfaces.push(`export interface ${iname} {\n${body}\n}`);
    return iname;
  };

  const top = typeOf(root, "Root");
  if (!interfaces.some((i) => i.startsWith(`export interface ${top} `))) interfaces.push(`export type Root = ${top};`);
  return interfaces.join("\n\n") + "\n";
}

const SAMPLE_JSON = `{
  "name": "Code Hub",
  "version": 2,
  "tags": ["tools", "convert"],
  "owner": { "login": "abhishek", "admin": true },
  "releases": [
    { "tag": "v1.0.0", "date": "2026-10-01" },
    { "tag": "v2.0.0", "date": "2026-10-23", "notes": "Dashboard" }
  ]
}`;

export const CONVERTERS: Converter[] = [
  {
    id: "json-yaml",
    label: "JSON to YAML",
    from: "JSON",
    to: "YAML",
    inLang: "json",
    outLang: "yaml",
    sample: SAMPLE_JSON,
    run: (s) => stringifyYaml(JSON.parse(s)),
  },
  {
    id: "yaml-json",
    label: "YAML to JSON",
    from: "YAML",
    to: "JSON",
    inLang: "yaml",
    outLang: "json",
    sample: "name: Code Hub\nversion: 2\ntags:\n  - tools\n  - convert\nowner:\n  login: abhishek\n  admin: true\n",
    run: (s) => JSON.stringify(parseYaml(s), null, 2) + "\n",
  },
  {
    id: "json-ts",
    label: "JSON to TypeScript types",
    from: "JSON",
    to: "TypeScript",
    inLang: "json",
    outLang: "typescript",
    sample: SAMPLE_JSON,
    run: jsonToTs,
  },
  {
    id: "ts-js",
    label: "TypeScript to JavaScript",
    from: "TypeScript",
    to: "JavaScript",
    inLang: "typescript",
    outLang: "javascript",
    sample:
      "interface User {\n  name: string;\n  age?: number;\n}\n\nexport function greet(user: User): string {\n  return `Hello, ${user.name}`;\n}\n",
    run: async (s) => {
      const { transform } = await import("sucrase");
      return transform(s, { transforms: ["typescript", "jsx"], disableESTransforms: true, jsxRuntime: "preserve" }).code;
    },
  },
  {
    id: "csv-json",
    label: "CSV to JSON",
    from: "CSV",
    to: "JSON",
    inLang: "text",
    outLang: "json",
    sample: 'name,role,joined\nAbhishek,developer,2024-01-15\n"Smith, Jo",designer,2025-06-02\n',
    run: (s) => {
      const [header, ...rows] = parseCsv(s);
      if (!header) return "[]\n";
      return JSON.stringify(rows.map((r) => Object.fromEntries(header.map((h, i) => [h, r[i] ?? ""]))), null, 2) + "\n";
    },
  },
  {
    id: "json-csv",
    label: "JSON to CSV",
    from: "JSON",
    to: "CSV",
    inLang: "json",
    outLang: "text",
    sample: '[\n  { "name": "Abhishek", "role": "developer" },\n  { "name": "Smith, Jo", "role": "designer" }\n]',
    run: (s) => {
      const data = JSON.parse(s);
      const rows: Record<string, unknown>[] = Array.isArray(data) ? data : [data];
      const cols = [...new Set(rows.flatMap((r) => Object.keys(r ?? {})))];
      return [cols.map(csvCell).join(","), ...rows.map((r) => cols.map((c) => csvCell(r?.[c])).join(","))].join("\n") + "\n";
    },
  },
  {
    id: "json-format",
    label: "Format JSON",
    from: "JSON",
    to: "JSON (pretty)",
    inLang: "json",
    outLang: "json",
    sample: '{"compact":true,"items":[1,2,3],"nested":{"ok":"yes"}}',
    run: (s) => JSON.stringify(JSON.parse(s), null, 2) + "\n",
  },
  {
    id: "json-minify",
    label: "Minify JSON",
    from: "JSON",
    to: "JSON (minified)",
    inLang: "json",
    outLang: "json",
    sample: SAMPLE_JSON,
    run: (s) => JSON.stringify(JSON.parse(s)),
  },
  {
    id: "b64-encode",
    label: "Text to Base64",
    from: "Text",
    to: "Base64",
    inLang: "text",
    outLang: "text",
    sample: "Hello, Code Hub! Unicode works too: नमस्ते",
    run: utf8ToBase64,
  },
  {
    id: "b64-decode",
    label: "Base64 to Text",
    from: "Base64",
    to: "Text",
    inLang: "text",
    outLang: "text",
    sample: "SGVsbG8sIENvZGUgSHViIQ==",
    run: base64ToUtf8,
  },
  {
    id: "url-encode",
    label: "URL encode",
    from: "Text",
    to: "URL-encoded",
    inLang: "text",
    outLang: "text",
    sample: "name=Abhishek P&city=Mumbai/Pune?",
    run: (s) => encodeURIComponent(s),
  },
  {
    id: "url-decode",
    label: "URL decode",
    from: "URL-encoded",
    to: "Text",
    inLang: "text",
    outLang: "text",
    sample: "name%3DAbhishek%20P%26city%3DMumbai%2FPune%3F",
    run: (s) => decodeURIComponent(s.replace(/\+/g, " ")),
  },
];
