/**
 * Runs code on a self-hosted Piston server (https://github.com/engineer-man/piston).
 * The public emkc.org instance has been whitelist-only since 15 Feb 2026, so PISTON_URL must point
 * at your own instance, e.g. http://localhost:2000. Nothing is stored.
 */
const MAX_CODE = 200_000;

interface PistonRuntime {
  language: string;
  version: string;
  aliases: string[];
}

let runtimesCache: { at: number; list: PistonRuntime[] } | null = null;

async function runtimes(base: string): Promise<PistonRuntime[]> {
  if (runtimesCache && Date.now() - runtimesCache.at < 5 * 60_000) return runtimesCache.list;
  const res = await fetch(`${base}/api/v2/runtimes`, { cache: "no-store" });
  if (!res.ok) throw new Error(`Piston returned ${res.status} for /runtimes`);
  const list = (await res.json()) as PistonRuntime[];
  runtimesCache = { at: Date.now(), list };
  return list;
}

export async function POST(req: Request) {
  const base = process.env.PISTON_URL?.replace(/\/$/, "");
  if (!base) return Response.json({ error: "No code-execution server configured (PISTON_URL)." }, { status: 503 });

  const body = (await req.json().catch(() => null)) as
    | { language?: string; file?: string; code?: string; stdin?: string }
    | null;
  if (!body?.language || typeof body.code !== "string") {
    return Response.json({ error: "language and code are required" }, { status: 400 });
  }
  if (body.code.length > MAX_CODE) return Response.json({ error: "Code is too long." }, { status: 413 });

  try {
    const runtime = (await runtimes(base)).find(
      (r) => r.language === body.language || r.aliases.includes(body.language!),
    );
    if (!runtime) {
      return Response.json(
        { error: `The Piston server has no ${body.language} runtime installed. Install it with: piston ppman install ${body.language}` },
        { status: 400 },
      );
    }
    const res = await fetch(`${base}/api/v2/execute`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        language: runtime.language,
        version: runtime.version,
        files: [{ name: body.file ?? "main", content: body.code }],
        stdin: body.stdin ?? "",
        run_timeout: 10_000,
        compile_timeout: 15_000,
      }),
    });
    const data = (await res.json()) as {
      message?: string;
      compile?: { stdout: string; stderr: string; code: number | null };
      run?: { stdout: string; stderr: string; code: number | null; signal: string | null };
    };
    if (!res.ok) return Response.json({ error: data.message ?? `Piston returned ${res.status}` }, { status: 502 });

    const compileFailed = data.compile && data.compile.code !== 0;
    return Response.json({
      stdout: compileFailed ? data.compile!.stdout : (data.run?.stdout ?? ""),
      stderr:
        (compileFailed ? data.compile!.stderr : (data.run?.stderr ?? "")) +
        (data.run?.signal ? `\nKilled (${data.run.signal}).` : ""),
      exitCode: compileFailed ? data.compile!.code : (data.run?.code ?? 0),
    });
  } catch (err) {
    return Response.json(
      { error: `Could not reach the Piston server at ${base}: ${err instanceof Error ? err.message : String(err)}` },
      { status: 502 },
    );
  }
}
