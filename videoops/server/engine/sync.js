// The sync pipeline: fetch sheet → parse → reconcile (create / update / detect changes / flag removals)
// → assignment workflow → notifications & emails → log everything.
import { all, get, run, insert, update } from '../db.js';
import { getSettings, getKV, setKV } from '../settings.js';
import { nowIso, today } from '../clock.js';
import { sha, fmtDate, fmtDuration, monthLabel } from '../util.js';
import { fetchSnapshot } from '../integrations/sheetSource.js';
import { parseSnapshot, fingerprintOf } from './mapper.js';
import { hydrate, allMembers, assignProject, autoAssignPending, getProject } from '../services/projects.js';
import { log, notify } from '../services/notify.js';
import { bus } from '../bus.js';
import * as T from '../services/emailTemplates.js';

const FIELDS = [
  { key: 'name', cfg: 'name', label: 'Project name', col: 'name' },
  { key: 'brand', cfg: 'brand', label: 'Brand / campaign', col: 'brand' },
  { key: 'type', cfg: 'type', label: 'Project type', col: 'type' },
  { key: 'brief', cfg: 'brief', label: 'Brief', col: 'brief' },
  { key: 'duration', cfg: 'duration', label: 'Video duration', col: 'duration_sec', show: (v) => (v ? fmtDuration(v) : '') },
  { key: 'deadline', cfg: 'deadline', label: 'Delivery date', col: 'deadline', show: (v) => (v ? fmtDate(v) : '') },
  { key: 'priority', cfg: 'priority', label: 'Priority', col: 'priority' },
  { key: 'month', cfg: 'month', label: 'Month', col: 'month', show: (v) => (v ? monthLabel(v) : '') },
  { key: 'product', cfg: 'product', label: 'Product information', col: 'product_info' },
  { key: 'assets', cfg: 'assets', label: 'Asset requirement', col: 'assets' },
  { key: 'links', cfg: 'links', label: 'Reference links', col: 'links', show: (v) => (v || []).join(', '), json: true },
  { key: 'status', cfg: 'status', label: 'Project status', col: 'status', special: true },
  { key: 'assignee', cfg: 'assignee', label: 'Assigned to', col: 'assignee_raw', special: true },
];

const snapOf = (rec) => ({ assets: rec.assets || '', name: rec.name, brand: rec.brand, type: rec.type, brief: rec.brief, duration: rec.duration, deadline: rec.deadline, priority: rec.priority, month: rec.month, product: rec.product, links: rec.links, status: rec.status, assignee: rec.assignee_raw, extra: rec.extra });

const normVal = (v, ws) => {
  if (Array.isArray(v)) return v.join(' ');
  if (v == null) return '';
  const s = String(v);
  return ws ? s.replace(/\s+/g, ' ').trim() : s.trim();
};

const wordRe = (w) => new RegExp(`(^|[^a-z0-9])${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![a-z0-9])`, 'i');

/**
 * Who does an "Owner" cell name? Handles one or several people, in any wording:
 * "Antony T J", "Enbarasan", "Mukul Chaudhary\nShwetank", "Enbarasan E Shwetank Adarsh Pandit".
 * Returns members in the order they appear (first = primary owner) and any left-over text that matched nobody.
 */
export function resolveMembers(raw, members) {
  const q = String(raw || '').trim();
  if (!q) return { matched: [], leftover: '' };
  const firstCount = {};
  for (const m of members) { const f = m.name.toLowerCase().split(/\s+/)[0]; firstCount[f] = (firstCount[f] || 0) + 1; }
  const hits = [];
  let rest = q.toLowerCase();
  for (const m of members) {
    const full = m.name.toLowerCase(), first = full.split(/\s+/)[0];
    const tries = [m.email.toLowerCase(), full, ...(firstCount[first] === 1 ? [first] : [])];
    for (const t of tries) {
      const mm = wordRe(t).exec(q.toLowerCase());
      if (mm) { hits.push({ m, idx: mm.index + mm[1].length, t }); break; }
    }
  }
  hits.sort((a, b) => a.idx - b.idx);
  for (const h of hits) rest = rest.replace(h.t, ' ');
  const leftover = rest.replace(/[\s,;&/+\n]+/g, ' ').replace(/\band\b/g, ' ').trim();
  // unambiguous prefix typed by hand ("rohan k") when nothing else matched
  if (!hits.length) {
    const f = members.filter((m) => m.name.toLowerCase().startsWith(q.toLowerCase()));
    if (f.length === 1) return { matched: [f[0]], leftover: '' };
  }
  return { matched: hits.map((h) => h.m), leftover };
}
export const resolveMember = (raw, members) => resolveMembers(raw, members).matched[0] || null;

/** Flags about the Owner cell itself (people we don't know). */
function ownerFlags(rec, members) {
  if (!rec.assignee_raw) return [];
  const { matched, leftover } = resolveMembers(rec.assignee_raw, members);
  if (!matched.length) return [{ code: 'unknown_assignee', label: `Unknown teammate "${rec.assignee_raw.replace(/\s+/g, ' ')}" — auto-assigned instead` }];
  if (leftover.length >= 3) return [{ code: 'unknown_coowner', label: `Unrecognised co-owner "${leftover}" (not on the team list)` }];
  return [];
}
const OWNER_FLAG_CODES = ['unknown_assignee', 'unknown_coowner'];

function diffRecord(prevSnap, rec, project, cfg) {
  const ws = cfg.ignore_whitespace;
  const nowSnap = snapOf(rec);
  const out = [];
  for (const f of FIELDS) {
    const a = prevSnap[f.key], b = nowSnap[f.key];
    if (normVal(a, ws) === normVal(b, ws)) continue;
    // a blank sheet cell for status/priority means "no instruction" rather than "cleared"
    const show = f.show || ((v) => (v == null ? '' : String(v)));
    out.push({ field: f.key, label: f.label, old_value: f.key === 'status' ? (project.status || '') : f.key === 'assignee' ? (a || '') : show(a), new_value: show(b), raw: b, prevRaw: a, def: f });
  }
  const keys = new Set([...Object.keys(prevSnap.extra || {}), ...Object.keys(nowSnap.extra || {})]);
  const dupLive = out.some((d) => d.field === 'deadline') && !rec.revisedDate;
  for (const k of keys) {
    if (dupLive && k === rec.liveKey) continue; // the 'Delivery date' change above already says it
    const a = prevSnap.extra?.[k] || '', b = nowSnap.extra?.[k] || '';
    if (normVal(a, ws) !== normVal(b, ws)) out.push({ field: `extra:${k}`, label: k, old_value: a, new_value: b, raw: b, prevRaw: a, def: { key: 'extra', cfg: 'extra' } });
  }
  return out;
}

let running = null;
export function syncInProgress() { return !!running; }
export async function runSync(opts = {}) {
  if (running) return running;
  running = doSync(opts).finally(() => { running = null; });
  return running;
}

async function doSync({ trigger = 'manual' } = {}) {
  const s = getSettings();
  const t0 = Date.now();
  const runId = insert('sync_runs', { trigger, status: 'running', started_at: nowIso() });
  const stats = { skipped: 0, rows_seen: 0, created: 0, updated: 0, unchanged: 0, flagged: 0, assigned: 0, emails: 0, changes: 0, removed: 0, duplicates: 0 };
  const detail = { created: [], updated: [], issues: [], removed: [], restored: [] };
  let status = 'success', error = null, snapshotHash = null;
  try {
    const snapshot = await fetchSnapshot();
    snapshotHash = sha(JSON.stringify(snapshot.tabs) + JSON.stringify(s.assets));
    const lastHash = getKV('last_snapshot_hash');
    const skipParse = lastHash === snapshotHash && get('SELECT COUNT(*) n FROM projects').n > 0;
    if (skipParse) {
      stats.rows_seen = getKV('last_records_count') ?? snapshot.tabs.reduce((n, t) => n + t.rows.length, 0);
      stats.unchanged = get('SELECT COUNT(*) n FROM projects WHERE removed_from_sheet=0').n;
      detail.note = 'Sheet unchanged since last sync';
    } else {
      await reconcile(snapshot, s, runId, stats, detail);
      setKV('last_snapshot_hash', snapshotHash);
    }
    // Assignment workflow always runs: catches anything still unassigned (new rows, re-enabled teammates, …)
    if (s.assign.enabled) {
      const r = await autoAssignPending({ actor: 'system' });
      stats.assigned += r.assignments.length;
      stats.emails += r.emails;
      detail.assignment = { assigned: r.assignments.length, unassigned: r.unassigned.length };
    }
  } catch (e) {
    status = 'failed';
    error = String(e.message || e);
    log('sync_failed', `Sync failed: ${error}`, { actor: 'system' });
    const prev = get(`SELECT status, error FROM sync_runs WHERE id<? ORDER BY id DESC LIMIT 1`, runId);
    if (!(prev && prev.status === 'failed' && prev.error === error)) {
      await notify('sync_error', { title: 'Google Sheet sync failed', body: error, severity: 'error', email: T.alertEmail({ title: 'Sheet sync failed', intro: error, rows: [['Time', new Date().toLocaleString()]] }) });
    }
  }
  update('sync_runs', runId, { ...stats, status, error, finished_at: nowIso(), duration_ms: Date.now() - t0, snapshot_hash: snapshotHash, detail: JSON.stringify(detail) });
  setKV('last_sync_at', nowIso());
  bus.emit('event', { type: 'sync', runId, status, created: stats.created, updated: stats.updated, assigned: stats.assigned, changes: stats.changes });
  return { runId, status, error, ...stats, detail };
}

async function reconcile(snapshot, s, runId, stats, detail) {
  const { records, issues, skipped } = parseSnapshot(snapshot, { now: new Date(), assetCodes: s.assets?.import_codes });
  stats.rows_seen = records.length; setKV('last_records_count', records.length);
  stats.skipped = skipped.filtered + skipped.noAsset;
  detail.issues = issues;
  detail.skipped = { filtered: skipped.filtered, noAsset: skipped.noAsset, ignored: skipped.ignored, sample: skipped.rows.slice(0, 12), codes: s.assets?.import_codes };
  const members = allMembers();
  const existing = all('SELECT * FROM projects').map(hydrate);
  const byKey = new Map(existing.map((p) => [p.external_key, p]));
  const byFp = new Map(); for (const p of existing) if (!byFp.has(p.fingerprint)) byFp.set(p.fingerprint, p);
  const matched = new Set();
  const seenKeys = new Set();
  const pairs = []; // [rec, project|null]
  const dupSeen = new Set(getKV('dupes_seen', []));

  // pass 1 — exact match by explicit ID, else by month+name fingerprint; drop duplicate sheet rows
  const unmatchedRecs = [];
  for (const rec of records) {
    rec.fp = fingerprintOf(rec);
    const dkey = rec.id ? `id:${rec.id}` : `fp:${rec.fp}`;
    if (seenKeys.has(dkey)) {
      stats.duplicates++;
      detail.issues.push({ tab: rec.tab, row: rec.row, code: 'duplicate', message: `Duplicate of an earlier row: "${rec.name}" (${rec.tab} row ${rec.row}) — ignored` });
      if (!dupSeen.has(dkey)) {
        dupSeen.add(dkey);
        await notify('missing_info', { title: `Duplicate row ignored: ${rec.name}`, body: `${rec.tab} row ${rec.row} duplicates an existing brief. Only the first occurrence is tracked.`, severity: 'warning' });
        log('duplicate_row', `Duplicate row ignored: ${rec.name} (${rec.tab} row ${rec.row})`, { actor: 'system' });
      }
      continue;
    }
    seenKeys.add(dkey);
    let p = null;
    if (rec.id) p = byKey.get(`id:${rec.id}`) || null;
    if (!p) { const c = byFp.get(rec.fp); if (c && !matched.has(c.id) && (!rec.id || c.external_key.startsWith('fp:'))) p = c; }
    if (p) { matched.add(p.id); pairs.push([rec, p]); } else unmatchedRecs.push(rec);
  }
  // pass 2 — rename detection: same tab+row as a project whose old name no longer exists in the sheet
  const orphans = existing.filter((p) => !matched.has(p.id) && !p.removed_from_sheet);
  const newRecs = [];
  for (const rec of unmatchedRecs) {
    const cand = orphans.filter((p) => !matched.has(p.id) && p.sheet_tab === rec.tab && p.sheet_row === rec.row);
    if (cand.length === 1 && !rec.id) { matched.add(cand[0].id); pairs.push([rec, cand[0]]); } else newRecs.push(rec);
  }

  // ---- updates & change detection ----
  const changedProjects = [];
  const newFlagProjects = [];
  for (const [rec, p] of pairs) {
    const res = await applyUpdate(rec, p, s, runId, members);
    if (res.restored) detail.restored.push(p.id);
    if (res.changes.length) { stats.updated++; stats.changes += res.changes.length; detail.updated.push(p.id); changedProjects.push({ project: getProject(p.id), changes: res.changes }); } else stats.unchanged++;
    if (res.newFlags.length) newFlagProjects.push({ project: getProject(p.id), flags: res.newFlags });
  }
  if (changedProjects.length) await announceChanges(changedProjects, s);
  if (newFlagProjects.length) {
    for (const { project, flags } of newFlagProjects.slice(0, 5)) {
      await notify('missing_info', { title: `Missing information: ${project.name}`, body: flags.map((f) => f.label).join(' · '), severity: 'warning', projectId: project.id, email: T.alertEmail({ title: `Missing information – ${project.name}`, intro: 'A brief was updated and is now missing details:', rows: flags.map((f) => [f.label, '—']), cta: { label: 'Open project', url: `${process.env.APP_URL || 'http://localhost:3000'}/#/projects/${project.id}` } }) });
    }
  }

  // ---- removed rows ----
  for (const p of orphans) {
    if (matched.has(p.id)) continue;
    update('projects', p.id, { removed_from_sheet: 1, updated_at: nowIso() });
    stats.removed++; detail.removed.push(p.id);
    log('removed_from_sheet', `Row no longer found in Google Sheet — project kept, flagged as removed`, { actor: 'system', projectId: p.id });
    await notify('sheet_change', { title: `Removed from sheet: ${p.name}`, body: 'The row was deleted or renamed beyond recognition. The project is kept in the dashboard.', severity: 'warning', projectId: p.id });
  }

  // ---- brand-new projects ----
  const created = [];
  const sheetAssign = [];
  for (const rec of newRecs) {
    const p = createProject(rec, s, runId, members);
    created.push(p);
    stats.created++; detail.created.push(p.id);
    if (rec.assignee_raw) {
      const { matched } = resolveMembers(rec.assignee_raw, members);
      const of = ownerFlags(rec, members);
      if (matched.length) update('projects', p.id, { collaborators: JSON.stringify(matched.slice(1).map((x) => x.id)) });
      if (of.length) { p.flags = [...p.flags, ...of]; update('projects', p.id, { flags: JSON.stringify(p.flags) }); }
      if (matched.length && s.assign.respect_sheet_assignment) sheetAssign.push([p.id, matched[0], rec]);
    }
  }
  stats.flagged += created.filter((p) => p.flags.length).length;
  if (created.length && s.monitor.auto_detect) await announceNew(created, s, stats);
  // respect assignments already present in the sheet
  for (const [pid, m] of sheetAssign) {
    const r = await assignProject(pid, m.id, { mode: 'sheet', actor: 'sheet', reason: `Assigned to ${m.name} in the Google Sheet (respected)`, quiet: false });
    stats.assigned++; stats.emails += r.emails || 0;
  }
  setKV('dupes_seen', [...dupSeen]);
}

function ensureMonth(key, source) {
  if (!key || get('SELECT 1 x FROM months WHERE key=?', key)) return false;
  run('INSERT INTO months(key,label,created_at,source) VALUES(?,?,?,?)', key, monthLabel(key), nowIso(), source);
  log('month_created', `Workspace created for ${monthLabel(key)}`, { actor: 'system' });
  return true;
}

function createProject(rec, s, runId) {
  const key = rec.id ? `id:${rec.id}` : `fp:${rec.fp}`;
  const status = rec.status || 'New Brief Received';
  const id = insert('projects', {
    external_key: key, fingerprint: rec.fp, month: rec.month, name: rec.name, brand: rec.brand, type: rec.type, brief: rec.brief,
    duration_sec: rec.duration, deadline: rec.deadline, priority: rec.priority || 'Medium', status,
    assignee_id: null, assign_mode: 'auto', assignee_raw: rec.assignee_raw, brief_received_at: nowIso(), created_at: nowIso(), updated_at: nowIso(),
    completed_at: status === 'Completed' ? nowIso() : null,
    sheet_tab: rec.tab, sheet_row: rec.row, sheet_gid: rec.gid, links: JSON.stringify(rec.links), product_info: rec.product,
    extra: JSON.stringify(rec.extra), sheet_snapshot: JSON.stringify(snapOf(rec)), flags: JSON.stringify(rec.flags),
    assets: rec.assets || null, deliverables: rec.deliverables ?? null,
  });
  run('UPDATE projects SET code=? WHERE id=?', `VP-${String(id).padStart(4, '0')}`, id);
  ensureMonth(rec.month, rec.tab);
  log('project_created', `Imported from Google Sheet (${rec.tab}, row ${rec.row})`, { actor: 'system', projectId: id });
  if (rec.flags.length) log('flagged', `Flagged: ${rec.flags.map((f) => f.label).join(', ')}`, { actor: 'system', projectId: id });
  return getProject(id);
}

async function applyUpdate(rec, p, s, runId, members) {
  const out = { changes: [], newFlags: [], restored: false };
  const patch = { sheet_tab: rec.tab, sheet_row: rec.row, sheet_gid: rec.gid, fingerprint: rec.fp };
  if (p.removed_from_sheet) { patch.removed_from_sheet = 0; out.restored = true; log('restored', 'Row reappeared in Google Sheet — project restored', { actor: 'system', projectId: p.id }); }
  const prevSnap = p.sheet_snapshot || snapOf({ ...p, duration: p.duration_sec, product: p.product_info, assignee_raw: p.assignee_raw, links: p.links, extra: p.extra });
  const diffs = diffRecord(prevSnap, rec, p, s.change_detection);
  // always sync stored values; only *record + announce* the fields the user wants tracked
  for (const d of diffs) {
    const tracked = s.change_detection.fields[d.def.cfg] !== false;
    let applied = 1, note = null;
    if (d.field === 'status') {
      const ns = rec.status;
      if (!ns) continue; // blank status cell: no instruction
      patch.status = ns; patch.completed_at = ns === 'Completed' ? nowIso() : null;
    } else if (d.field === 'assignee') {
      const locked = ['manual', 'self', 'locked'].includes(p.assign_mode) && !s.overrides.sheet_can_override_manual;
      const target = resolveMember(rec.assignee_raw, members);
      if (!rec.assignee_raw) { applied = 0; note = 'Sheet cell cleared — current assignment kept'; }
      else if (locked) { applied = 0; note = 'Ignored — you manually assigned this project (manual override respected)'; }
      else if (!target) { applied = 0; note = 'Unknown teammate in sheet — current assignment kept'; }
      else if (target.id !== p.assignee_id && s.assign.respect_sheet_assignment) {
        await assignProject(p.id, target.id, { mode: 'sheet', actor: 'sheet', reason: `Sheet reassigned to ${target.name}` });
      } else applied = 0;
      patch.assignee_raw = rec.assignee_raw;
    } else if (d.field.startsWith('extra:')) {
      // extras stored wholesale below
    } else {
      const f = d.def;
      patch[f.col] = f.json ? JSON.stringify(rec.links) : rec[f.key];
      if (d.field === 'priority' && !rec.priority) { delete patch.priority; continue; }
    }
    if (tracked) {
      insert('changes', { project_id: p.id, field: d.field, label: d.label, old_value: d.old_value, new_value: d.new_value, source: 'sheet', applied, note, sync_run_id: runId, created_at: nowIso() });
      out.changes.push({ field: d.field, label: d.label, old_value: d.old_value, new_value: d.new_value, applied, note });
    }
  }
  patch.extra = JSON.stringify(rec.extra);
  const oldCodes = new Set((p.flags || []).map((f) => f.code));
  const flags = [...rec.flags, ...ownerFlags(rec, members)];
  patch.collaborators = JSON.stringify(resolveMembers(rec.assignee_raw, members).matched.slice(1).map((x) => x.id));
  patch.deliverables = rec.deliverables ?? null;
  patch.flags = JSON.stringify(flags);
  out.newFlags = flags.filter((f) => !oldCodes.has(f.code) && !OWNER_FLAG_CODES.includes(f.code));
  patch.sheet_snapshot = JSON.stringify(snapOf(rec));
  if (out.changes.length || diffs.length) patch.updated_at = nowIso();
  update('projects', p.id, patch);
  for (const c of out.changes) log('sheet_change', `${c.label}: ${c.old_value || '(empty)'} → ${c.new_value || '(empty)'}${c.note ? ` — ${c.note}` : ''}`, { actor: 'sheet', projectId: p.id });
  return out;
}

async function announceNew(created, s, stats) {
  const groupsMap = new Map();
  for (const p of created) { if (!groupsMap.has(p.month)) groupsMap.set(p.month, []); groupsMap.get(p.month).push(p); }
  const groups = [...groupsMap].map(([k, projects]) => ({ key: k, label: monthLabel(k), projects }));
  const flagged = created.filter((p) => p.flags.length);
  const mail = T.newBriefsEmail(groups, flagged);
  let first = true;
  for (const g of groups) {
    await notify('new_briefs', { title: `${g.projects.length} new brief${g.projects.length > 1 ? 's' : ''} received — ${g.label}`, body: g.projects.slice(0, 3).map((p) => p.name).join(', ') + (g.projects.length > 3 ? ` +${g.projects.length - 3} more` : ''), severity: 'success', meta: { month: g.key, ids: g.projects.map((p) => p.id) }, email: first ? mail : null });
    first = false;
  }
  if (created.length <= 3) for (const p of created) await notify('project_added', { title: `New project: ${p.name}`, body: `${p.brand || ''} ${p.type ? '· ' + p.type : ''}`.trim(), projectId: p.id });
  if (flagged.length) {
    if (flagged.length <= 4) for (const p of flagged) await notify('missing_info', { title: `Missing information: ${p.name}`, body: p.flags.map((f) => f.label).join(' · '), severity: 'warning', projectId: p.id });
    else await notify('missing_info', { title: `${flagged.length} new briefs are missing information`, body: flagged.slice(0, 3).map((p) => `${p.name} (${p.flags[0].label})`).join(' · ') + '…', severity: 'warning', meta: { ids: flagged.map((p) => p.id) } });
  }
  stats.emails += s.notify.new_briefs.email ? 1 : 0;
}

async function announceChanges(items, s) {
  const threshold = s.change_detection.email_digest_threshold;
  const digest = items.length > threshold ? T.changeDigestEmail(items) : null;
  let i = 0;
  for (const { project, changes } of items) {
    const real = changes;
    const body = real.slice(0, 4).map((c) => `${c.label}: ${c.old_value || '(empty)'} → ${c.new_value || '(empty)'}`).join(' · ');
    await notify('sheet_change', {
      title: `Sheet change detected: ${project.name}`, body, severity: 'info', projectId: project.id,
      meta: { changes: real },
      email: digest ? (i === 0 ? digest : null) : T.changeEmail(project, real),
    });
    i++;
  }
}
