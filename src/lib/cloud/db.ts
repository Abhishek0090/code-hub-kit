import { MongoClient, type Binary, type Collection, type Db } from "mongodb";
import {
  DEFAULT_STORAGE_MB,
  MAX_UPLOAD_BYTES,
  STORAGE_HEADROOM,
  type CloudFile,
  type CloudStorage,
  type CloudUpload,
} from "./shared";

/** Server only. One connection pool per process; dev hot reloads reuse it through globalThis. */

export interface UploadDoc {
  _id: string;
  name: string;
  project: string;
  files: CloudFile[];
  size: number;
  status: "uploading" | "ready";
  createdAt: Date;
  expiresAt: Date;
}

export interface ChunkDoc {
  /** `${code}:${file}:${seq}` */
  _id: string;
  upload: string;
  file: number;
  seq: number;
  data: Binary;
  expiresAt: Date;
}

const g = globalThis as { __codeHubMongo?: Promise<Db> };

export const cloudConfigured = () => Boolean(process.env.MONGODB_URI);

function db(): Promise<Db> {
  g.__codeHubMongo ??= (async () => {
    const client = new MongoClient(process.env.MONGODB_URI!, { maxPoolSize: 5, serverSelectionTimeoutMS: 8000 });
    await client.connect();
    const d = client.db(process.env.MONGODB_DB || "codehub");
    // TTL indexes: MongoDB deletes expired uploads and chunks on its own (checked about once a minute).
    await Promise.all([
      d.collection("uploads").createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
      d.collection("chunks").createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
      d.collection("chunks").createIndex({ upload: 1, file: 1, seq: 1 }),
    ]);
    return d;
  })().catch((err) => {
    g.__codeHubMongo = undefined;
    throw err;
  });
  return g.__codeHubMongo;
}

export async function collections(): Promise<{ uploads: Collection<UploadDoc>; chunks: Collection<ChunkDoc> }> {
  const d = await db();
  return { uploads: d.collection<UploadDoc>("uploads"), chunks: d.collection<ChunkDoc>("chunks") };
}

/** Storage as Atlas counts it (dataSize + indexSize from dbStats), against the configured limit. */
export async function storage(): Promise<CloudStorage> {
  const d = await db();
  const stats = await d.stats();
  const limit = (Number(process.env.CLOUD_STORAGE_MB) || DEFAULT_STORAGE_MB) * 1024 * 1024;
  return {
    used: Number(stats.dataSize ?? 0) + Number(stats.indexSize ?? 0),
    usable: Math.floor(limit * STORAGE_HEADROOM),
    limit,
    maxUpload: Math.min(MAX_UPLOAD_BYTES, limit),
  };
}

export function toCloudUpload(doc: UploadDoc): CloudUpload {
  return {
    code: doc._id,
    name: doc.name,
    project: doc.project,
    files: doc.files,
    size: doc.size,
    createdAt: doc.createdAt.toISOString(),
    expiresAt: doc.expiresAt.toISOString(),
  };
}

/**
 * Runs a route handler against the database: 503 when MONGODB_URI is unset, 502 when MongoDB can't be reached.
 */
export async function withCloud(handler: () => Promise<Response>): Promise<Response> {
  if (!cloudConfigured()) {
    return Response.json({ error: "Cloud upload needs MONGODB_URI in .env.local." }, { status: 503 });
  }
  try {
    return await handler();
  } catch (err) {
    console.error("[cloud]", err);
    const message = err instanceof Error ? err.message : String(err);
    return Response.json({ error: `Database error: ${message}` }, { status: 502 });
  }
}

export const noStore = { "Cache-Control": "no-store" };
