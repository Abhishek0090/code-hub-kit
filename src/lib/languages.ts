import type { Extension } from "@codemirror/state";

/** Where code in this language runs: in the browser (no server needed) or on a Piston server. */
export type BrowserRuntime = "javascript" | "typescript" | "python";

export interface Language {
  id: string;
  label: string;
  /** Language name in the Piston API. */
  piston: string;
  browser?: BrowserRuntime;
  ext: string;
  highlight: () => Promise<Extension>;
  sample: string;
}

export const LANGUAGES: Language[] = [
  {
    id: "javascript",
    label: "JavaScript",
    piston: "javascript",
    browser: "javascript",
    ext: "js",
    highlight: async () => (await import("@codemirror/lang-javascript")).javascript(),
    sample: 'const greet = (name) => `Hello, ${name}!`;\nconsole.log(greet("world"));\n',
  },
  {
    id: "typescript",
    label: "TypeScript",
    piston: "typescript",
    browser: "typescript",
    ext: "ts",
    highlight: async () => (await import("@codemirror/lang-javascript")).javascript({ typescript: true }),
    sample: 'const greet = (name: string): string => `Hello, ${name}!`;\nconsole.log(greet("world"));\n',
  },
  {
    id: "python",
    label: "Python",
    piston: "python",
    browser: "python",
    ext: "py",
    highlight: async () => (await import("@codemirror/lang-python")).python(),
    sample: 'def greet(name):\n    return f"Hello, {name}!"\n\nprint(greet("world"))\n',
  },
  {
    id: "java",
    label: "Java",
    piston: "java",
    ext: "java",
    highlight: async () => (await import("@codemirror/lang-java")).java(),
    sample: 'public class Main {\n    public static void main(String[] args) {\n        System.out.println("Hello, world!");\n    }\n}\n',
  },
  {
    id: "c",
    label: "C",
    piston: "c",
    ext: "c",
    highlight: async () => (await import("@codemirror/lang-cpp")).cpp(),
    sample: '#include <stdio.h>\n\nint main(void) {\n    printf("Hello, world!\\n");\n    return 0;\n}\n',
  },
  {
    id: "cpp",
    label: "C++",
    piston: "c++",
    ext: "cpp",
    highlight: async () => (await import("@codemirror/lang-cpp")).cpp(),
    sample: '#include <iostream>\n\nint main() {\n    std::cout << "Hello, world!" << std::endl;\n}\n',
  },
  {
    id: "csharp",
    label: "C#",
    piston: "csharp",
    ext: "cs",
    highlight: async () => (await import("@codemirror/lang-java")).java(),
    sample: 'using System;\n\nclass Program {\n    static void Main() {\n        Console.WriteLine("Hello, world!");\n    }\n}\n',
  },
  {
    id: "go",
    label: "Go",
    piston: "go",
    ext: "go",
    highlight: async () => (await import("@codemirror/lang-go")).go(),
    sample: 'package main\n\nimport "fmt"\n\nfunc main() {\n\tfmt.Println("Hello, world!")\n}\n',
  },
  {
    id: "rust",
    label: "Rust",
    piston: "rust",
    ext: "rs",
    highlight: async () => (await import("@codemirror/lang-rust")).rust(),
    sample: 'fn main() {\n    println!("Hello, world!");\n}\n',
  },
  {
    id: "php",
    label: "PHP",
    piston: "php",
    ext: "php",
    highlight: async () => (await import("@codemirror/lang-php")).php(),
    sample: '<?php\necho "Hello, world!\\n";\n',
  },
  {
    id: "ruby",
    label: "Ruby",
    piston: "ruby",
    ext: "rb",
    highlight: async () => [],
    sample: 'puts "Hello, world!"\n',
  },
  {
    id: "kotlin",
    label: "Kotlin",
    piston: "kotlin",
    ext: "kt",
    highlight: async () => (await import("@codemirror/lang-java")).java(),
    sample: 'fun main() {\n    println("Hello, world!")\n}\n',
  },
  {
    id: "bash",
    label: "Bash",
    piston: "bash",
    ext: "sh",
    highlight: async () => [],
    sample: 'echo "Hello, world!"\n',
  },
  {
    id: "sql",
    label: "SQL (SQLite)",
    piston: "sqlite3",
    ext: "sql",
    highlight: async () => (await import("@codemirror/lang-sql")).sql(),
    sample: "CREATE TABLE t (name TEXT);\nINSERT INTO t VALUES ('world');\nSELECT 'Hello, ' || name || '!' FROM t;\n",
  },
];

/** Languages used only for highlighting (format converters, not runnable). */
export const EXTRA_HIGHLIGHT: Record<string, () => Promise<Extension>> = {
  json: async () => (await import("@codemirror/lang-json")).json(),
  yaml: async () => (await import("@codemirror/lang-yaml")).yaml(),
  html: async () => (await import("@codemirror/lang-html")).html(),
  css: async () => (await import("@codemirror/lang-css")).css(),
  markdown: async () => (await import("@codemirror/lang-markdown")).markdown(),
  text: async () => [],
};

export function findLanguage(id: string): Language | undefined {
  return LANGUAGES.find((l) => l.id === id);
}

export function highlighter(id: string): () => Promise<Extension> {
  return findLanguage(id)?.highlight ?? EXTRA_HIGHLIGHT[id] ?? EXTRA_HIGHLIGHT.text;
}
