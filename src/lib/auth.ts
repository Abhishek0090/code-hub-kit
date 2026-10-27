/**
 * Single fixed login. The session cookie holds "<expiry>.<hmac>", signed with AUTH_SECRET,
 * so it can be checked in proxy.ts without a database. Uses Web Crypto so it runs in any runtime.
 */
export const USERNAME = "abhi619";
export const PASSWORD = "Abhi@972001";

export const SESSION_COOKIE = "codehub_session";
export const SESSION_MAX_AGE = 60 * 60 * 24 * 7; // seconds

// Set AUTH_SECRET in production; the fallback only keeps local dev working.
const SECRET = process.env.AUTH_SECRET || "code-hub-dev-secret-change-me";

const encoder = new TextEncoder();

const key = () =>
  crypto.subtle.importKey("raw", encoder.encode(SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);

const toHex = (buf: ArrayBuffer) => Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");

const fromHex = (hex: string) => {
  if (!/^[0-9a-f]{64}$/.test(hex)) return null;
  return Uint8Array.from(hex.match(/../g)!, (h) => parseInt(h, 16));
};

export async function createSession(): Promise<string> {
  const expires = String(Date.now() + SESSION_MAX_AGE * 1000);
  const sig = await crypto.subtle.sign("HMAC", await key(), encoder.encode(`${USERNAME}:${expires}`));
  return `${expires}.${toHex(sig)}`;
}

export async function verifySession(token: string | undefined): Promise<boolean> {
  if (!token) return false;
  const [expires, sigHex] = token.split(".");
  const sig = sigHex ? fromHex(sigHex) : null;
  if (!sig || !/^\d+$/.test(expires) || Number(expires) < Date.now()) return false;
  return crypto.subtle.verify("HMAC", await key(), sig, encoder.encode(`${USERNAME}:${expires}`));
}

export const checkCredentials = (username: string, password: string) =>
  username.trim() === USERNAME && password === PASSWORD;
