# Cloud scripts

Upload to cloud hands generated scripts from one device to another through MongoDB. On the first device, generate
scripts on Project to Script and choose **Upload to cloud**. On the second, open **Uploaded Scripts** in the sidebar
and choose **Download**. The download is checked with SHA-256, then the upload is deleted.

It is off until `MONGODB_URI` is set. Without it the upload panel and the page explain how to turn it on.

## Setup

1. Create a free MongoDB Atlas cluster and a database user.
2. Under Network Access, allow your server. On Vercel the outgoing IPs change, so allow `0.0.0.0/0`.
3. Set `MONGODB_URI` to the cluster's connection string in `.env.local` (or Vercel's environment variables) and
   restart. `MONGODB_DB` picks the database name (default `codehub`).

The first request creates the indexes. No other setup is needed.

## Limits

| Limit | Value | Where |
| --- | --- | --- |
| Storage | 512 MB (Atlas free tier). `CLOUD_STORAGE_MB` changes it for a paid cluster. | `DEFAULT_STORAGE_MB` in `shared.ts` |
| Usable share | 90% of storage. Uploads are refused past it (HTTP 507), leaving room for BSON and index overhead. | `STORAGE_HEADROOM` |
| Per upload | 50 MB for all script files together (HTTP 413) | `MAX_UPLOAD_BYTES` |
| Kept for | 72 hours if nobody downloads it | `KEEP_HOURS` |
| Unfinished upload | Deleted after 60 minutes | `PENDING_MINUTES` |

Storage in use is read from `dbStats` (`dataSize + indexSize`), the same figure Atlas counts against the free tier.
The Uploaded Scripts page and the upload panel show it as a bar.

## How it works

Vercel functions accept and return at most 4.5 MB per request, so every file moves in 2 MB chunks
(`CHUNK_BYTES`).

```text
browser                                   /api/scripts                     MongoDB
POST   /api/scripts {name, files+sha256} -> check limits, pick code     -> uploads {status: uploading}
PUT    /api/scripts/CODE/chunks/F/S      -> check chunk size            -> chunks {data}
PATCH  /api/scripts/CODE                 -> re-hash every file          -> status: ready, expiresAt +72 h
GET    /api/scripts                      -> list ready uploads + storage
GET    /api/scripts/CODE/chunks/F/S      -> raw bytes
DELETE /api/scripts/CODE                 -> upload and its chunks
```

| Collection | Holds |
| --- | --- |
| `uploads` | One document per upload. `_id` is the 6-character code. Reference name, project name, file list with sizes and SHA-256, status, `expiresAt`. |
| `chunks` | One document per 2 MB chunk: `_id` `CODE:file:seq`, the bytes, `expiresAt`. |

Both collections have a TTL index on `expiresAt`, so MongoDB removes expired documents on its own (about once a
minute).

### Download and cleanup

**Download** fetches every chunk, joins them, and checks each file's SHA-256 against the value recorded at upload.
Only when all files pass does it save them (one file as-is, several as a `.zip`) and, with **Delete from cloud after
download** ticked, call `DELETE`. If a check fails, nothing is deleted.

**Save** in the Files table downloads one file and never deletes, for picking one format out of several.

The browser can't confirm the file was written to disk, so "success" means the bytes arrived intact and the save was
started.

## Security

There are no accounts. Anyone who can open the site can see the list, download and delete uploads. Scripts leave out
files that may hold secrets (see 04-project-to-script.md), but they still contain source code. If the site is public,
put it behind your host's access protection or leave `MONGODB_URI` unset.

## Code map

| File | Role |
| --- | --- |
| `src/lib/cloud/shared.ts` | Limits, types, code format. Used by browser and server. |
| `src/lib/cloud/db.ts` | Server only: connection, indexes, storage figures, error handling (`withCloud`) |
| `src/lib/cloud/client.ts` | Browser: chunked upload, verified download, delete |
| `src/app/api/scripts/` | The routes above |
| `src/components/CloudUploadPanel.tsx` | Upload panel under the generated scripts |
| `src/components/CloudScripts.tsx` | The Uploaded Scripts page |
