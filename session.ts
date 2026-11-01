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

// Tells visitors apart without accounts: a random id set on first visit and
// sent back on every later one, in or out of this repo's test runner. It
// identifies who recorded what (the home list is scoped to it, and every
// finding/log entry is attributed to it); it isn't a capability secret, so it
// doesn't need to be kept out of logs the way a session token protecting
// someone else's data would.
export function getOrCreateVisitorId(req: IncomingMessage, res: ServerResponse): string {
  const existing = parseCookies(req.headers.cookie)[COOKIE_NAME];
  if (existing) return existing;

  const id = randomUUID();
  res.setHeader(
    "set-cookie",
    `${COOKIE_NAME}=${id}; Path=/; Max-Age=${60 * 60 * 24 * 365}; HttpOnly; SameSite=Lax`,
  );
  return id;
}
