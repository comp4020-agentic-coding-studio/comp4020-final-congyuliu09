import type { IncomingMessage, ServerResponse } from "node:http";
import type { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { randomUUID, timingSafeEqual } from "node:crypto";
import { escapeHtml, icon, markdownToHtml, page } from "./html.ts";
import {
  addFinding,
  addPhoto,
  createInspection,
  getFinding,
  getInspection,
  getPhoto,
  listFindings,
  listInspections,
  listPhotoMeta,
  listRecentActivity,
  logActivity,
  MAX_PHOTOS_PER_FINDING,
  type Finding,
  type Severity,
} from "./db.ts";
import { getAccountByUsername, getAccountById, registerAccount, verifyPassword } from "./auth.ts";
import { getOrCreateVisitorId, setVisitorId } from "./session.ts";
import { publishFindingAdded, subscribe, unsubscribe } from "./live.ts";
import { parseContentTypeBoundary, parseMultipart, readRawBody } from "./multipart.ts";

const SEVERITIES: Severity[] = ["low", "medium", "high"];
const MAX_PHOTO_BYTES = 5 * 1024 * 1024; // per photo
const MAX_UPLOAD_BYTES = MAX_PHOTOS_PER_FINDING * MAX_PHOTO_BYTES + 64 * 1024; // whole request, plus form overhead
const ALLOWED_PHOTO_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

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

// A guest cookie is just a random id with no row in `accounts`; once
// registerAccount or a login swaps the cookie onto an id that does have one,
// the same visitorId is "signed in" rather than "guest". Nothing about
// inspections.owner_id changes either way — this is purely a display/identity
// distinction, which is why registering a guest's existing id needs no
// migration (see auth.ts).
function accountBanner(db: DatabaseSync, visitorId: string): string {
  const account = getAccountById(db, visitorId);
  if (account) {
    return `<p class="lede">${icon("user", { class: "icon-accent" })} Signed in as <span class="chip">${escapeHtml(account.username)}</span> · <a href="/logout">${icon("logout", { size: 14 })} log out</a></p>`;
  }
  return `<p class="lede">${icon("guest", { class: "icon-accent" })} Browsing as guest <span class="chip">${shortId(visitorId)}</span> — everything you do here is saved and private to this browser.
    <a href="/register">${icon("key", { size: 14 })} Register</a> to find it again from another device, or <a href="/login">log in</a> to an existing account.</p>`;
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
    `<h1>${icon("car", { size: 28 })} Inspections</h1>
     ${accountBanner(db, visitorId)}
     <p><a class="btn-link" href="/inspections/new">${icon("car", { size: 16 })} New inspection</a></p>
     <h2>${icon("clipboard", { size: 15 })} Garage</h2>
     ${
       inspections.length === 0
         ? '<div class="card"><p class="empty">No inspections yet. Start your first walk-around.</p></div>'
         : `<div class="table-wrap"><table><thead><tr><th>Vehicle</th><th>Year</th><th>Odometer</th><th>Created</th></tr></thead><tbody>${rows}</tbody></table></div>`
     }`,
  );
}

function registerFormPage(error?: string): string {
  return page(
    "Register",
    `<h1>${icon("key", { size: 26 })} Register</h1>
     <p class="lede">Turns this browser's guest data into an account you can log into from anywhere. Everything you've already recorded as a guest comes with you.</p>
     ${error ? `<div class="card" style="border-color: var(--high);"><p style="color: var(--high); margin: 0;">${escapeHtml(error)}</p></div>` : ""}
     <form method="post" action="/register">
       <label for="username">Username</label>
       <input id="username" name="username" required autofocus minlength="3" maxlength="32" pattern="[a-zA-Z0-9_-]+" />
       <label for="password">Password</label>
       <input id="password" name="password" type="password" required minlength="8" />
       <button type="submit">${icon("key", { size: 16 })} Create account</button>
     </form>
     <p class="lede" style="margin-top: 1rem;">Already have an account? <a href="/login">Log in</a>.</p>`,
  );
}

function loginFormPage(error?: string): string {
  return page(
    "Log in",
    `<h1>${icon("user", { size: 26 })} Log in</h1>
     <p class="lede">Switches this browser to an existing account. Your guest data stays right where it is until you register it.</p>
     ${error ? `<div class="card" style="border-color: var(--high);"><p style="color: var(--high); margin: 0;">${escapeHtml(error)}</p></div>` : ""}
     <form method="post" action="/login">
       <label for="username">Username</label>
       <input id="username" name="username" required autofocus />
       <label for="password">Password</label>
       <input id="password" name="password" type="password" required />
       <button type="submit">${icon("user", { size: 16 })} Log in</button>
     </form>
     <p class="lede" style="margin-top: 1rem;">No account yet? <a href="/register">Register</a> — or keep using CarCheck as a guest.</p>`,
  );
}

function newInspectionFormPage(): string {
  return page(
    "New inspection",
    `<h1>${icon("car", { size: 26 })} New inspection</h1>
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
       <button type="submit">${icon("bolt", { size: 16 })} Start inspection</button>
     </form>`,
  );
}

function findingRowHtml(
  db: DatabaseSync,
  f: { id: string; category: string; description: string; severity: Severity; created_at: string },
): string {
  const photoCount = listPhotoMeta(db, f.id).length;
  return `<tr>
        <td><a href="/findings/${f.id}">${escapeHtml(f.category)}</a></td>
        <td>${escapeHtml(f.description)}</td>
        <td><span class="badge severity-${f.severity}">${f.severity}</span></td>
        <td>${photoCount > 0 ? `${icon("camera", { size: 14, class: "icon-accent" })} ${photoCount}` : "—"}</td>
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
  const findingRows = findings.map((f) => findingRowHtml(db, f)).join("");
  const severityOptions = SEVERITIES.map((s) => `<option value="${s}">${s}</option>`).join("");
  const highCount = findings.filter((f) => f.severity === "high").length;
  const mediumCount = findings.filter((f) => f.severity === "medium").length;
  const lowCount = findings.filter((f) => f.severity === "low").length;

  return page(
    `${inspection.make} ${inspection.model}`,
    `<h1>${icon("car", { size: 26 })} ${escapeHtml(inspection.make)} ${escapeHtml(inspection.model)} <span style="color: var(--text-muted); font-weight: 600;">'${inspection.year}</span></h1>
     <p class="lede"><span class="live-dot"></span>live · recorded ${new Date(inspection.created_at).toLocaleString()}</p>
     <div class="card">
       <div class="stat-row">
         <div class="stat"><div class="label">Odometer</div><div class="value">${inspection.odometer.toLocaleString()} km</div></div>
         <div class="stat"><div class="label">${icon("bolt", { size: 12 })} High</div><div class="value" style="color: var(--high);">${highCount}</div></div>
         <div class="stat"><div class="label">${icon("wrench", { size: 12 })} Medium</div><div class="value" style="color: var(--medium);">${mediumCount}</div></div>
         <div class="stat"><div class="label">${icon("shield", { size: 12 })} Low</div><div class="value" style="color: var(--low);">${lowCount}</div></div>
       </div>
     </div>
     <h2>${icon("clipboard", { size: 15 })} Findings</h2>
     <div class="table-wrap">
       <table id="findings-table"><thead><tr><th>Category</th><th>Description</th><th>Severity</th><th>Photos</th><th>Recorded</th></tr></thead>
         <tbody id="findings-body">${findingRows}</tbody></table>
     </div>
     <p id="findings-empty" class="empty" ${findings.length === 0 ? "" : "hidden"}>No findings recorded yet.</p>
     <fieldset>
       <legend>${icon("wrench", { size: 13 })} Add a finding</legend>
       <form method="post" action="/inspections/${inspection.id}/findings">
         <label for="category">Category</label>
         <input id="category" name="category" placeholder="tyre, oil leak, body, OBD code..." required />
         <label for="description">Description</label>
         <input id="description" name="description" required />
         <label for="severity">Severity</label>
         <select id="severity" name="severity">${severityOptions}</select>
         <button type="submit">${icon("bolt", { size: 16 })} Log finding</button>
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

// A finding's owner is reached by one hop: finding -> inspection -> owner_id.
// There's no owner_id on findings directly, so every finding-scoped route
// (view, upload, download) re-derives it through getInspection the same way
// the inspection routes do, rather than trusting a second, separately-synced
// copy of ownership.
function findingOwner(db: DatabaseSync, findingId: string): { finding: Finding; ownerId: string } | undefined {
  const finding = getFinding(db, findingId);
  if (!finding) return undefined;
  const inspection = getInspection(db, finding.inspection_id);
  if (!inspection) return undefined;
  return { finding, ownerId: inspection.owner_id };
}

function findingDetailPage(db: DatabaseSync, findingId: string, visitorId: string): string | undefined {
  const owned = findingOwner(db, findingId);
  if (!owned || owned.ownerId !== visitorId) return undefined;
  const finding = owned.finding;
  const photos = listPhotoMeta(db, findingId);
  const atLimit = photos.length >= MAX_PHOTOS_PER_FINDING;

  const gallery = photos
    .map(
      (p) => `<figure style="margin: 0; display: inline-block; width: 11rem; vertical-align: top; margin: 0 0.75rem 0.75rem 0;">
        <img src="/photos/${p.id}" alt="${escapeHtml(p.caption || finding.category)}" style="width: 100%; aspect-ratio: 1; object-fit: cover; border-radius: 8px; border: 1px solid var(--border); display: block;" />
        ${p.caption ? `<figcaption style="font-size: 0.78rem; color: var(--text-muted); margin-top: 0.3rem;">${escapeHtml(p.caption)}</figcaption>` : ""}
      </figure>`,
    )
    .join("");

  return page(
    `${finding.category} — finding`,
    `<h1>${icon("wrench", { size: 26 })} ${escapeHtml(finding.category)}</h1>
     <p class="lede"><span class="badge severity-${finding.severity}">${finding.severity}</span>&nbsp;·&nbsp;${escapeHtml(finding.description)}</p>
     <p><a href="/inspections/${finding.inspection_id}">&larr; back to inspection</a></p>
     <h2>${icon("camera", { size: 15 })} Photos (${photos.length}/${MAX_PHOTOS_PER_FINDING})</h2>
     ${photos.length === 0 ? '<div class="card"><p class="empty">No photos yet.</p></div>' : `<div class="card">${gallery}</div>`}
     ${
       atLimit
         ? `<div class="card"><p class="empty">This finding has its ${MAX_PHOTOS_PER_FINDING} photos — that's the cap. Start a new finding for more evidence.</p></div>`
         : `<fieldset>
       <legend>${icon("camera", { size: 13 })} Add photos</legend>
       <form method="post" action="/findings/${finding.id}/photos" enctype="multipart/form-data">
         <label for="photos">Photos (up to ${MAX_PHOTOS_PER_FINDING - photos.length} more, JPEG/PNG/WebP/GIF)</label>
         <input id="photos" name="photos" type="file" accept="image/jpeg,image/png,image/webp,image/gif" multiple required />
         <label for="caption">Caption (applies to all photos in this upload)</label>
         <input id="caption" name="caption" placeholder="e.g. close-up of the crack" />
         <button type="submit">${icon("camera", { size: 16 })} Upload</button>
       </form>
     </fieldset>`
     }`,
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
    publishFindingAdded(inspectionId, findingRowHtml(db, finding));
    return redirect(res, `/inspections/${inspectionId}`);
  }

  const findingDetailMatch = pathname.match(/^\/findings\/([^/]+)$/);
  if (method === "GET" && findingDetailMatch) {
    const html = findingDetailPage(db, findingDetailMatch[1], visitorId);
    return html ? send(res, 200, html) : notFound(res);
  }

  const photoUploadMatch = pathname.match(/^\/findings\/([^/]+)\/photos$/);
  if (method === "POST" && photoUploadMatch) {
    const findingId = photoUploadMatch[1];
    const owned = findingOwner(db, findingId);
    // Same ownership rule as every other mutation: a finding that isn't
    // yours (or doesn't exist) 404s rather than confirming it exists.
    if (!owned || owned.ownerId !== visitorId) return notFound(res);

    const boundary = parseContentTypeBoundary(req.headers["content-type"]);
    if (!boundary) return send(res, 400, page("Bad request", "<h1>Bad request</h1><p>Expected a multipart photo upload.</p>"));

    let raw: Buffer;
    try {
      raw = await readRawBody(req, MAX_UPLOAD_BYTES);
    } catch {
      return send(
        res,
        413,
        page("Too large", `<h1>Too large</h1><p>That upload is over the ${Math.floor(MAX_UPLOAD_BYTES / 1024 / 1024)} MB limit.</p>`),
      );
    }
    const { fields, files } = parseMultipart(raw, boundary);
    const caption = fields.caption ?? "";

    let uploaded = 0;
    for (const file of files) {
      if (file.fieldName !== "photos") continue;
      if (!ALLOWED_PHOTO_TYPES.has(file.contentType)) continue;
      if (file.data.length > MAX_PHOTO_BYTES) continue;
      const photo = addPhoto(db, {
        finding_id: findingId,
        caption,
        content_type: file.contentType,
        data: file.data,
      });
      if (photo) uploaded++;
      else break; // hit the 9-per-finding cap — stop silently accepting more
    }

    if (uploaded > 0) {
      logActivity(db, {
        actor_id: visitorId,
        action: "add_photos",
        inspection_id: owned.finding.inspection_id,
        detail: `${uploaded} photo(s) on ${owned.finding.category}`,
      });
    }
    return redirect(res, `/findings/${findingId}`);
  }

  const photoMatch = pathname.match(/^\/photos\/([^/]+)$/);
  if (method === "GET" && photoMatch) {
    const photo = getPhoto(db, photoMatch[1]);
    if (!photo) return notFound(res);
    const owned = findingOwner(db, photo.finding_id);
    // A photo is only ever served to the finding's (and so inspection's)
    // owner — the img tag's src is a plain URL, but it still goes through
    // the same ownership check every other per-owner resource does.
    if (!owned || owned.ownerId !== visitorId) return notFound(res);
    res.writeHead(200, { "content-type": photo.content_type, "cache-control": "private, max-age=31536000" });
    res.end(Buffer.from(photo.data));
    return;
  }

  if (method === "GET" && pathname === "/register") {
    return send(res, 200, registerFormPage());
  }

  if (method === "POST" && pathname === "/register") {
    const form = parseForm(await readBody(req));
    const username = (form.username ?? "").trim();
    const password = form.password ?? "";
    if (!/^[a-zA-Z0-9_-]{3,32}$/.test(username)) {
      return send(res, 400, registerFormPage("Username must be 3-32 characters: letters, digits, _ or -."));
    }
    if (password.length < 8) {
      return send(res, 400, registerFormPage("Password must be at least 8 characters."));
    }
    if (getAccountByUsername(db, username)) {
      return send(res, 409, registerFormPage("That username is taken."));
    }
    // The account's id IS this browser's current guest id — see auth.ts —
    // so every inspection already recorded as this visitor is already
    // "theirs" with nothing to migrate.
    registerAccount(db, { id: visitorId, username, password });
    logActivity(db, { actor_id: visitorId, action: "register", inspection_id: null, detail: username });
    return redirect(res, "/");
  }

  if (method === "GET" && pathname === "/login") {
    return send(res, 200, loginFormPage());
  }

  if (method === "POST" && pathname === "/login") {
    const form = parseForm(await readBody(req));
    const account = getAccountByUsername(db, form.username ?? "");
    if (!account || !verifyPassword(form.password ?? "", account.password_hash)) {
      return send(res, 401, loginFormPage("Wrong username or password."));
    }
    setVisitorId(res, account.id);
    logActivity(db, { actor_id: account.id, action: "login", inspection_id: null, detail: account.username });
    return redirect(res, "/");
  }

  if (method === "GET" && pathname === "/logout") {
    // Logging out just swaps the cookie to a fresh guest id — the account's
    // data isn't touched, and the old cookie value (the account id) is simply
    // no longer what this browser sends.
    setVisitorId(res, randomUUID());
    return redirect(res, "/");
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
