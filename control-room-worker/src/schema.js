// D1 tables for Control Room V2 (TEST). Safe to run many times ("IF NOT EXISTS").
// The Worker runs this itself after a valid login, so no console or terminal step is needed.
// Rules live in the database too, not only in the code:
//  - only allowed values for area / status / priority / risk
//  - an approval can be decided once, and its question/risk/task can never be changed
//  - approvals and activity can never be deleted; activity can never be edited

export const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS tasks (
    id         TEXT PRIMARY KEY,
    title      TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 200),
    area       TEXT NOT NULL CHECK (area IN ('dev','marketing','analytics','support','marketplace')),
    status     TEXT NOT NULL DEFAULT 'todo'   CHECK (status IN ('todo','doing','waiting','done')),
    priority   TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('high','medium','low')),
    notes      TEXT NOT NULL DEFAULT ''       CHECK (length(notes) <= 2000),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    created_by TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS approvals (
    id           TEXT PRIMARY KEY,
    task_id      TEXT NOT NULL REFERENCES tasks(id),
    ask          TEXT NOT NULL CHECK (length(ask) BETWEEN 1 AND 300),
    risk         TEXT NOT NULL CHECK (risk IN ('low','medium','high')),
    status       TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
    requested_at TEXT NOT NULL,
    requested_by TEXT NOT NULL,
    decided_at   TEXT,
    decided_by   TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS activity (
    id     TEXT PRIMARY KEY,
    at     TEXT NOT NULL,
    actor  TEXT NOT NULL,
    area   TEXT,
    kind   TEXT NOT NULL,
    ref_id TEXT,
    text   TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS tasks_status   ON tasks(status)`,
  `CREATE INDEX IF NOT EXISTS approvals_stat ON approvals(status)`,
  `CREATE INDEX IF NOT EXISTS activity_at    ON activity(at)`,

  `CREATE TRIGGER IF NOT EXISTS approvals_decide_once BEFORE UPDATE ON approvals
     WHEN OLD.status <> 'pending' OR NEW.ask <> OLD.ask OR NEW.risk <> OLD.risk OR NEW.task_id <> OLD.task_id
       OR NEW.requested_at <> OLD.requested_at OR NEW.requested_by <> OLD.requested_by
     BEGIN SELECT RAISE(ABORT, 'approval is locked'); END`,
  `CREATE TRIGGER IF NOT EXISTS approvals_no_delete BEFORE DELETE ON approvals
     BEGIN SELECT RAISE(ABORT, 'approvals cannot be deleted'); END`,
  `CREATE TRIGGER IF NOT EXISTS activity_no_edit BEFORE UPDATE ON activity
     BEGIN SELECT RAISE(ABORT, 'activity cannot be edited'); END`,
  `CREATE TRIGGER IF NOT EXISTS activity_no_delete BEFORE DELETE ON activity
     BEGIN SELECT RAISE(ABORT, 'activity cannot be deleted'); END`,
];

let ready = false;
export async function ensureSchema(db) {
  if (ready) return;
  await db.batch(SCHEMA.map((sql) => db.prepare(sql)));
  ready = true;
}
