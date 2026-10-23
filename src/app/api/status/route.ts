import { connection } from "next/server";

/** Which optional server features are configured, so the UI can explain what's missing. */
export async function GET() {
  // Read the environment per request, not once at build time.
  await connection();
  return Response.json(
    {
      piston: Boolean(process.env.PISTON_URL),
      ai: Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
