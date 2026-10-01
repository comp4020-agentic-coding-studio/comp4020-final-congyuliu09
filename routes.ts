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
  type Severity,
} from "./db.ts";

const SEVERITIES: Severity[] = ["low", "medium", "high"];

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

function inspectionListPage(db: DatabaseSync): string {
  const inspections = listInspections(db);
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

function inspectionDetailPage(db: DatabaseSync, id: string): string | undefined {
  const inspection = getInspection(db, id);
  if (!inspection) return undefined;
  const findings = listFindings(db, id);
  const findingRows = findings
    .map(
      (f) => `<tr>
        <td>${escapeHtml(f.category)}</td>
        <td>${escapeHtml(f.description)}</td>
        <td class="severity-${f.severity}">${f.severity}</td>
        <td>${new Date(f.created_at).toLocaleString()}</td>
      </tr>`,
    )
    .join("");
  const severityOptions = SEVERITIES.map((s) => `<option value="${s}">${s}</option>`).join("");

  return page(
    `${inspection.make} ${inspection.model}`,
    `<h1>${escapeHtml(inspection.make)} ${escapeHtml(inspection.model)} (${inspection.year})</h1>
     <p>Odometer: ${inspection.odometer.toLocaleString()} km · recorded ${new Date(inspection.created_at).toLocaleString()}</p>
     <h2>Findings</h2>
     ${
       findings.length === 0
         ? "<p>No findings recorded yet.</p>"
         : `<table><thead><tr><th>Category</th><th>Description</th><th>Severity</th><th>Recorded</th></tr></thead><tbody>${findingRows}</tbody></table>`
     }
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
     </fieldset>`,
  );
}

export async function handleRequest(req: IncomingMessage, res: ServerResponse, db: DatabaseSync): Promise<void> {
  const url = new URL(req.url ?? "/", "http://internal");
  const { pathname } = url;
  const method = req.method ?? "GET";

  if (method === "GET" && pathname === "/") {
    return send(res, 200, inspectionListPage(db));
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
    });
    return redirect(res, `/inspections/${inspection.id}`);
  }

  const detailMatch = pathname.match(/^\/inspections\/([^/]+)$/);
  if (method === "GET" && detailMatch) {
    const html = inspectionDetailPage(db, detailMatch[1]);
    return html ? send(res, 200, html) : notFound(res);
  }

  const findingsMatch = pathname.match(/^\/inspections\/([^/]+)\/findings$/);
  if (method === "POST" && findingsMatch) {
    const inspectionId = findingsMatch[1];
    if (!getInspection(db, inspectionId)) return notFound(res);
    const form = parseForm(await readBody(req));
    const severity = SEVERITIES.includes(form.severity as Severity) ? (form.severity as Severity) : "low";
    addFinding(db, {
      inspection_id: inspectionId,
      category: form.category ?? "",
      description: form.description ?? "",
      severity,
    });
    return redirect(res, `/inspections/${inspectionId}`);
  }

  if (method === "GET" && pathname === "/readme/") {
    const readme = readFileSync("README.md", "utf8");
    return send(res, 200, page("About CarCheck", markdownToHtml(readme)));
  }

  return notFound(res);
}
