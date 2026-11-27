// Demo workspace built from a REAL sheet (server/fixtures/december-asks.json — "December'26 Asks 1P & Perf").
// History is produced by running the real engine against a simulated copy of that sheet on a backdated clock,
// so notifications, emails, change history and assignment history are genuine output, not hand-written fixtures.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { all, get, run, insert, update, openDb } from './db.js';
import { getSettings, saveSettings, resetSettingsCache, setKV, DEFAULTS } from './settings.js';
import { clock, localDate, nowIso } from './clock.js';
import { addDays, monthLabel, clone } from './util.js';
import * as S from './integrations/sheetSource.js';
import { mapHeaders } from './engine/mapper.js';
import { runSync } from './engine/sync.js';
import * as P from './services/projects.js';
import { runReminders } from './services/reminders.js';
import { log } from './services/notify.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'december-asks.json'), 'utf8'));
const TABLES = ['assignments', 'changes', 'activity', 'notifications', 'emails', 'sync_runs', 'comments', 'months', 'reminders', 'demo_sheet', 'demo_tabs', 'projects', 'team_members'];
const COLORS = ['#7aa2ff', '#3dd6c6', '#f08fc0', '#9b8cff', '#58d68d'];
const at = (daysAgo, h, mi = 0) => { const d = new Date(); d.setDate(d.getDate() - daysAgo); d.setHours(h, mi, 0, 0); return d; };

// The video team. Mukul is the project manager AND takes projects like everyone else (his row is the "owner" row).
export const OWNER = { name: 'Mukul Chaudhary', email: 'mukul.chaudhary@curefit.com' };
const TEAM = [
  { name: 'Shwetank', email: 'shwetank@curefit.com' },
  { name: 'Enbarasan E', email: 'enbarasan.e@curefit.com' },
  { name: 'Gagan Solanki', email: 'gagan.solanki@curefit.com' },
  { name: 'Antony T J', email: 'antony.tj@curefit.com' },
];
// The last 15 real asks (sheet rows 36-50) are held back and "arrive" during the live demo.
const HELD_ROWS = new Set(Array.from({ length: 15 }, (_, i) => 36 + i));
const H = FIXTURE.headers;
const FIELD_HEADER = (() => { const m = {}; for (const [h, f] of Object.entries(mapHeaders(H))) if (f && !m[f]) m[f] = h; return m; })();
const rowFor = (f) => ({ ...Object.fromEntries(H.map((h) => [h, ''])), ...Object.fromEntries(Object.entries(f).map(([k, v]) => [FIELD_HEADER[k], v])) });

// extra asks used once the held-back rows have all arrived
const EXTRA = [
  { name: 'Kettlebell Set', brand: 'Accesories', type: 'Batch Produce', assets: '2S, 1V, 1C', deadline: '29/12/26', 'brief:messaging': 'Position the cast-iron kettlebell range as the simplest way to build strength at home.', 'brief:imagery': 'Close-up grip and swing shots, home-gym setting, bold on-screen weights.' },
  { name: 'Resistance Bands', brand: 'Accesories', type: 'Batch Produce', assets: '1S, 1V, 1G', deadline: '30/12/26', 'brief:messaging': 'Show the four resistance levels and how one set replaces a gym rack.', 'brief:imagery': 'Colour-coded bands, quick loopable exercise GIF.' },
  { name: 'Skipping Rope', brand: 'Accesories', type: 'Batch Produce', assets: '2S, 1V, 1C', deadline: '31/12/26', 'brief:messaging': 'Fast, portable cardio: the speed rope that fits in a pocket.', 'brief:imagery': 'Slow-motion rope macro, tricks montage.' },
];

export function wipe() {
  for (const t of TABLES) run(`DELETE FROM ${t}`);
  run(`DELETE FROM sqlite_sequence`);
  run(`DELETE FROM settings WHERE key IN ('last_snapshot_hash','last_sync_at','dupes_seen','demo_headers','demo_title')`);
}

function ensureOwner({ takesProjects = false } = {}) {
  const w = getSettings().workspace;
  insert('team_members', { name: w.owner_name, email: w.owner_email, role: 'Project Manager', enabled: takesProjects ? 1 : 0, availability: 'available', prefs: '{}', is_owner: 1, color: '#ffb454', created_at: nowIso() });
}

export async function resetWorkspace({ demo = true } = {}) {
  clock.reset();
  const keep = getSettings();
  const keepIntegrations = keep.integrations, keepWorkspace = keep.workspace, keepAssets = keep.assets;
  wipe();
  run(`DELETE FROM settings WHERE key='app'`);
  resetSettingsCache();
  saveSettings({ integrations: demo ? { ...clone(DEFAULTS.integrations) } : keepIntegrations, email: demo ? { mode: 'demo' } : {}, ...(demo ? {} : { workspace: keepWorkspace, assets: keepAssets }) });
  if (demo) await seedDemo(); else ensureOwner();
}

export async function seedDemo() {
  const t = localDate(new Date());
  saveSettings({ workspace: { name: 'Cult Video Ops', owner_name: OWNER.name, owner_email: OWNER.email }, monitor: { autosync_on_sheet_edit: true } });
  ensureOwner({ takesProjects: true });
  TEAM.forEach((m, i) => insert('team_members', { name: m.name, email: m.email, role: 'AI Video Editor', enabled: 1, availability: 'available', prefs: '{}', is_owner: 0, color: COLORS[i], created_at: at(10, 9, 0).toISOString() }));
  const byName = (n) => get('SELECT id FROM team_members WHERE name=?', n).id;
  const pid = (name) => get('SELECT id FROM projects WHERE name=?', name)?.id;

  // ---- the (simulated copy of the) real sheet
  S.setDemoHeaders(H); setKV('demo_title', FIXTURE.title);
  const tab = FIXTURE.tab;
  S.ensureDemoTab(tab, FIXTURE.gid);
  for (const r of FIXTURE.rows) if (!HELD_ROWS.has(r.rowNumber)) S.demoPutRow(tab, r.rowNumber, r.values);
  const rowOf = (name) => all('SELECT * FROM demo_sheet WHERE tab=?', tab).find((r) => String(JSON.parse(r.data)[FIELD_HEADER.name]).trim() === name)?.row_number;
  const edit = (name, field, value) => S.demoSetCell(tab, rowOf(name), FIELD_HEADER[field], value);

  // 1) the December asks are imported (video / GIF rows only; statics-only & legend rows are ignored) --------
  clock.set(at(3, 10, 15));
  await runSync({ trigger: 'schedule' });

  // work starts on the earliest deadlines
  const progress = [
    ['WW Jackets (Women)', 'In Progress', 2, 11], ['Full Sleeves (Men & Women)', 'In Progress', 2, 12], ['WW Jackets (Men)', 'In Progress', 2, 14],
    ['Full Sleeves - WW (Men & Women)', 'Review', 1, 10], ['Trackpants & Joggers (Women)', 'In Progress', 2, 15], ['Tights', 'In Progress', 2, 16],
    ['WW Jackets (Plus)', 'In Progress', 1, 11], ['Trackpants & Joggers (Men)', 'Review', 1, 15],
  ];
  for (const [name, st, d, h] of progress) {
    clock.set(at(d + 0, h, 5)); await P.setStatus(pid(name), 'In Progress', { actor: 'teammate', quiet: true });
    if (st !== 'In Progress') { clock.set(at(0, h - 2, 20)); await P.setStatus(pid(name), st, { actor: 'teammate', quiet: true }); }
  }

  // 2) the sheet keeps changing — change detection builds the audit trail ---------------------------------
  clock.set(at(2, 11, 5));
  edit('FW NPD', 'revised', '18th Dec');
  await runSync({ trigger: 'schedule' });
  clock.set(at(1, 17, 20));
  edit('Tights', 'assets', '6S, 3V, 2C');            // one more video requested
  edit('Yoga Mat', 'revised', '11th Dec');           // internal deadline pulled in
  edit('T-Shirts (Women)', 'assignee', 'Shwetank');  // owner named in the sheet -> respected, project moves
  await runSync({ trigger: 'schedule' });

  // 3) the PM takes control ---------------------------------------------------------------------------------
  clock.set(at(1, 12, 10));
  await P.assignProject(pid('Pull Up Bar'), byName('Gagan Solanki'), { mode: 'manual', actor: 'you', reason: 'Gagan has the cleanest slot this week' });
  clock.set(at(1, 12, 25));
  await P.assignProject(pid('Prime - Walkpad'), get('SELECT id FROM team_members WHERE is_owner=1').id, { mode: 'self', actor: 'you', reason: 'I will edit this one personally' });
  clock.set(at(1, 12, 40));
  await P.assignProject(pid('FW EBO'), null, { mode: 'locked', actor: 'you', reason: 'Waiting on final NPD shoe details — hold from automation' });
  await P.setStatus(pid('FW EBO'), 'Pending Assignment', { actor: 'you', quiet: true });
  clock.set(at(0, 9, 30));
  edit('Pull Up Bar', 'assignee', 'Antony T J'); // locked by manual assignment: must be ignored
  await runSync({ trigger: 'schedule' });

  // 4) comments ------------------------------------------------------------------------------------------------
  const cm = (d, h, m, name, author, body) => { clock.set(at(d, h, m)); insert('comments', { project_id: pid(name), author, body, created_at: nowIso() }); log('comment', body, { actor: author, projectId: pid(name) }); };
  cm(1, 15, 10, 'WW Jackets (Women)', 'Shwetank', 'Rough cut of the 1V is ready for review — went with the question-led opener from the sheet.');
  cm(1, 18, 40, 'WW Jackets (Women)', OWNER.name, 'Looks good. Tighten the first 3s and add the fabric macro before the RTB card.');
  cm(0, 8, 50, 'Tights', 'Antony T J', 'Noted the 3rd video request from the sheet — starting on the squat-proof opacity cut.');

  // 5) today: monitor is live, reminders fire ----------------------------------------------------------------
  clock.set(new Date(Date.now() - 3 * 60000));
  await runSync({ trigger: 'schedule' });
  clock.reset();
  await runReminders();
  run(`UPDATE notifications SET read=1 WHERE created_at < ?`, new Date(Date.now() - 30 * 3600000).toISOString());
  void addDays; void monthLabel;
}

/** Demo button: "new asks are added to the sheet". Releases the held-back real rows; afterwards adds a few extra asks. */
export function addNextMonthBatch() {
  const tab = FIXTURE.tab;
  const have = new Set(all('SELECT row_number FROM demo_sheet WHERE tab=?', tab).map((r) => r.row_number));
  const held = FIXTURE.rows.filter((r) => HELD_ROWS.has(r.rowNumber) && !have.has(r.rowNumber));
  if (held.length) { held.forEach((r) => S.demoPutRow(tab, r.rowNumber, r.values)); return { tab, month: "December 2026", added: held.length }; }
  const names = new Set(all('SELECT data FROM demo_sheet WHERE tab=?', tab).map((r) => String(JSON.parse(r.data)[FIELD_HEADER.name]).trim()));
  const extra = EXTRA.filter((e) => !names.has(e.name)).slice(0, 3);
  extra.forEach((e) => S.demoAddRow(tab, rowFor(e)));
  return { tab, month: 'December 2026', added: extra.length };
}
export const demoFieldHeaders = () => FIELD_HEADER;

// CLI: node server/seed.js --reset
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  openDb();
  await resetWorkspace({ demo: true });
  console.log('Demo workspace seeded:', get('SELECT COUNT(*) n FROM projects').n, 'projects');
}
