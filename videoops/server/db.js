import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const store = { db: null };

const SCHEMA = `
CREATE TABLE IF NOT EXISTS team_members (
  id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, email TEXT NOT NULL, role TEXT DEFAULT 'AI Video Editor',
  enabled INTEGER DEFAULT 1, availability TEXT DEFAULT 'available', leave_until TEXT, max_active INTEGER,
  prefs TEXT DEFAULT '{}', is_owner INTEGER DEFAULT 0, color TEXT, last_assigned_at TEXT, created_at TEXT
);
CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT, code TEXT, external_key TEXT UNIQUE, fingerprint TEXT,
  month TEXT, name TEXT NOT NULL, brand TEXT, type TEXT, brief TEXT, duration_sec INTEGER, deadline TEXT,
  priority TEXT DEFAULT 'Medium', status TEXT DEFAULT 'New Brief Received',
  assignee_id INTEGER REFERENCES team_members(id), assign_mode TEXT DEFAULT 'auto', assignee_raw TEXT,
  brief_received_at TEXT, created_at TEXT, updated_at TEXT, completed_at TEXT,
  sheet_tab TEXT, sheet_row INTEGER, sheet_gid TEXT, links TEXT DEFAULT '[]', product_info TEXT, extra TEXT DEFAULT '{}',
  sheet_snapshot TEXT, flags TEXT DEFAULT '[]', notes TEXT, removed_from_sheet INTEGER DEFAULT 0, auto_reason TEXT
);
CREATE INDEX IF NOT EXISTS idx_projects_month ON projects(month);
CREATE INDEX IF NOT EXISTS idx_projects_assignee ON projects(assignee_id);
CREATE INDEX IF NOT EXISTS idx_projects_fp ON projects(fingerprint);
CREATE TABLE IF NOT EXISTS assignments (
  id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER NOT NULL, from_member_id INTEGER, to_member_id INTEGER,
  mode TEXT, reason TEXT, actor TEXT, created_at TEXT, emailed INTEGER DEFAULT 0
);
CREATE TABLE IF NOT EXISTS changes (
  id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER NOT NULL, field TEXT, label TEXT, old_value TEXT, new_value TEXT,
  source TEXT, applied INTEGER DEFAULT 1, note TEXT, sync_run_id INTEGER, created_at TEXT
);
CREATE TABLE IF NOT EXISTS activity (
  id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT, kind TEXT, actor TEXT, project_id INTEGER, message TEXT, meta TEXT
);
CREATE INDEX IF NOT EXISTS idx_activity_project ON activity(project_id);
CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT, type TEXT, severity TEXT DEFAULT 'info', title TEXT, body TEXT,
  project_id INTEGER, meta TEXT, read INTEGER DEFAULT 0, created_at TEXT
);
CREATE TABLE IF NOT EXISTS emails (
  id INTEGER PRIMARY KEY AUTOINCREMENT, to_addr TEXT, to_name TEXT, subject TEXT, html TEXT, text TEXT, kind TEXT,
  status TEXT, error TEXT, project_id INTEGER, provider_id TEXT, created_at TEXT
);
CREATE TABLE IF NOT EXISTS sync_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT, trigger TEXT, status TEXT, started_at TEXT, finished_at TEXT, duration_ms INTEGER,
  rows_seen INTEGER DEFAULT 0, created INTEGER DEFAULT 0, updated INTEGER DEFAULT 0, unchanged INTEGER DEFAULT 0,
  flagged INTEGER DEFAULT 0, assigned INTEGER DEFAULT 0, emails INTEGER DEFAULT 0, changes INTEGER DEFAULT 0,
  removed INTEGER DEFAULT 0, duplicates INTEGER DEFAULT 0, error TEXT, snapshot_hash TEXT, detail TEXT
);
CREATE TABLE IF NOT EXISTS comments (
  id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER NOT NULL, author TEXT, body TEXT, created_at TEXT
);
CREATE TABLE IF NOT EXISTS settings ( key TEXT PRIMARY KEY, value TEXT );
CREATE TABLE IF NOT EXISTS months ( key TEXT PRIMARY KEY, label TEXT, created_at TEXT, source TEXT );
CREATE TABLE IF NOT EXISTS reminders ( project_id INTEGER, kind TEXT, day TEXT, created_at TEXT, PRIMARY KEY (project_id, kind, day) );
CREATE TABLE IF NOT EXISTS demo_sheet ( tab TEXT, row_number INTEGER, data TEXT, PRIMARY KEY (tab, row_number) );
CREATE TABLE IF NOT EXISTS demo_tabs ( name TEXT PRIMARY KEY, gid TEXT, position INTEGER );
CREATE TABLE IF NOT EXISTS sessions ( id TEXT PRIMARY KEY, email TEXT, name TEXT, created_at TEXT, expires_at TEXT );
`;

export function openDb(file = process.env.DB_PATH || path.join(process.cwd(), 'data', 'videoops.db')) {
  if (store.db) { try { store.db.close(); } catch { /* already closed */ } }
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
  store.db = new DatabaseSync(file);
  store.db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = OFF;');
  store.db.exec(SCHEMA);
  migrate();
  return store.db;
}

// additive migrations so an existing data/videoops.db keeps working after upgrades
function migrate() {
  const cols = (t) => store.db.prepare(`PRAGMA table_info(${t})`).all().map((c) => c.name);
  const add = (t, c, def) => { if (!cols(t).includes(c)) store.db.exec(`ALTER TABLE ${t} ADD COLUMN ${c} ${def}`); };
  add('projects', 'assets', 'TEXT');            // raw "2S, 2V, 1C, 1G"
  add('projects', 'deliverables', 'INTEGER');   // number of items this team must make (e.g. videos + GIFs)
  add('projects', 'collaborators', "TEXT DEFAULT '[]'"); // extra teammates named in the sheet's Owner cell
  add('sync_runs', 'skipped', 'INTEGER DEFAULT 0');
}

const norm = (params) => params.map((p) => (p === undefined ? null : typeof p === 'boolean' ? (p ? 1 : 0) : p));
export const run = (sql, ...p) => store.db.prepare(sql).run(...norm(p));
export const get = (sql, ...p) => store.db.prepare(sql).get(...norm(p)) || null;
export const all = (sql, ...p) => store.db.prepare(sql).all(...norm(p)).map((r) => ({ ...r }));
export const exec = (sql) => store.db.exec(sql);
export function tx(fn) {
  store.db.exec('BEGIN');
  try { const r = fn(); store.db.exec('COMMIT'); return r; } catch (e) { store.db.exec('ROLLBACK'); throw e; }
}
export function insert(table, row) {
  const keys = Object.keys(row);
  const r = run(`INSERT INTO ${table} (${keys.join(',')}) VALUES (${keys.map(() => '?').join(',')})`, ...keys.map((k) => row[k]));
  return Number(r.lastInsertRowid);
}
export function update(table, id, patch) {
  const keys = Object.keys(patch);
  if (!keys.length) return;
  run(`UPDATE ${table} SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`, ...keys.map((k) => patch[k]), id);
}
