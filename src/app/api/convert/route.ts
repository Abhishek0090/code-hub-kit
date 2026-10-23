import Anthropic from "@anthropic-ai/sdk";

/**
 * AI code conversion (e.g. Python to Go). Streams the converted code back as plain text.
 * Needs ANTHROPIC_API_KEY. Nothing is stored.
 */
const MAX_CODE = 100_000;
const MODEL = "claude-opus-5-5";

const SYSTEM = `You convert source code between programming languages and frameworks.
Return only the converted code, as plain text without markdown code fences.
Keep the behaviour identical. Use the target language's idioms and standard library rather than a line-by-line transliteration.
Keep the original comments, translated to fit the new code. Where something has no direct equivalent, choose the closest idiomatic approach and add a short comment explaining it.`;

export async function POST(req: Request) {
  if (!process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_AUTH_TOKEN) {
    return Response.json({ error: "AI conversion needs ANTHROPIC_API_KEY in .env.local." }, { status: 503 });
  }
  const body = (await req.json().catch(() => null)) as
    | { code?: string; from?: string; to?: string; notes?: string }
    | null;
  if (!body?.code?.trim() || !body.to) return Response.json({ error: "code and target are required" }, { status: 400 });
  if (body.code.length > MAX_CODE) return Response.json({ error: "Code is too long (100 KB max)." }, { status: 413 });

  const prompt =
    `Convert this ${body.from && body.from !== "auto" ? body.from : "code (detect the language)"} to ${body.to}.` +
    (body.notes?.trim() ? `\n\nExtra instructions: ${body.notes.trim()}` : "") +
    `\n\n<code>\n${body.code}\n</code>`;

  const client = new Anthropic();
  const stream = client.beta.messages.stream({
    model: MODEL,
    max_tokens: 64000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort: "medium" },
    system: SYSTEM,
    messages: [{ role: "user", content: prompt }],
  });

  const encoder = new TextEncoder();
  const body$ = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const event of stream) {
          if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
            controller.enqueue(encoder.encode(event.delta.text));
          }
        }
        const final = await stream.finalMessage();
        if (final.stop_reason === "refusal") {
          controller.enqueue(encoder.encode("\n\n[The model declined to convert this code.]"));
        } else if (final.stop_reason === "max_tokens") {
          controller.enqueue(encoder.encode("\n\n[Output was cut off: the code is too long to convert in one go.]"));
        }
      } catch (err) {
        const message =
          err instanceof Anthropic.AuthenticationError
            ? "The Anthropic API key is invalid."
            : err instanceof Anthropic.RateLimitError
              ? "Rate limited by the Anthropic API. Try again in a minute."
              : err instanceof Anthropic.APIError
                ? `Anthropic API error ${err.status}: ${err.message}`
                : String(err);
        controller.enqueue(encoder.encode(`\n\n[Error: ${message}]`));
      } finally {
        controller.close();
      }
    },
    cancel() {
      stream.abort();
    },
  });

  return new Response(body$, { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });
}
