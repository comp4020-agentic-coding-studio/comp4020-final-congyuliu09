import { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";

export type Severity = "low" | "medium" | "high";

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
  `);

  // Deployed volumes predate owner_id (crit 8 shipped without it); add it to
  // whatever's already on disk rather than losing the data under it.
  const inspectionCols = db.prepare("PRAGMA table_info(inspections)").all() as { name: string }[];
  if (!inspectionCols.some((c) => c.name === "owner_id")) {
    db.exec("ALTER TABLE inspections ADD COLUMN owner_id TEXT NOT NULL DEFAULT ''");
  }

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
