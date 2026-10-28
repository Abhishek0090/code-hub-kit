import { randomInt } from "node:crypto";
import { connection } from "next/server";
import { collections, noStore, storage, toCloudUpload, withCloud } from "@/lib/cloud/db";
import {
  chunkCount,
  CLOUD_FORMATS,
  CODE_ALPHABET,
  FILE_NAME_RE,
  PENDING_MINUTES,
  type CloudFile,
  type CloudList,
} from "@/lib/cloud/shared";

/** Lists finished uploads, newest first, with storage use. */
export async function GET() {
  await connection();
  return withCloud(async () => {
    const { uploads } = await collections();
    const docs = await uploads
      .find({ status: "ready", expiresAt: { $gt: new Date() } })
      .sort({ createdAt: -1 })
      .limit(200)
      .toArray();
    const body: CloudList = { uploads: docs.map(toCloudUpload), storage: await storage() };
    return Response.json(body, { headers: noStore });
  });
}

const isInt = (n: unknown, min: number) => Number.isInteger(n) && (n as number) >= min;
const text = (s: unknown, max: number) => (typeof s === "string" ? s.trim().slice(0, max) : "");

/**
 * Starts an upload: records the file list and returns the code. The browser then PUTs each file's chunks and
 * PATCHes the upload to finish it. Until then it expires after PENDING_MINUTES.
 */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { name?: unknown; project?: unknown; files?: unknown } | null;
  const project = text(body?.project, 100);
  const name = text(body?.name, 100) || project;
  const raw = Array.isArray(body?.files) ? (body.files as Partial<CloudFile>[]) : [];
  if (!name) return Response.json({ error: "A reference name is required." }, { status: 400 });
  if (!raw.length || raw.length > 200) return Response.json({ error: "Send between 1 and 200 files." }, { status: 400 });

  const files: CloudFile[] = [];
  for (const f of raw) {
    if (
      typeof f.fileName !== "string" ||
      !FILE_NAME_RE.test(f.fileName) ||
      !CLOUD_FORMATS.includes(f.format!) ||
      !isInt(f.part, 1) ||
      !isInt(f.parts, 1) ||
      !isInt(f.fileCount, 0) ||
      !isInt(f.size, 0) ||
      typeof f.sha256 !== "string" ||
      !/^[0-9a-f]{64}$/.test(f.sha256)
    ) {
      return Response.json({ error: `Invalid file entry: ${String(f.fileName)}` }, { status: 400 });
    }
    files.push({
      fileName: f.fileName,
      format: f.format!,
      part: f.part!,
      parts: f.parts!,
      fileCount: f.fileCount!,
      size: f.size!,
      sha256: f.sha256,
      chunks: chunkCount(f.size!),
    });
  }
  if (new Set(files.map((f) => f.fileName)).size !== files.length) {
    return Response.json({ error: "File names must be unique." }, { status: 400 });
  }
  const size = files.reduce((n, f) => n + f.size, 0);

  return withCloud(async () => {
    const limits = await storage();
    const mb = (n: number) => `${(n / 1024 / 1024).toFixed(1)} MB`;
    if (size > limits.maxUpload) {
      return Response.json(
        { error: `This upload is ${mb(size)}. The limit is ${mb(limits.maxUpload)} per upload. Use fewer formats or leave out large files.` },
        { status: 413 },
      );
    }
    if (limits.used + size > limits.usable) {
      return Response.json(
        {
          error: `Not enough cloud space: ${mb(limits.used)} of ${mb(limits.usable)} is in use and this upload needs ${mb(size)}. Download or delete older uploads first.`,
        },
        { status: 507 },
      );
    }

    const { uploads } = await collections();
    const now = new Date();
    for (let attempt = 0; attempt < 5; attempt++) {
      const code = Array.from({ length: 6 }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join("");
      try {
        await uploads.insertOne({
          _id: code,
          name,
          project: project || name,
          files,
          size,
          status: "uploading",
          createdAt: now,
          expiresAt: new Date(now.getTime() + PENDING_MINUTES * 60_000),
        });
        return Response.json({ code, files }, { status: 201, headers: noStore });
      } catch (err) {
        if ((err as { code?: number }).code !== 11000) throw err;
      }
    }
    throw new Error("Could not pick a free upload code. Try again.");
  });
}
