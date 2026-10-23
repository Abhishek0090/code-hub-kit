/** Same rule as the server (src/server/rooms.ts). */
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

export const COLORS = ["#f472b6", "#60a5fa", "#fbbf24", "#34d399", "#a78bfa", "#fb923c", "#22d3ee", "#f87171"];

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
