import type { IncomingMessage, ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";

const COOKIE_NAME = "visitor_id";

function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    out[part.slice(0, eq).trim()] = decodeURIComponent(part.slice(eq + 1).trim());
  }
  return out;
}

// Tells visitors apart: a random id, set on first visit, that's either a bare
// guest id or — once registered or logged in — an account id from auth.ts.
// Either way it identifies who recorded what (the home list is scoped to it,
// findings/log entries are attributed to it); it isn't a capability secret on
// its own (the account behind it is protected by a password, not by the id
// staying hidden), so it doesn't need the same handling as a session token.
export function getOrCreateVisitorId(req: IncomingMessage, res: ServerResponse): string {
  const existing = parseCookies(req.headers.cookie)[COOKIE_NAME];
  if (existing) return existing;
  return setVisitorId(res, randomUUID());
}

export function getVisitorId(req: IncomingMessage): string | undefined {
  return parseCookies(req.headers.cookie)[COOKIE_NAME];
}

// Used by registration (the guest id becomes the account id, so nothing it
// already owns needs to move) and by login (swaps the browser's cookie to
// the account id being logged into, on this device only).
export function setVisitorId(res: ServerResponse, id: string): string {
  res.setHeader(
    "set-cookie",
    `${COOKIE_NAME}=${id}; Path=/; Max-Age=${60 * 60 * 24 * 365}; HttpOnly; SameSite=Lax`,
  );
  return id;
}
