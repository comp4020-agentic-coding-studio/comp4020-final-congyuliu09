import { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";

export type Severity = "low" | "medium" | "high";

export interface Inspection {
  id: string;
  make: string;
  model: string;
  year: number;
  odometer: number;
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

export function openDb(path: string): DatabaseSync {
  const db = new DatabaseSync(path);
  db.exec(`
    CREATE TABLE IF NOT EXISTS inspections (
      id         TEXT PRIMARY KEY,
      make       TEXT NOT NULL,
      model      TEXT NOT NULL,
      year       INTEGER NOT NULL,
      odometer   INTEGER NOT NULL,
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
  `);
  return db;
}

export function createInspection(
  db: DatabaseSync,
  fields: { make: string; model: string; year: number; odometer: number },
): Inspection {
  const inspection: Inspection = {
    id: randomUUID(),
    ...fields,
    created_at: new Date().toISOString(),
  };
  db.prepare(
    "INSERT INTO inspections (id, make, model, year, odometer, created_at) VALUES (?, ?, ?, ?, ?, ?)",
  ).run(
    inspection.id,
    inspection.make,
    inspection.model,
    inspection.year,
    inspection.odometer,
    inspection.created_at,
  );
  return inspection;
}

export function listInspections(db: DatabaseSync): Inspection[] {
  return db.prepare("SELECT * FROM inspections ORDER BY created_at DESC").all() as unknown as Inspection[];
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
