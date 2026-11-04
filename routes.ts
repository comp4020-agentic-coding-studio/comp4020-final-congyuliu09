import type { IncomingMessage, ServerResponse } from "node:http";
import type { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { timingSafeEqual } from "node:crypto";
import { escapeHtml, markdownToHtml, page } from "./html.ts";
import {
  addFinding,
  createInspection,
  getInspection,
  listFindings,
  listInspections,
  listRecentActivity,
  logActivity,
  type Severity,
} from "./db.ts";
import { getOrCreateVisitorId } from "./session.ts";
import { publishFindingAdded, subscribe, unsubscribe } from "./live.ts";

const SEVERITIES: Severity[] = ["low", "medium", "high"];

// Short, stable tag for a visitor id in HTML and logs — never the full
// random id, so pasting a log line doesn't hand out someone else's cookie.
function shortId(id: string): string {
  return id.slice(0, 8);
}

// The activity log exists for crit 10's "narrate from the logs" demand — the
// person running the app, not every visitor. Findings are low-stakes, but
// they're still a stranger's private notes about a specific car; publishing
// everyone's at an unauthenticated URL would undo the same per-visitor
// isolation the rest of the app enforces. A shared token (set once as an
// env var, never committed) gates it instead of a second account system.
function hasLogsAccess(url: URL): boolean {
  const required = process.env.LOGS_TOKEN;
  if (!required) return false; // no token configured: nobody gets the log, not everybody
  const supplied = url.searchParams.get("token") ?? "";
  const a = Buffer.from(supplied);
  const b = Buffer.from(required);
  return a.length === b.length && timingSafeEqual(a, b);
}

async function readBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString("utf8");
}

function parseForm(body: string): Record<string, string> {
  return Object.fromEntries(new URLSearchParams(body));
}

function send(res: ServerResponse, status: number, html: string): void {
  res.writeHead(status, { "content-type": "text/html; charset=utf-8" });
  res.end(html);
}

function redirect(res: ServerResponse, location: string): void {
  res.writeHead(303, { location });
  res.end();
}

function notFound(res: ServerResponse): void {
  send(
    res,
    404,
    page(
      "Not found",
      `<h1 style="color: var(--high);">404</h1>
       <p class="lede">No inspection with that id — whether it never existed or it isn't yours, this is what you get either way.</p>
       <p><a class="btn-link" href="/">Back to inspections</a></p>`,
    ),
  );
}

function inspectionListPage(db: DatabaseSync, visitorId: string): string {
  const inspections = listInspections(db, visitorId);
  const rows = inspections
    .map(
      (i) => `<tr>
        <td><a href="/inspections/${i.id}">${escapeHtml(i.make)} ${escapeHtml(i.model)}</a></td>
        <td>${i.year}</td>
        <td>${i.odometer.toLocaleString()} km</td>
        <td>${new Date(i.created_at).toLocaleString()}</td>
      </tr>`,
    )
    .join("");
  return page(
    "CarCheck",
    `<h1>Inspections</h1>
     <p class="lede">Signed in as <span class="chip">${shortId(visitorId)}</span> — only you can see or add to these.</p>
     <p><a class="btn-link" href="/inspections/new">+ New inspection</a></p>
     <h2>Garage</h2>
     ${
       inspections.length === 0
         ? '<div class="card"><p class="empty">No inspections yet. Start your first walk-around.</p></div>'
         : `<div class="table-wrap"><table><thead><tr><th>Vehicle</th><th>Year</th><th>Odometer</th><th>Created</th></tr></thead><tbody>${rows}</tbody></table></div>`
     }`,
  );
}

function newInspectionFormPage(): string {
  return page(
    "New inspection",
    `<h1>New inspection</h1>
     <p class="lede">Log the vehicle before you start finding things wrong with it.</p>
     <form method="post" action="/inspections">
       <label for="make">Make</label>
       <input id="make" name="make" required autofocus />
       <label for="model">Model</label>
       <input id="model" name="model" required />
       <label for="year">Year</label>
       <input id="year" name="year" type="number" min="1900" max="2100" required />
       <label for="odometer">Odometer (km)</label>
       <input id="odometer" name="odometer" type="number" min="0" required />
       <button type="submit">Start inspection</button>
     </form>`,
  );
}

function findingRowHtml(f: { category: string; description: string; severity: Severity; created_at: string }): string {
  return `<tr>
        <td>${escapeHtml(f.category)}</td>
        <td>${escapeHtml(f.description)}</td>
        <td><span class="badge severity-${f.severity}">${f.severity}</span></td>
        <td>${new Date(f.created_at).toLocaleString()}</td>
      </tr>`;
}

function inspectionDetailPage(db: DatabaseSync, id: string, visitorId: string): string | undefined {
  const inspection = getInspection(db, id);
  // Server-side authorization, not client-side hiding: an inspection only
  // exists for its owner, so anyone else's id gets the same 404 an unknown id
  // would — there's nothing to tell a stranger "this exists but isn't yours".
  if (!inspection || inspection.owner_id !== visitorId) return undefined;
  const findings = listFindings(db, id);
  const findingRows = findings.map(findingRowHtml).join("");
  const severityOptions = SEVERITIES.map((s) => `<option value="${s}">${s}</option>`).join("");
  const highCount = findings.filter((f) => f.severity === "high").length;
  const mediumCount = findings.filter((f) => f.severity === "medium").length;
  const lowCount = findings.filter((f) => f.severity === "low").length;

  return page(
    `${inspection.make} ${inspection.model}`,
    `<h1>${escapeHtml(inspection.make)} ${escapeHtml(inspection.model)} <span style="color: var(--text-muted); font-weight: 600;">'${inspection.year}</span></h1>
     <p class="lede"><span class="live-dot"></span>live · recorded ${new Date(inspection.created_at).toLocaleString()}</p>
     <div class="card">
       <div class="stat-row">
         <div class="stat"><div class="label">Odometer</div><div class="value">${inspection.odometer.toLocaleString()} km</div></div>
         <div class="stat"><div class="label">High</div><div class="value" style="color: var(--high);">${highCount}</div></div>
         <div class="stat"><div class="label">Medium</div><div class="value" style="color: var(--medium);">${mediumCount}</div></div>
         <div class="stat"><div class="label">Low</div><div class="value" style="color: var(--low);">${lowCount}</div></div>
       </div>
     </div>
     <h2>Findings</h2>
     <div class="table-wrap">
       <table id="findings-table"><thead><tr><th>Category</th><th>Description</th><th>Severity</th><th>Recorded</th></tr></thead>
         <tbody id="findings-body">${findingRows}</tbody></table>
     </div>
     <p id="findings-empty" class="empty" ${findings.length === 0 ? "" : "hidden"}>No findings recorded yet.</p>
     <fieldset>
       <legend>Add a finding</legend>
       <form method="post" action="/inspections/${inspection.id}/findings">
         <label for="category">Category</label>
         <input id="category" name="category" placeholder="tyre, oil leak, body, OBD code..." required />
         <label for="description">Description</label>
         <input id="description" name="description" required />
         <label for="severity">Severity</label>
         <select id="severity" name="severity">${severityOptions}</select>
         <button type="submit">Log finding</button>
       </form>
     </fieldset>
     <script>
       // Crit 9's real-time decision: an EventSource per open inspection page,
       // scoped to this inspection only (see live.ts). A finding another open
       // session (you, on your phone, or whoever else shares this browser's
       // visitor cookie) adds appears here within about a second, no reload.
       const events = new EventSource(${JSON.stringify(`/inspections/${inspection.id}/events`)});
       events.addEventListener("finding", (e) => {
         const data = JSON.parse(e.data);
         document.getElementById("findings-empty").hidden = true;
         const tbody = document.getElementById("findings-body");
         tbody.insertAdjacentHTML("beforeend", data.html);
         const row = tbody.lastElementChild;
         if (row) row.classList.add("just-landed");
       });
     </script>`,
  );
}

export async function handleRequest(req: IncomingMessage, res: ServerResponse, db: DatabaseSync): Promise<void> {
  const url = new URL(req.url ?? "/", "http://internal");
  const { pathname } = url;
  const method = req.method ?? "GET";
  const visitorId = getOrCreateVisitorId(req, res);

  if (method === "GET" && pathname === "/") {
    return send(res, 200, inspectionListPage(db, visitorId));
  }

  if (method === "GET" && pathname === "/inspections/new") {
    return send(res, 200, newInspectionFormPage());
  }

  if (method === "POST" && pathname === "/inspections") {
    const form = parseForm(await readBody(req));
    const inspection = createInspection(db, {
      make: form.make ?? "",
      model: form.model ?? "",
      year: Number.parseInt(form.year ?? "", 10),
      odometer: Number.parseInt(form.odometer ?? "", 10),
      owner_id: visitorId,
    });
    logActivity(db, {
      actor_id: visitorId,
      action: "create_inspection",
      inspection_id: inspection.id,
      detail: `${inspection.make} ${inspection.model} (${inspection.year})`,
    });
    return redirect(res, `/inspections/${inspection.id}`);
  }

  const eventsMatch = pathname.match(/^\/inspections\/([^/]+)\/events$/);
  if (method === "GET" && eventsMatch) {
    const inspectionId = eventsMatch[1];
    const inspection = getInspection(db, inspectionId);
    if (!inspection || inspection.owner_id !== visitorId) return notFound(res);

    res.writeHead(200, {
      "content-type": "text/event-stream",
      "cache-control": "no-cache",
      connection: "keep-alive",
    });
    res.write(": connected\n\n");
    subscribe(inspectionId, res);
    req.on("close", () => unsubscribe(inspectionId, res));
    return;
  }

  const detailMatch = pathname.match(/^\/inspections\/([^/]+)$/);
  if (method === "GET" && detailMatch) {
    const html = inspectionDetailPage(db, detailMatch[1], visitorId);
    return html ? send(res, 200, html) : notFound(res);
  }

  const findingsMatch = pathname.match(/^\/inspections\/([^/]+)\/findings$/);
  if (method === "POST" && findingsMatch) {
    const inspectionId = findingsMatch[1];
    const inspection = getInspection(db, inspectionId);
    // Same rule as viewing: adding a finding to someone else's inspection
    // 404s instead of 403ing, so a guess reveals nothing about what exists.
    if (!inspection || inspection.owner_id !== visitorId) return notFound(res);
    const form = parseForm(await readBody(req));
    const severity = SEVERITIES.includes(form.severity as Severity) ? (form.severity as Severity) : "low";
    const finding = addFinding(db, {
      inspection_id: inspectionId,
      category: form.category ?? "",
      description: form.description ?? "",
      severity,
    });
    logActivity(db, {
      actor_id: visitorId,
      action: "add_finding",
      inspection_id: inspectionId,
      detail: `${finding.category} (${finding.severity})`,
    });
    publishFindingAdded(inspectionId, findingRowHtml(finding));
    return redirect(res, `/inspections/${inspectionId}`);
  }

  if (method === "GET" && pathname === "/readme/") {
    const readme = readFileSync("README.md", "utf8");
    return send(res, 200, page("About CarCheck", markdownToHtml(readme)));
  }

  if (method === "GET" && pathname === "/logs") {
    // No token configured, or the wrong one: 404, not 401/403 — same reasoning
    // as inspection ownership, this page shouldn't confirm its own existence
    // to someone who hasn't got the token.
    if (!hasLogsAccess(url)) return notFound(res);
    return send(res, 200, logsPage(db));
  }

  return notFound(res);
}

function logsPage(db: DatabaseSync): string {
  const entries = listRecentActivity(db);
  const rows = entries
    .map(
      (e) => `<tr>
        <td>${new Date(e.created_at).toISOString()}</td>
        <td>${escapeHtml(shortId(e.actor_id))}</td>
        <td>${escapeHtml(e.action)}</td>
        <td>${escapeHtml(e.detail)}</td>
      </tr>`,
    )
    .join("");
  return page(
    "Activity log",
    `<h1>Activity log</h1>
     <p class="lede">Server-side record of who did what; written on every mutation, independent of any browser's UI. This is what the crit narrates from.</p>
     ${
       entries.length === 0
         ? '<div class="card"><p class="empty">No activity yet.</p></div>'
         : `<div class="table-wrap"><table><thead><tr><th>When (UTC)</th><th>Visitor</th><th>Action</th><th>Detail</th></tr></thead><tbody>${rows}</tbody></table></div>`
     }`,
  );
}
