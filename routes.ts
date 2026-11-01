import type { IncomingMessage, ServerResponse } from "node:http";
import type { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
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
  send(res, 404, page("Not found", "<h1>Not found</h1><p>No inspection with that id.</p>"));
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
    `<h1>CarCheck</h1>
     <p>Your inspections, as <code>${shortId(visitorId)}</code> — only you can see or add to these.</p>
     <p><a href="/inspections/new">+ New inspection</a></p>
     ${
       inspections.length === 0
         ? "<p>No inspections yet.</p>"
         : `<table><thead><tr><th>Vehicle</th><th>Year</th><th>Odometer</th><th>Created</th></tr></thead><tbody>${rows}</tbody></table>`
     }`,
  );
}

function newInspectionFormPage(): string {
  return page(
    "New inspection",
    `<h1>New inspection</h1>
     <form method="post" action="/inspections">
       <label for="make">Make</label>
       <input id="make" name="make" required />
       <label for="model">Model</label>
       <input id="model" name="model" required />
       <label for="year">Year</label>
       <input id="year" name="year" type="number" min="1900" max="2100" required />
       <label for="odometer">Odometer (km)</label>
       <input id="odometer" name="odometer" type="number" min="0" required />
       <p><button type="submit">Create inspection</button></p>
     </form>`,
  );
}

function findingRowHtml(f: { category: string; description: string; severity: Severity; created_at: string }): string {
  return `<tr>
        <td>${escapeHtml(f.category)}</td>
        <td>${escapeHtml(f.description)}</td>
        <td class="severity-${f.severity}">${f.severity}</td>
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

  return page(
    `${inspection.make} ${inspection.model}`,
    `<h1>${escapeHtml(inspection.make)} ${escapeHtml(inspection.model)} (${inspection.year})</h1>
     <p>Odometer: ${inspection.odometer.toLocaleString()} km · recorded ${new Date(inspection.created_at).toLocaleString()}</p>
     <h2>Findings</h2>
     <table id="findings-table"><thead><tr><th>Category</th><th>Description</th><th>Severity</th><th>Recorded</th></tr></thead>
       <tbody id="findings-body">${findingRows}</tbody></table>
     <p id="findings-empty" ${findings.length === 0 ? "" : "hidden"}>No findings recorded yet.</p>
     <fieldset>
       <legend>Add a finding</legend>
       <form method="post" action="/inspections/${inspection.id}/findings">
         <label for="category">Category</label>
         <input id="category" name="category" placeholder="tyre, oil leak, body, OBD code..." required />
         <label for="description">Description</label>
         <input id="description" name="description" required />
         <label for="severity">Severity</label>
         <select id="severity" name="severity">${severityOptions}</select>
         <p><button type="submit">Add finding</button></p>
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
         document.getElementById("findings-body").insertAdjacentHTML("beforeend", data.html);
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
     <p>Server-side record of who did what; written on every mutation, independent of any browser's UI. This is what the crit narrates from.</p>
     ${
       entries.length === 0
         ? "<p>No activity yet.</p>"
         : `<table><thead><tr><th>When (UTC)</th><th>Visitor</th><th>Action</th><th>Detail</th></tr></thead><tbody>${rows}</tbody></table>`
     }`,
  );
}
