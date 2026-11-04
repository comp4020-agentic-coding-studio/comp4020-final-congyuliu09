import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";

export interface Account {
  id: string;
  username: string;
  password_hash: string;
  created_at: string;
}

// scrypt is built into node:crypto — no bcrypt/argon2 dependency needed,
// consistent with the project's zero-runtime-dependency stack decision
// (PROCESS.md). Salt is stored alongside the hash, "salt:hash" in hex, since
// there's no separate column for it and this is the one place that needs it.
export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const derived = scryptSync(password, salt, 64);
  return `${salt.toString("hex")}:${derived.toString("hex")}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [saltHex, hashHex] = stored.split(":");
  if (!saltHex || !hashHex) return false;
  const salt = Buffer.from(saltHex, "hex");
  const expected = Buffer.from(hashHex, "hex");
  const actual = scryptSync(password, salt, expected.length);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function ensureAccountsTable(db: DatabaseSync): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS accounts (
      id            TEXT PRIMARY KEY,
      username      TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      created_at    TEXT NOT NULL
    );
  `);
}

export function getAccountByUsername(db: DatabaseSync, username: string): Account | undefined {
  return db.prepare("SELECT * FROM accounts WHERE username = ?").get(username) as Account | undefined;
}

export function getAccountById(db: DatabaseSync, id: string): Account | undefined {
  return db.prepare("SELECT * FROM accounts WHERE id = ?").get(id) as Account | undefined;
}

// Registering doesn't create a new identity — it promotes the visitor id the
// browser already has into a durable, loggable-in-again account, so every
// inspection the guest already made (scoped to that same id in inspections.
// owner_id) is already "theirs" with no migration needed. The account's id
// IS the pre-existing visitor id; only a username/password get attached to
// it. This is why registration can't collide on id, only on username.
export function registerAccount(
  db: DatabaseSync,
  fields: { id: string; username: string; password: string },
): Account {
  const account: Account = {
    id: fields.id,
    username: fields.username,
    password_hash: hashPassword(fields.password),
    created_at: new Date().toISOString(),
  };
  db.prepare("INSERT INTO accounts (id, username, password_hash, created_at) VALUES (?, ?, ?, ?)").run(
    account.id,
    account.username,
    account.password_hash,
    account.created_at,
  );
  return account;
}
