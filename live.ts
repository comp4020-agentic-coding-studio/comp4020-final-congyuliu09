import type { ServerResponse } from "node:http";

// One decision written down for crit 9: updates fan out per-inspection, not
// globally. Two people looking at the same car's findings see each other's
// adds within about a second; someone looking at a different inspection, or
// the top-level list, doesn't get woken up for findings they can't see. That
// keeps a slow connection's one SSE stream scoped to the one page it's open
// on, instead of every visitor's browser replaying every other visitor's
// findings traffic.
const subscribers = new Map<string, Set<ServerResponse>>();

export function subscribe(inspectionId: string, res: ServerResponse): void {
  let set = subscribers.get(inspectionId);
  if (!set) {
    set = new Set();
    subscribers.set(inspectionId, set);
  }
  set.add(res);
}

export function unsubscribe(inspectionId: string, res: ServerResponse): void {
  const set = subscribers.get(inspectionId);
  if (!set) return;
  set.delete(res);
  if (set.size === 0) subscribers.delete(inspectionId);
}

export function publishFindingAdded(inspectionId: string, findingHtml: string): void {
  const set = subscribers.get(inspectionId);
  if (!set) return;
  const payload = JSON.stringify({ html: findingHtml });
  for (const res of set) {
    res.write(`event: finding\ndata: ${payload}\n\n`);
  }
}
