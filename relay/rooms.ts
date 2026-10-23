import * as decoding from "lib0/decoding";
import * as encoding from "lib0/encoding";
import type { WebSocket } from "ws";
import * as awarenessProtocol from "y-protocols/awareness";
import * as syncProtocol from "y-protocols/sync";
import * as Y from "yjs";

/**
 * Live codeshare rooms, held in memory only. Speaks the y-websocket protocol, so the browser uses the
 * stock WebsocketProvider. Nothing is written to disk: a room is deleted shortly after its last
 * person leaves (the grace period lets a page refresh reconnect without losing the code).
 */

const MESSAGE_SYNC = 0;
const MESSAGE_AWARENESS = 1;
const EMPTY_ROOM_TTL_MS = 60_000;
const MAX_ROOMS = 500;
const PING_INTERVAL_MS = 30_000;

export const ROOM_ID = /^[a-z0-9-]{3,40}$/;

interface Room {
  doc: Y.Doc;
  awareness: awarenessProtocol.Awareness;
  /** Each connection with the awareness client ids it owns, so they can be cleared when it closes. */
  conns: Map<WebSocket, Set<number>>;
  deleteTimer: NodeJS.Timeout | null;
}

const rooms = new Map<string, Room>();

function send(ws: WebSocket, message: Uint8Array) {
  if (ws.readyState === ws.OPEN) ws.send(message, (err) => err && ws.close());
}

function broadcast(room: Room, message: Uint8Array) {
  for (const ws of room.conns.keys()) send(ws, message);
}

function createRoom(): Room {
  const doc = new Y.Doc();
  const awareness = new awarenessProtocol.Awareness(doc);
  awareness.setLocalState(null);
  const room: Room = { doc, awareness, conns: new Map(), deleteTimer: null };

  doc.on("update", (update: Uint8Array) => {
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, MESSAGE_SYNC);
    syncProtocol.writeUpdate(encoder, update);
    broadcast(room, encoding.toUint8Array(encoder));
  });

  awareness.on(
    "update",
    (
      { added, updated, removed }: { added: number[]; updated: number[]; removed: number[] },
      origin: unknown,
    ) => {
      const changed = [...added, ...updated, ...removed];
      const owned = room.conns.get(origin as WebSocket);
      if (owned) {
        for (const id of added) owned.add(id);
        for (const id of removed) owned.delete(id);
      }
      const encoder = encoding.createEncoder();
      encoding.writeVarUint(encoder, MESSAGE_AWARENESS);
      encoding.writeVarUint8Array(encoder, awarenessProtocol.encodeAwarenessUpdate(awareness, changed));
      broadcast(room, encoding.toUint8Array(encoder));
    },
  );
  return room;
}

function closeConnection(name: string, room: Room, ws: WebSocket) {
  const owned = room.conns.get(ws);
  if (!owned) return;
  room.conns.delete(ws);
  awarenessProtocol.removeAwarenessStates(room.awareness, [...owned], null);
  if (room.conns.size === 0) {
    room.deleteTimer = setTimeout(() => {
      room.doc.destroy();
      rooms.delete(name);
    }, EMPTY_ROOM_TTL_MS);
  }
}

export function joinRoom(name: string, ws: WebSocket) {
  let room = rooms.get(name);
  if (!room) {
    if (rooms.size >= MAX_ROOMS) {
      ws.close(1013, "Too many rooms open, try again later");
      return;
    }
    room = createRoom();
    rooms.set(name, room);
  }
  if (room.deleteTimer) {
    clearTimeout(room.deleteTimer);
    room.deleteTimer = null;
  }
  const r = room;
  r.conns.set(ws, new Set());
  ws.binaryType = "arraybuffer";

  ws.on("message", (data: ArrayBuffer) => {
    try {
      const decoder = decoding.createDecoder(new Uint8Array(data));
      const encoder = encoding.createEncoder();
      const type = decoding.readVarUint(decoder);
      if (type === MESSAGE_SYNC) {
        encoding.writeVarUint(encoder, MESSAGE_SYNC);
        syncProtocol.readSyncMessage(decoder, encoder, r.doc, ws);
        if (encoding.length(encoder) > 1) send(ws, encoding.toUint8Array(encoder));
      } else if (type === MESSAGE_AWARENESS) {
        awarenessProtocol.applyAwarenessUpdate(r.awareness, decoding.readVarUint8Array(decoder), ws);
      }
    } catch {
      ws.close(1003, "Bad message");
    }
  });

  let alive = true;
  ws.on("pong", () => (alive = true));
  const ping = setInterval(() => {
    if (!alive) return ws.terminate();
    alive = false;
    ws.ping();
  }, PING_INTERVAL_MS);
  ws.on("close", () => {
    clearInterval(ping);
    closeConnection(name, r, ws);
  });

  // Start the sync handshake and tell the newcomer who is already here.
  const encoder = encoding.createEncoder();
  encoding.writeVarUint(encoder, MESSAGE_SYNC);
  syncProtocol.writeSyncStep1(encoder, r.doc);
  send(ws, encoding.toUint8Array(encoder));
  const states = r.awareness.getStates();
  if (states.size) {
    const enc = encoding.createEncoder();
    encoding.writeVarUint(enc, MESSAGE_AWARENESS);
    encoding.writeVarUint8Array(enc, awarenessProtocol.encodeAwarenessUpdate(r.awareness, [...states.keys()]));
    send(ws, encoding.toUint8Array(enc));
  }
}

export function roomStats() {
  let people = 0;
  let active = 0;
  for (const room of rooms.values()) {
    people += room.conns.size;
    if (room.conns.size) active++;
  }
  return { rooms: active, people };
}
