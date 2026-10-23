/**
 * Next.js plus the WebSocket endpoint for live codeshare rooms (/ws/<room>), on one port.
 *   npm run dev     development, with hot reload
 *   npm start       production (after npm run build)
 */
import { createServer } from "node:http";
import next from "next";
import { WebSocketServer } from "ws";
import { joinRoom, ROOM_ID, roomStats } from "./relay/rooms";

const port = Number(process.env.PORT || 3000);
const dev = !process.argv.includes("--production");
const app = next({ dev });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  const nextUpgrade = app.getUpgradeHandler();
  const wss = new WebSocketServer({ noServer: true, maxPayload: 2 * 1024 * 1024 });

  const server = createServer((req, res) => {
    if (req.url === "/api/realtime") {
      res.setHeader("Content-Type", "application/json");
      res.setHeader("Cache-Control", "no-store");
      res.end(JSON.stringify(roomStats()));
      return;
    }
    handle(req, res);
  });

  server.on("upgrade", (req, socket, head) => {
    const path = new URL(req.url ?? "/", "http://localhost").pathname;
    if (!path.startsWith("/ws/")) {
      nextUpgrade(req, socket, head); // Next.js hot reload in dev
      return;
    }
    const room = decodeURIComponent(path.slice(4));
    if (!ROOM_ID.test(room)) {
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => joinRoom(room, ws));
  });

  // Like `next dev`: if the port is taken, try the next one (up to 10), unless PORT was set explicitly.
  let attempt = port;
  server.on("error", (err: NodeJS.ErrnoException) => {
    if (err.code === "EADDRINUSE" && !process.env.PORT && attempt < port + 10) {
      console.log(`  Port ${attempt} is in use, trying ${attempt + 1}...`);
      server.listen(++attempt);
      return;
    }
    if (err.code === "EADDRINUSE") {
      console.error(`Port ${attempt} is in use. Stop the other server or pick a port: PORT=4000 npm run dev`);
      process.exit(1);
    }
    throw err;
  });
  server.on("listening", () => {
    console.log(`> Ready on http://localhost:${attempt} (${dev ? "development" : "production"})`);
  });
  server.listen(attempt);
});
