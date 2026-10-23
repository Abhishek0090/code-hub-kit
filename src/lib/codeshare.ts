/** Same rule as the server (relay/rooms.ts). */
export const ROOM_ID = /^[a-z0-9-]{3,40}$/;

const ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";

export function newRoomId(): string {
  const pick = (n: number) => Array.from(crypto.getRandomValues(new Uint8Array(n)), (b) => ALPHABET[b % ALPHABET.length]).join("");
  return `${pick(3)}-${pick(4)}`;
}

/** Accepts a bare room code or a pasted room link. */
export function parseRoomInput(input: string): string | null {
  const s = input.trim().toLowerCase();
  const fromUrl = s.match(/\/codeshare\/([a-z0-9-]+)/)?.[1];
  const id = fromUrl ?? s;
  return ROOM_ID.test(id) ? id : null;
}

/**
 * Where the realtime relay lives. On Vercel (no WebSocket support) set NEXT_PUBLIC_REALTIME_URL to the
 * standalone relay, e.g. https://code-hub-relay.onrender.com. Unset = this site (server.ts serves /ws).
 * Call only in the browser.
 */
export function realtimeEndpoints(): { ws: string; stats: string; external: string | null } {
  const configured = process.env.NEXT_PUBLIC_REALTIME_URL?.trim().replace(/\/$/, "");
  if (configured) {
    return {
      ws: configured.replace(/^http(s?):/, "ws$1:") + "/ws",
      stats: configured.replace(/^ws(s?):/, "http$1:") + "/api/realtime",
      external: configured,
    };
  }
  return { ws: `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/ws`, stats: "/api/realtime", external: null };
}

export const COLORS =["#f472b6", "#60a5fa", "#fbbf24", "#34d399", "#a78bfa", "#fb923c", "#22d3ee", "#f87171"];

const NAME_KEY = "codehub.name";

export function loadName(): string {
  try {
    return localStorage.getItem(NAME_KEY) ?? "";
  } catch {
    return "";
  }
}

export function saveName(name: string) {
  try {
    localStorage.setItem(NAME_KEY, name);
  } catch {}
}
