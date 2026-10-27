import { createHash } from "node:crypto";
import { collections, noStore, toCloudUpload, withCloud } from "@/lib/cloud/db";
import { CODE_RE, KEEP_HOURS } from "@/lib/cloud/shared";

type Ctx = { params: Promise<{ code: string }> };

const notFound = () =>
  Response.json({ error: "No upload with that code. It may have been downloaded, deleted or expired." }, { status: 404 });

/** One finished upload, for looking it up by code. */
export async function GET(_req: Request, { params }: Ctx) {
  const { code } = await params;
  if (!CODE_RE.test(code)) return notFound();
  return withCloud(async () => {
    const { uploads } = await collections();
    const doc = await uploads.findOne({ _id: code, status: "ready", expiresAt: { $gt: new Date() } });
    return doc ? Response.json(toCloudUpload(doc), { headers: noStore }) : notFound();
  });
}

/**
 * Finishes an upload: checks every chunk arrived and each file's SHA-256 matches what the browser declared, then
 * makes it visible and keeps it for KEEP_HOURS.
 */
export async function PATCH(_req: Request, { params }: Ctx) {
  const { code } = await params;
  if (!CODE_RE.test(code)) return notFound();
  return withCloud(async () => {
    const { uploads, chunks } = await collections();
    const doc = await uploads.findOne({ _id: code, status: "uploading" });
    if (!doc) return notFound();

    for (let i = 0; i < doc.files.length; i++) {
      const file = doc.files[i];
      const hash = createHash("sha256");
      let seen = 0;
      for await (const chunk of chunks.find({ upload: code, file: i }).sort({ seq: 1 })) {
        if (chunk.seq !== seen) break;
        hash.update(chunk.data.buffer.subarray(0, chunk.data.length()));
        seen++;
      }
      if (seen !== file.chunks || hash.digest("hex") !== file.sha256) {
        return Response.json({ error: `${file.fileName} did not arrive intact. Upload again.` }, { status: 409 });
      }
    }

    const expiresAt = new Date(Date.now() + KEEP_HOURS * 3_600_000);
    await chunks.updateMany({ upload: code }, { $set: { expiresAt } });
    await uploads.updateOne({ _id: code }, { $set: { status: "ready", expiresAt } });
    return Response.json(toCloudUpload({ ...doc, status: "ready", expiresAt }), { headers: noStore });
  });
}

/** Deletes an upload and its chunks. Called after a verified download, or from the Delete button. */
export async function DELETE(_req: Request, { params }: Ctx) {
  const { code } = await params;
  if (!CODE_RE.test(code)) return notFound();
  return withCloud(async () => {
    const { uploads, chunks } = await collections();
    const { deletedCount } = await uploads.deleteOne({ _id: code });
    await chunks.deleteMany({ upload: code });
    return deletedCount ? new Response(null, { status: 204 }) : notFound();
  });
}
