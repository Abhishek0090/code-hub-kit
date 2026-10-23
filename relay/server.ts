/**
 * Standalone realtime relay for Live Codeshare, for when the app itself runs on a host without
 * WebSocket support (Vercel). Deploy this folder on any Node host (Render, Railway, Fly) and set
 * NEXT_PUBLIC_REALTIME_URL in the app to its URL. Rooms live in memory only.
 *
 *   npm start                 listens on PORT (default 8787)
 *
 * Environment:
 *   PORT              port to listen on
 *   ALLOWED_ORIGINS   optional, comma-separated sites allowed to connect, e.g.
 *                     https://code-hub.vercel.app,https://*.vercel.app,http://localhost:3000
 *                     Unset = any site may connect.
 */
import { createServer } from "node:http";
import { WebSocketServer } from "ws";
import { joinRoom, ROOM_ID, roomStats } from "./rooms";

const port = Number(process.env.PORT || 8787);

const allowed = (process.env.ALLOWED_ORIGINS ?? "")
  .split(",")
  .map((s) => s.trim().replace(/\/$/, ""))
  .filter(Boolean)
  .map((pattern) => new RegExp("^" + pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, "[^/]+") + "$"));

const originAllowed = (origin: string | undefined) => !allowed.length || (!!origin && allowed.some((re) => re.test(origin)));

const wss = new WebSocketServer({ noServer: true, maxPayload: 2 * 1024 * 1024 });

const server = createServer((req, res) => {
  const path = new URL(req.url ?? "/", "http://localhost").pathname;
  if (path === "/api/realtime") {
    // Only counts, nothing private, so any page may read it.
    res.writeHead(200, {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      "Access-Control-Allow-Origin": "*",
    });
    res.end(JSON.stringify(roomStats()));
    return;
  }
  if (path === "/" || path === "/health") {
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end("Code Hub realtime relay: ok\n");
    return;
  }
  res.writeHead(404).end();
});

server.on("upgrade", (req, socket, head) => {
  const path = new URL(req.url ?? "/", "http://localhost").pathname;
  const room = path.startsWith("/ws/") ? decodeURIComponent(path.slice(4)) : "";
  if (!ROOM_ID.test(room) || !originAllowed(req.headers.origin)) {
    socket.write("HTTP/1.1 403 Forbidden\r\n\r\n");
    socket.destroy();
    return;
  }
  wss.handleUpgrade(req, socket, head, (ws) => joinRoom(room, ws));
});

server.listen(port, () => {
  console.log(`> Code Hub relay listening on port ${port}`);
  console.log(allowed.length ? `  Allowed origins: ${process.env.ALLOWED_ORIGINS}` : "  Any origin may connect (set ALLOWED_ORIGINS to restrict)");
});
