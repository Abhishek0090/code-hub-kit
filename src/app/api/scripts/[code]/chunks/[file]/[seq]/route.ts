import { Binary } from "mongodb";
import { collections, noStore, withCloud } from "@/lib/cloud/db";
import { chunkLength, CODE_RE } from "@/lib/cloud/shared";

type Ctx = { params: Promise<{ code: string; file: string; seq: string }> };

async function parse(params: Ctx["params"]) {
  const p = await params;
  const file = Number(p.file);
  const seq = Number(p.seq);
  return CODE_RE.test(p.code) && Number.isInteger(file) && file >= 0 && Number.isInteger(seq) && seq >= 0
    ? { code: p.code, file, seq }
    : null;
}

const bad = (error: string, status = 400) => Response.json({ error }, { status });

/** Stores one chunk (raw bytes) of a file in an upload that is still in progress. */
export async function PUT(req: Request, { params }: Ctx) {
  const at = await parse(params);
  if (!at) return bad("Invalid chunk address.");
  return withCloud(async () => {
    const { uploads, chunks } = await collections();
    const doc = await uploads.findOne({ _id: at.code, status: "uploading" });
    if (!doc) return bad("Upload not found or already finished.", 404);
    const file = doc.files[at.file];
    if (!file || at.seq >= file.chunks) return bad("Chunk is outside the declared files.");

    const data = new Uint8Array(await req.arrayBuffer());
    if (data.length !== chunkLength(file.size, at.seq)) return bad("Chunk size does not match the declared file size.");

    await chunks.replaceOne(
      { _id: `${at.code}:${at.file}:${at.seq}` },
      { upload: at.code, file: at.file, seq: at.seq, data: new Binary(data), expiresAt: doc.expiresAt },
      { upsert: true },
    );
    return new Response(null, { status: 204 });
  });
}

/** Returns one chunk of a finished upload as raw bytes. */
export async function GET(_req: Request, { params }: Ctx) {
  const at = await parse(params);
  if (!at) return bad("Invalid chunk address.");
  return withCloud(async () => {
    const { uploads, chunks } = await collections();
    const doc = await uploads.findOne({ _id: at.code, status: "ready" }, { projection: { _id: 1 } });
    const chunk = doc && (await chunks.findOne({ _id: `${at.code}:${at.file}:${at.seq}` }));
    if (!chunk) return bad("Not found. It may have been downloaded, deleted or expired.", 404);
    const bytes = chunk.data.buffer.subarray(0, chunk.data.length()) as Uint8Array<ArrayBuffer>;
    return new Response(bytes, { headers: { ...noStore, "Content-Type": "application/octet-stream" } });
  });
}
