import { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";
import { ensureAccountsTable } from "./auth.ts";

export type Severity = "low" | "medium" | "high";

export const MAX_PHOTOS_PER_FINDING = 9;

export interface Inspection {
  id: string;
  make: string;
  model: string;
  year: number;
  odometer: number;
  owner_id: string;
  created_at: string;
}

export interface Finding {
  id: string;
  inspection_id: string;
  category: string;
  description: string;
  severity: Severity;
  created_at: string;
}

export interface ActivityEntry {
  id: string;
  actor_id: string;
  action: string;
  inspection_id: string | null;
  detail: string;
  created_at: string;
}

export interface FindingPhoto {
  id: string;
  finding_id: string;
  caption: string;
  content_type: string;
  data: Uint8Array;
  created_at: string;
}

export interface FindingPhotoMeta {
  id: string;
  finding_id: string;
  caption: string;
  content_type: string;
  created_at: string;
}

export function openDb(path: string): DatabaseSync {
  const db = new DatabaseSync(path);
  db.exec(`
    CREATE TABLE IF NOT EXISTS inspections (
      id         TEXT PRIMARY KEY,
      make       TEXT NOT NULL,
      model      TEXT NOT NULL,
      year       INTEGER NOT NULL,
      odometer   INTEGER NOT NULL,
      owner_id   TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS findings (
      id            TEXT PRIMARY KEY,
      inspection_id TEXT NOT NULL REFERENCES inspections(id),
      category      TEXT NOT NULL,
      description   TEXT NOT NULL,
      severity      TEXT NOT NULL CHECK (severity IN ('low', 'medium', 'high')),
      created_at    TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS activity_log (
      id            TEXT PRIMARY KEY,
      actor_id      TEXT NOT NULL,
      action        TEXT NOT NULL,
      inspection_id TEXT,
      detail        TEXT NOT NULL,
      created_at    TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS finding_photos (
      id           TEXT PRIMARY KEY,
      finding_id   TEXT NOT NULL REFERENCES findings(id),
      caption      TEXT NOT NULL,
      content_type TEXT NOT NULL,
      data         BLOB NOT NULL,
      created_at   TEXT NOT NULL
    );
  `);

  // Deployed volumes predate owner_id (crit 8 shipped without it); add it to
  // whatever's already on disk rather than losing the data under it.
  const inspectionCols = db.prepare("PRAGMA table_info(inspections)").all() as { name: string }[];
  if (!inspectionCols.some((c) => c.name === "owner_id")) {
    db.exec("ALTER TABLE inspections ADD COLUMN owner_id TEXT NOT NULL DEFAULT ''");
  }

  ensureAccountsTable(db);

  return db;
}

export function createInspection(
  db: DatabaseSync,
  fields: { make: string; model: string; year: number; odometer: number; owner_id: string },
): Inspection {
  const inspection: Inspection = {
    id: randomUUID(),
    ...fields,
    created_at: new Date().toISOString(),
  };
  db.prepare(
    "INSERT INTO inspections (id, make, model, year, odometer, owner_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
  ).run(
    inspection.id,
    inspection.make,
    inspection.model,
    inspection.year,
    inspection.odometer,
    inspection.owner_id,
    inspection.created_at,
  );
  return inspection;
}

export function listInspections(db: DatabaseSync, ownerId: string): Inspection[] {
  return db
    .prepare("SELECT * FROM inspections WHERE owner_id = ? ORDER BY created_at DESC")
    .all(ownerId) as unknown as Inspection[];
}

export function getInspection(db: DatabaseSync, id: string): Inspection | undefined {
  return db.prepare("SELECT * FROM inspections WHERE id = ?").get(id) as Inspection | undefined;
}

export function listFindings(db: DatabaseSync, inspectionId: string): Finding[] {
  return db
    .prepare("SELECT * FROM findings WHERE inspection_id = ? ORDER BY created_at ASC")
    .all(inspectionId) as unknown as Finding[];
}

export function getFinding(db: DatabaseSync, id: string): Finding | undefined {
  return db.prepare("SELECT * FROM findings WHERE id = ?").get(id) as Finding | undefined;
}

export function addFinding(
  db: DatabaseSync,
  fields: { inspection_id: string; category: string; description: string; severity: Severity },
): Finding {
  const finding: Finding = {
    id: randomUUID(),
    ...fields,
    created_at: new Date().toISOString(),
  };
  db.prepare(
    "INSERT INTO findings (id, inspection_id, category, description, severity, created_at) VALUES (?, ?, ?, ?, ?, ?)",
  ).run(
    finding.id,
    finding.inspection_id,
    finding.category,
    finding.description,
    finding.severity,
    finding.created_at,
  );
  return finding;
}

export function countPhotos(db: DatabaseSync, findingId: string): number {
  const row = db.prepare("SELECT COUNT(*) AS n FROM finding_photos WHERE finding_id = ?").get(findingId) as {
    n: number;
  };
  return row.n;
}

// The 9-photos-per-finding cap lives here, not just as a <input max> in the
// form: a client can send more in one request, or add a 10th in a second
// request after the form's own limit already let 9 through, so the server
// has to be the one place the limit is actually enforced.
export function addPhoto(
  db: DatabaseSync,
  fields: { finding_id: string; caption: string; content_type: string; data: Buffer },
): FindingPhoto | undefined {
  if (countPhotos(db, fields.finding_id) >= MAX_PHOTOS_PER_FINDING) return undefined;
  const photo: FindingPhoto = {
    id: randomUUID(),
    ...fields,
    created_at: new Date().toISOString(),
  };
  db.prepare(
    "INSERT INTO finding_photos (id, finding_id, caption, content_type, data, created_at) VALUES (?, ?, ?, ?, ?, ?)",
  ).run(photo.id, photo.finding_id, photo.caption, photo.content_type, photo.data, photo.created_at);
  return photo;
}

export function listPhotoMeta(db: DatabaseSync, findingId: string): FindingPhotoMeta[] {
  return db
    .prepare(
      "SELECT id, finding_id, caption, content_type, created_at FROM finding_photos WHERE finding_id = ? ORDER BY created_at ASC",
    )
    .all(findingId) as unknown as FindingPhotoMeta[];
}

export function getPhoto(db: DatabaseSync, id: string): FindingPhoto | undefined {
  return db.prepare("SELECT * FROM finding_photos WHERE id = ?").get(id) as FindingPhoto | undefined;
}

// Server-side record of who did what, independent of the in-memory process:
// written on every mutation, outlives a restart, and is what a crit's "narrate
// from the logs" demand reads from — never the UI.
export function logActivity(
  db: DatabaseSync,
  fields: { actor_id: string; action: string; inspection_id: string | null; detail: string },
): ActivityEntry {
  const entry: ActivityEntry = {
    id: randomUUID(),
    ...fields,
    created_at: new Date().toISOString(),
  };
  db.prepare(
    "INSERT INTO activity_log (id, actor_id, action, inspection_id, detail, created_at) VALUES (?, ?, ?, ?, ?, ?)",
  ).run(entry.id, entry.actor_id, entry.action, entry.inspection_id, entry.detail, entry.created_at);
  return entry;
}

export function listRecentActivity(db: DatabaseSync, limit = 200): ActivityEntry[] {
  return db
    .prepare("SELECT * FROM activity_log ORDER BY created_at DESC LIMIT ?")
    .all(limit) as unknown as ActivityEntry[];
}
