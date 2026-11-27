import express from 'express';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { all, get, run, insert, update } from './db.js';
import { getSettings, saveSettings, getKV, setKV, DEFAULTS } from './settings.js';
import { nowIso, today } from './clock.js';
import { addDays, daysBetween, monthLabel, jparse, fmtDate } from './util.js';
import { STATUSES, PRIORITIES, PROJECT_TYPES, NOTIFY_TYPES, ASSIGN_MODE_LABEL } from './constants.js';
import * as P from './services/projects.js';
import * as stats from './services/stats.js';
import { notify, log, unreadCount } from './services/notify.js';
import { sendEmail } from './services/mailer.js';
import * as T from './services/emailTemplates.js';
import { runSync, syncInProgress, resolveMember } from './engine/sync.js';
import { runReminders } from './services/reminders.js';
import * as G from './integrations/google.js';
import * as S from './integrations/sheetSource.js';
import { parseSnapshot } from './engine/mapper.js';
import { resetWorkspace } from './seed.js';
import { bus } from './bus.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const bad = (msg, code = 400) => Object.assign(new Error(msg), { status: code });

function decorate(p, memberMap, t = today()) {
  const m = p.assignee_id ? memberMap[p.assignee_id] : null;
  return {
    ...p, assignee_name: m?.name || null, assignee_color: m?.color || null, is_owner_assigned: !!m?.is_owner,
    assignment_status: p.assignee_id ? ASSIGN_MODE_LABEL[p.assign_mode] : p.assign_mode === 'locked' ? ASSIGN_MODE_LABEL.locked : 'Unassigned',
    month_label: monthLabel(p.month), sheet_link: S.sheetLink(p),
    days_to_deadline: p.deadline ? daysBetween(t, p.deadline) : null,
    overdue: !!(p.deadline && p.deadline < t && !['Completed', 'On Hold'].includes(p.status)),
  };
}
const memberMap = () => Object.fromEntries(P.allMembers().map((m) => [m.id, m]));

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '1mb' }));
  app.use((req, res, next) => {
    res.set({ 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY', 'Referrer-Policy': 'same-origin' });
    next();
  });

  // ---------------------------------------------------------------- auth (Google OAuth when configured)
  const live = () => G.googleConfigured();
  const cookies = (req) => Object.fromEntries((req.headers.cookie || '').split(';').map((c) => c.trim().split('=')).filter((x) => x[0]).map(([k, ...v]) => [k, decodeURIComponent(v.join('='))]));
  const sessionOf = (req) => {
    const sid = cookies(req).vo_sid;
    if (!sid) return null;
    const s = get('SELECT * FROM sessions WHERE id=?', sid);
    return s && s.expires_at > nowIso() ? s : null;
  };
  const cookieOpts = `Path=/; HttpOnly; SameSite=Lax; Max-Age=${60 * 60 * 24 * 7}${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`;

  app.get('/auth/google', (req, res) => {
    if (!live()) return res.status(400).send('Google OAuth is not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.');
    const state = crypto.randomBytes(16).toString('hex');
    res.set('Set-Cookie', `vo_state=${state}; Path=/; HttpOnly; SameSite=Lax; Max-Age=600`);
    res.redirect(G.authUrl(state));
  });
  app.get('/auth/google/callback', wrap(async (req, res) => {
    const { code, state, error } = req.query;
    if (error) return res.redirect(`/#/integrations?error=${encodeURIComponent(error)}`);
    if (!state || state !== cookies(req).vo_state) return res.status(400).send('Invalid OAuth state');
    const { tokens, profile } = await G.exchangeCode(code);
    const owner = getKV('owner_email');
    const allowed = (process.env.ALLOWED_EMAILS || '').split(',').map((x) => x.trim().toLowerCase()).filter(Boolean);
    const email = (profile.email || '').toLowerCase();
    if ((allowed.length && !allowed.includes(email)) || (owner && owner !== email && !allowed.length)) return res.status(403).send('This account is not allowed to access this workspace.');
    if (!owner) { setKV('owner_email', email); saveSettings({ workspace: { owner_email: profile.email, owner_name: profile.name || getSettings().workspace.owner_name } }); }
    const prev = G.loadTokens();
    G.saveTokens({ ...tokens, refresh_token: tokens.refresh_token || prev?.refresh_token });
    setKV('google_profile', profile);
    const sid = crypto.randomBytes(24).toString('hex');
    run('INSERT INTO sessions(id,email,name,created_at,expires_at) VALUES(?,?,?,?,?)', sid, email, profile.name, nowIso(), new Date(Date.now() + 7 * 864e5).toISOString());
    log('google_connected', `Google account connected (${profile.email})`, { actor: 'you' });
    res.set('Set-Cookie', `vo_sid=${sid}; ${cookieOpts}`);
    res.redirect('/#/integrations');
  }));
  app.post('/auth/logout', (req, res) => { const sid = cookies(req).vo_sid; if (sid) run('DELETE FROM sessions WHERE id=?', sid); res.set('Set-Cookie', 'vo_sid=; Path=/; Max-Age=0'); res.json({ ok: true }); });

  app.get('/api/health', (req, res) => res.json({ ok: true, time: nowIso() }));
  app.get('/api/session', (req, res) => {
    const s = sessionOf(req);
    res.json({ live: live(), authenticated: !live() || !!s, user: s ? { email: s.email, name: s.name } : live() ? null : { email: getSettings().workspace.owner_email, name: getSettings().workspace.owner_name, demo: true } });
  });
  // everything below needs a session when Google OAuth is configured
  app.use('/api', (req, res, next) => {
    if (live() && !sessionOf(req)) return res.status(401).json({ error: 'Sign in with Google to continue' });
    // CSRF hardening: state-changing requests must be JSON (blocks cross-site form posts)
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && +req.headers['content-length'] > 0 && !req.is('application/json')) return res.status(415).json({ error: 'JSON required' });
    next();
  });

  // ---------------------------------------------------------------- bootstrap & live events
  app.get('/api/bootstrap', (req, res) => {
    const s = getSettings();
    res.json({
      settings: s, statuses: STATUSES, priorities: PRIORITIES, types: PROJECT_TYPES, notifyTypes: NOTIFY_TYPES, assignModes: ASSIGN_MODE_LABEL,
      team: P.allMembers(), unread: unreadCount(), today: today(), syncing: syncInProgress(), lastSyncAt: getKV('last_sync_at'),
      mode: { sheet: s.integrations.sheet_mode, email: s.email.mode, googleConfigured: live() },
      months: stats.monthsSummary(),
    });
  });
  app.get('/api/events', (req, res) => {
    res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
    res.flushHeaders?.();
    res.write('retry: 3000\n\n');
    const onEvent = (e) => res.write(`data: ${JSON.stringify(e)}\n\n`);
    bus.on('event', onEvent);
    const ka = setInterval(() => res.write(': ping\n\n'), 25000);
    req.on('close', () => { bus.off('event', onEvent); clearInterval(ka); });
  });

  // ---------------------------------------------------------------- dashboard & months
  app.get('/api/dashboard', (req, res) => res.json({ ...stats.dashboard(), syncing: syncInProgress() }));
  app.get('/api/months', (req, res) => res.json(stats.monthsSummary()));
  app.get('/api/months/:key', (req, res) => res.json(stats.monthDetail(req.params.key)));

  // ---------------------------------------------------------------- projects
  const SORTS = {
    name: 'p.name COLLATE NOCASE', month: 'p.month', brand: 'p.brand COLLATE NOCASE', type: 'p.type COLLATE NOCASE', assignee: 'm.name COLLATE NOCASE',
    priority: `CASE p.priority WHEN 'Urgent' THEN 4 WHEN 'High' THEN 3 WHEN 'Medium' THEN 2 ELSE 1 END`, status: `CASE p.status ${STATUSES.map((s, i) => `WHEN '${s}' THEN ${i}`).join(' ')} END`,
    received: 'p.brief_received_at', deadline: 'p.deadline IS NULL, p.deadline', updated: 'p.updated_at', code: 'p.id', assignment: 'p.assign_mode',
  };
  app.get('/api/projects', (req, res) => {
    const q = req.query, w = ['p.removed_from_sheet=0'], a = [];
    const t = today();
    if (q.q) { w.push(`(p.name LIKE ? OR p.brand LIKE ? OR p.code LIKE ? OR p.brief LIKE ? OR p.type LIKE ?)`); const l = `%${q.q}%`; a.push(l, l, l, l, l); }
    if (q.month) { w.push('p.month=?'); a.push(q.month); }
    if (q.assignee === 'unassigned') w.push('p.assignee_id IS NULL'); else if (q.assignee) { w.push('p.assignee_id=?'); a.push(+q.assignee); }
    if (q.status) { const l = q.status.split('|'); w.push(`p.status IN (${l.map(() => '?').join(',')})`); a.push(...l); }
    if (q.priority) { w.push('p.priority=?'); a.push(q.priority); }
    if (q.type) { w.push('p.type=?'); a.push(q.type); }
    if (q.mode) { w.push('p.assign_mode=?'); a.push(q.mode); }
    if (q.due === 'overdue') { w.push(`p.deadline < ? AND p.status NOT IN ('Completed','On Hold')`); a.push(t); }
    if (q.due === 'soon') { w.push(`p.deadline >= ? AND p.deadline <= ? AND p.status NOT IN ('Completed','On Hold')`); a.push(t, addDays(t, getSettings().reminders.days_before)); }
    if (q.flagged) w.push(`p.flags != '[]'`);
    if (q.active) w.push(`p.status NOT IN ('Completed')`);
    const order = SORTS[q.sort] || SORTS.deadline;
    const dir = q.dir === 'desc' ? 'DESC' : 'ASC';
    const pageSize = Math.min(+q.pageSize || 25, 200), page = Math.max(+q.page || 1, 1);
    const from = `FROM projects p LEFT JOIN team_members m ON m.id=p.assignee_id WHERE ${w.join(' AND ')}`;
    const total = get(`SELECT COUNT(*) n ${from}`, ...a).n;
    const rows = all(`SELECT p.* ${from} ORDER BY ${order} ${dir}, p.id DESC LIMIT ? OFFSET ?`, ...a, pageSize, (page - 1) * pageSize).map(P.hydrate);
    const mm = memberMap();
    res.json({ items: rows.map((p) => decorate(p, mm, t)), total, page, pageSize, pages: Math.ceil(total / pageSize) });
  });

  app.get('/api/projects/:id', wrap(async (req, res) => {
    const p = P.getProject(+req.params.id);
    if (!p) throw bad('Project not found', 404);
    const mm = memberMap();
    const nm = (id) => (id ? mm[id]?.name || 'Unknown' : null);
    res.json({
      project: decorate(p, mm),
      assignments: all('SELECT * FROM assignments WHERE project_id=? ORDER BY id DESC', p.id).map((r) => ({ ...r, from_name: nm(r.from_member_id), to_name: nm(r.to_member_id) })),
      changes: all('SELECT * FROM changes WHERE project_id=? ORDER BY id DESC', p.id).map((c) => ({ ...c, meta: undefined })),
      timeline: all('SELECT * FROM activity WHERE project_id=? ORDER BY ts DESC, id DESC', p.id).map((a) => ({ ...a, meta: jparse(a.meta) })),
      comments: all('SELECT * FROM comments WHERE project_id=? ORDER BY id DESC', p.id),
      emails: all('SELECT id,to_addr,to_name,subject,kind,status,created_at FROM emails WHERE project_id=? ORDER BY id DESC', p.id),
    });
  }));

  app.patch('/api/projects/:id', wrap(async (req, res) => {
    const id = +req.params.id, b = req.body || {};
    if (!P.getProject(id)) throw bad('Project not found', 404);
    if (b.status !== undefined) await P.setStatus(id, b.status);
    await P.updateFields(id, b);
    res.json(decorate(P.getProject(id), memberMap()));
  }));

  app.post('/api/projects/:id/assign', wrap(async (req, res) => {
    const id = +req.params.id;
    const { assignee_id = null, mode = 'manual' } = req.body || {};
    if (!P.getProject(id)) throw bad('Project not found', 404);
    let r;
    if (mode === 'auto' && assignee_id == null) {
      // release to the automation: clear and re-run distribution for just this project
      await P.assignProject(id, null, { mode: 'auto', actor: 'you', reason: 'Released to auto-assignment' });
      const plan = await P.autoAssignPending({ ids: [id], actor: 'system' });
      r = { autoAssigned: plan.assignments[0] || null, unassigned: plan.unassigned[0] || null };
    } else r = await P.assignProject(id, assignee_id, { mode: mode === 'locked' ? 'locked' : 'manual', actor: 'you' });
    res.json({ result: r.noop ? 'noop' : 'ok', project: decorate(P.getProject(id), memberMap()), ...(r.autoAssigned !== undefined ? r : {}) });
  }));

  app.post('/api/projects/:id/comments', wrap(async (req, res) => {
    const id = +req.params.id, body = String(req.body?.body || '').trim();
    if (!body) throw bad('Comment is empty');
    if (!P.getProject(id)) throw bad('Project not found', 404);
    const author = getSettings().workspace.owner_name;
    insert('comments', { project_id: id, author, body, created_at: nowIso() });
    log('comment', body.length > 90 ? `${body.slice(0, 90)}…` : body, { actor: 'you', projectId: id });
    res.json({ ok: true });
  }));

  app.post('/api/projects/bulk', wrap(async (req, res) => {
    const { ids = [], action, value } = req.body || {};
    if (!Array.isArray(ids) || !ids.length) throw bad('No projects selected');
    let n = 0;
    for (const id of ids) {
      if (action === 'status') await P.setStatus(id, value);
      else if (action === 'priority') await P.updateFields(id, { priority: value });
      else if (action === 'assign') await P.assignProject(id, value === 'locked' ? null : value, { mode: value === 'locked' ? 'locked' : 'manual', actor: 'you' });
      else throw bad('Unknown bulk action');
      n++;
    }
    res.json({ ok: true, updated: n });
  }));

  // ---------------------------------------------------------------- team
  const teamView = () => {
    const loads = P.memberLoads(); const t = today();
    return P.allMembers().map((m) => {
      const projects = all(`SELECT id,code,name,status,priority,deadline FROM projects WHERE assignee_id=? AND removed_from_sheet=0 AND status!='Completed' ORDER BY deadline IS NULL, deadline`, m.id);
      const done = get(`SELECT COUNT(*) n FROM projects WHERE assignee_id=? AND status='Completed'`, m.id).n;
      const overdue = projects.filter((p) => p.deadline && p.deadline < t && p.status !== 'On Hold').length;
      const onLeave = !!(m.leave_until && m.leave_until >= t);
      return { ...m, active: loads[m.id]?.count || 0, weighted: loads[m.id]?.weighted || 0, completed: done, overdue, onLeave, projects, available: m.enabled && m.availability !== 'unavailable' && !onLeave };
    });
  };
  app.get('/api/team', (req, res) => res.json(teamView()));
  const memberBody = (b) => {
    const prefs = b.prefs || {};
    const list = (x) => (Array.isArray(x) ? x : String(x || '').split(',')).map((s) => String(s).trim()).filter(Boolean);
    return {
      name: String(b.name || '').trim(), email: String(b.email || '').trim().toLowerCase(), role: b.role || 'AI Video Editor',
      enabled: b.enabled !== false, availability: ['available', 'limited', 'unavailable'].includes(b.availability) ? b.availability : 'available',
      leave_until: b.leave_until || null, max_active: b.max_active === '' || b.max_active == null ? null : +b.max_active,
      prefs: JSON.stringify({ preferred_types: list(prefs.preferred_types), preferred_brands: list(prefs.preferred_brands), excluded_types: list(prefs.excluded_types), excluded_brands: list(prefs.excluded_brands) }),
    };
  };
  const COLORS = ['#7aa2ff', '#3dd6c6', '#f08fc0', '#ffb454', '#9b8cff', '#58d68d', '#ff7a59', '#b5c4ff'];
  app.post('/api/team', wrap(async (req, res) => {
    const m = memberBody(req.body || {});
    if (!m.name) throw bad('Name is required');
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(m.email)) throw bad('A valid email address is required');
    if (get('SELECT 1 x FROM team_members WHERE lower(email)=?', m.email)) throw bad('A teammate with this email already exists');
    const count = get('SELECT COUNT(*) n FROM team_members').n;
    const id = insert('team_members', { ...m, is_owner: 0, color: COLORS[count % COLORS.length], created_at: nowIso() });
    log('team_added', `Teammate added: ${m.name}`, { actor: 'you' });
    // newly available teammate: let the automation pick up any waiting projects
    if (getSettings().assign.enabled) await P.autoAssignPending({ actor: 'system' });
    res.json(teamView().find((x) => x.id === id));
  }));
  app.patch('/api/team/:id', wrap(async (req, res) => {
    const id = +req.params.id; const cur = P.getMember(id);
    if (!cur) throw bad('Teammate not found', 404);
    const merged = { ...cur, ...req.body, prefs: { ...cur.prefs, ...(req.body.prefs || {}) } };
    const m = memberBody(merged);
    if (cur.is_owner) { m.enabled = false; }
    if (!m.name) throw bad('Name is required');
    update('team_members', id, m);
    log('team_updated', `Teammate updated: ${m.name}`, { actor: 'you' });
    if (getSettings().assign.enabled && (req.body.enabled !== undefined || req.body.availability !== undefined || req.body.leave_until !== undefined)) await P.autoAssignPending({ actor: 'system' });
    res.json(teamView().find((x) => x.id === id));
  }));
  app.delete('/api/team/:id', wrap(async (req, res) => {
    const id = +req.params.id; const cur = P.getMember(id);
    if (!cur || cur.is_owner) throw bad('Cannot remove this teammate');
    const n = get(`SELECT COUNT(*) n FROM projects WHERE assignee_id=?`, id).n;
    if (n) throw bad(`${cur.name} is on ${n} project(s). Reassign them first — or switch off auto-assign / mark unavailable to keep the history intact.`, 409);
    run('DELETE FROM team_members WHERE id=?', id);
    log('team_removed', `Teammate removed: ${cur.name}`, { actor: 'you' });
    res.json({ ok: true });
  }));

  // ---------------------------------------------------------------- assignments
  app.get('/api/assignments', (req, res) => {
    const mm = memberMap();
    const rows = all(`SELECT a.*, p.name project_name, p.code project_code FROM assignments a JOIN projects p ON p.id=a.project_id ORDER BY a.id DESC LIMIT ?`, Math.min(+req.query.limit || 100, 500));
    res.json(rows.map((r) => ({ ...r, from_name: r.from_member_id ? mm[r.from_member_id]?.name : null, to_name: r.to_member_id ? mm[r.to_member_id]?.name : null })));
  });
  app.get('/api/assignments/board', (req, res) => {
    const t = today();
    const mm = memberMap();
    const cols = [{ id: null, name: 'Unassigned', projects: [] }];
    for (const m of Object.values(mm)) cols.push({ id: m.id, name: m.is_owner ? `${m.name} (you)` : m.name, color: m.color, is_owner: m.is_owner, projects: [] });
    const rows = all(`SELECT * FROM projects WHERE removed_from_sheet=0 AND status NOT IN ('Completed') ORDER BY deadline IS NULL, deadline`).map(P.hydrate);
    for (const p of rows) (cols.find((c) => c.id === p.assignee_id) || cols[0]).projects.push(decorate(p, mm, t));
    res.json({ columns: cols, pending: cols[0].projects.length });
  });
  app.post('/api/assignments/preview', wrap(async (req, res) => res.json(await P.autoAssignPending({ dryRun: true }))));
  app.post('/api/assignments/run', wrap(async (req, res) => res.json(await P.autoAssignPending({ actor: 'system' }))));

  // ---------------------------------------------------------------- notifications, emails, changes, activity
  app.get('/api/notifications', (req, res) => {
    const w = ['1=1'], a = [];
    if (req.query.type) { w.push('type=?'); a.push(req.query.type); }
    if (req.query.unread) w.push('read=0');
    const limit = Math.min(+req.query.limit || 60, 300), offset = +req.query.offset || 0;
    const total = get(`SELECT COUNT(*) n FROM notifications WHERE ${w.join(' AND ')}`, ...a).n;
    const items = all(`SELECT * FROM notifications WHERE ${w.join(' AND ')} ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?`, ...a, limit, offset).map((n) => ({ ...n, meta: jparse(n.meta) }));
    const typeCounts = Object.fromEntries(all('SELECT type, COUNT(*) n FROM notifications GROUP BY type').map((r) => [r.type, r.n]));
    res.json({ items, total, unread: unreadCount(), typeCounts });
  });
  app.post('/api/notifications/read', (req, res) => {
    const { ids, all: everything } = req.body || {};
    if (everything) run('UPDATE notifications SET read=1'); else if (Array.isArray(ids) && ids.length) run(`UPDATE notifications SET read=1 WHERE id IN (${ids.map(() => '?').join(',')})`, ...ids.map(Number));
    res.json({ unread: unreadCount() });
  });
  app.get('/api/emails', (req, res) => {
    const w = ['1=1'], a = [];
    if (req.query.kind) { w.push('kind LIKE ?'); a.push(`${req.query.kind}%`); }
    res.json(all(`SELECT id,to_addr,to_name,subject,kind,status,error,project_id,created_at FROM emails WHERE ${w.join(' AND ')} ORDER BY id DESC LIMIT ?`, ...a, Math.min(+req.query.limit || 100, 500)));
  });
  app.get('/api/emails/:id', (req, res) => { const e = get('SELECT * FROM emails WHERE id=?', +req.params.id); if (!e) throw bad('Email not found', 404); res.json(e); });
  app.post('/api/emails/preview', (req, res) => {
    const s = getSettings();
    const overrides = req.body || {};
    const sample = { id: 0, code: 'VP-0000', name: 'Cult Winterwear Campaign', type: 'AI Video Production', brand: 'Cult Apparel', deadline: addDays(today(), 11), priority: 'High', duration_sec: 30, month: today().slice(0, 7), sheet_row: 5, sheet_tab: 'Sample', brief: 'A 30s hero film showing the new winterwear drop — cinematic city dawn runs, fabric macro inserts, end on the Cult Winter logo lockup.', links: ['https://drive.google.com/drive/folders/sample-moodboard', 'https://www.youtube.com/watch?v=sample-ref'] };
    const member = { name: 'Aarav Mehta' };
    const saved = s.email;
    const tmp = { ...saved, ...(overrides.assignment_subject != null ? { assignment_subject: overrides.assignment_subject } : {}), ...(overrides.assignment_body != null ? { assignment_body: overrides.assignment_body } : {}) };
    const prev = s.email; s.email = tmp;
    try { res.json(T.assignmentEmail(sample, member)); } finally { s.email = prev; }
  });
  app.get('/api/changes', (req, res) => {
    const q = req.query, w = ['1=1'], a = [];
    if (q.project) { w.push('c.project_id=?'); a.push(+q.project); }
    if (q.source) { w.push('c.source=?'); a.push(q.source); }
    if (q.field) { w.push(`(c.field=? OR c.label=?)`); a.push(q.field, q.field); }
    if (q.q) { w.push(`(p.name LIKE ? OR c.old_value LIKE ? OR c.new_value LIKE ? OR c.label LIKE ?)`); const l = `%${q.q}%`; a.push(l, l, l, l); }
    if (q.from) { w.push('c.created_at >= ?'); a.push(q.from); }
    const limit = Math.min(+q.limit || 50, 300), offset = +q.offset || 0;
    const total = get(`SELECT COUNT(*) n FROM changes c JOIN projects p ON p.id=c.project_id WHERE ${w.join(' AND ')}`, ...a).n;
    const items = all(`SELECT c.*, p.name project_name, p.code project_code FROM changes c JOIN projects p ON p.id=c.project_id WHERE ${w.join(' AND ')} ORDER BY c.created_at DESC, c.id DESC LIMIT ? OFFSET ?`, ...a, limit, offset);
    const fields = all(`SELECT DISTINCT label FROM changes ORDER BY label`).map((r) => r.label);
    res.json({ items, total, fields });
  });
  app.get('/api/activity', (req, res) => {
    const limit = Math.min(+req.query.limit || 40, 300), offset = +req.query.offset || 0;
    const w = ['1=1'], a = [];
    if (req.query.kind) { w.push('a.kind=?'); a.push(req.query.kind); }
    const items = all(`SELECT a.*, p.name project_name FROM activity a LEFT JOIN projects p ON p.id=a.project_id WHERE ${w.join(' AND ')} ORDER BY a.ts DESC, a.id DESC LIMIT ? OFFSET ?`, ...a, limit, offset).map((r) => ({ ...r, meta: jparse(r.meta) }));
    res.json({ items, total: get(`SELECT COUNT(*) n FROM activity a WHERE ${w.join(' AND ')}`, ...a).n });
  });

  // ---------------------------------------------------------------- sync & settings
  app.get('/api/sync/runs', (req, res) => res.json({ runs: all('SELECT * FROM sync_runs ORDER BY id DESC LIMIT ?', Math.min(+req.query.limit || 30, 200)).map((r) => ({ ...r, detail: jparse(r.detail) })), syncing: syncInProgress(), lastSyncAt: getKV('last_sync_at') }));
  app.post('/api/sync/run', wrap(async (req, res) => res.json(await runSync({ trigger: req.body?.trigger || 'manual' }))));
  app.post('/api/reminders/run', wrap(async (req, res) => res.json(await runReminders())));

  app.get('/api/settings', (req, res) => res.json(getSettings()));
  app.put('/api/settings', wrap(async (req, res) => {
    const patch = req.body || {};
    if (patch.integrations || (patch.email && patch.email.mode)) throw bad('Use the Integrations page to change connections');
    if (patch.assign?.strategy && !['balance_total', 'equal_batch'].includes(patch.assign.strategy)) throw bad('Invalid strategy');
    if (patch.monitor?.interval_min !== undefined) patch.monitor.interval_min = Math.max(1, Math.min(1440, +patch.monitor.interval_min || 5));
    res.json(saveSettings(patch));
  }));

  // ---------------------------------------------------------------- integrations
  app.get('/api/integrations', (req, res) => {
    const s = getSettings();
    const profile = getKV('google_profile');
    res.json({
      googleConfigured: live(), connected: !!G.loadTokens(), profile, redirectUri: G.redirectUri(),
      sheet: { mode: s.integrations.sheet_mode, spreadsheet_id: s.integrations.spreadsheet_id, url: s.integrations.spreadsheet_url, title: s.integrations.sheet_title },
      email: { mode: s.email.mode, from: profile?.email || null }, lastSyncAt: getKV('last_sync_at'),
    });
  });
  app.post('/api/integrations/sheet', wrap(async (req, res) => {
    const { mode, url } = req.body || {};
    const s = getSettings();
    if (mode === 'demo') { saveSettings({ integrations: { sheet_mode: 'demo' } }); return res.json({ ok: true, mode: 'demo' }); }
    if (!live() || !G.loadTokens()) throw bad('Connect your Google account first (Integrations → Sign in with Google).');
    const id = G.parseSpreadsheetId(url);
    if (!id) throw bad('That does not look like a Google Sheets URL');
    const snap = await G.fetchSheetSnapshot(id);
    saveSettings({ integrations: { sheet_mode: 'google', spreadsheet_id: id, spreadsheet_url: url, sheet_title: snap.title } });
    setKV('last_snapshot_hash', null);
    log('sheet_connected', `Google Sheet connected: ${snap.title}`, { actor: 'you' });
    res.json({ ok: true, title: snap.title, tabs: snap.tabs.length, previous: s.integrations.sheet_mode });
  }));
  app.post('/api/integrations/sheet/preview', wrap(async (req, res) => {
    const snap = await S.fetchSnapshot();
    const parsed = parseSnapshot(snap);
    res.json({ title: snap.title, columns: parsed.columns, records: parsed.records.length, issues: parsed.issues, flagged: parsed.records.filter((r) => r.flags.length).length, sample: parsed.records.slice(0, 3).map((r) => ({ name: r.name, month: r.month, deadline: r.deadline, priority: r.priority, flags: r.flags })) });
  }));
  app.post('/api/integrations/email', wrap(async (req, res) => {
    const mode = req.body?.mode;
    if (!['demo', 'gmail'].includes(mode)) throw bad('Invalid mode');
    if (mode === 'gmail' && (!live() || !G.loadTokens())) throw bad('Connect your Google account first.');
    saveSettings({ email: { mode } });
    res.json({ ok: true, mode });
  }));
  app.post('/api/integrations/email/test', wrap(async (req, res) => {
    const w = getSettings().workspace;
    const r = await sendEmail({ to: w.owner_email, toName: w.owner_name, kind: 'test', ...T.alertEmail({ title: 'Test email from Cult Video Ops', intro: 'If you can read this, outgoing notifications are working.', rows: [['Mode', getSettings().email.mode], ['Sent', new Date().toLocaleString()]] }) });
    res.json(r);
  }));
  app.post('/api/integrations/disconnect', wrap(async (req, res) => {
    G.clearTokens(); setKV('google_profile', null);
    saveSettings({ integrations: { sheet_mode: 'demo' }, email: { mode: 'demo' } });
    res.json({ ok: true });
  }));

  // ---------------------------------------------------------------- demo sheet simulator
  const demoOnly = (req, res, next) => (getSettings().integrations.sheet_mode === 'demo' ? next() : res.status(400).json({ error: 'The sheet simulator is only available in demo mode' }));
  app.get('/api/demo/sheet', demoOnly, (req, res) => res.json({ ...S.demoSnapshot(), headers: S.DEMO_HEADERS }));
  app.patch('/api/demo/sheet/cell', demoOnly, wrap(async (req, res) => {
    const { tab, row, header, value } = req.body || {};
    S.demoSetCell(tab, +row, header, String(value ?? ''));
    res.json({ ok: true, autosync: getSettings().monitor.autosync_on_sheet_edit && getSettings().monitor.enabled });
  }));
  app.post('/api/demo/sheet/row', demoOnly, wrap(async (req, res) => {
    const { tab, data = {} } = req.body || {};
    if (!tab) throw bad('Tab is required');
    res.json({ row: S.demoAddRow(tab, data) });
  }));
  app.delete('/api/demo/sheet/row', demoOnly, wrap(async (req, res) => { S.demoDeleteRow(req.query.tab, +req.query.row); res.json({ ok: true }); }));
  app.post('/api/demo/sheet/add-month', demoOnly, wrap(async (req, res) => {
    const { addNextMonthBatch } = await import('./seed.js');
    res.json(addNextMonthBatch());
  }));
  app.post('/api/demo/reset', wrap(async (req, res) => { await resetWorkspace({ demo: true }); res.json({ ok: true }); }));
  app.post('/api/workspace/clear', wrap(async (req, res) => { await resetWorkspace({ demo: false }); res.json({ ok: true }); }));
  app.get('/api/export/projects.csv', (req, res) => {
    const mm = memberMap();
    const rows = all('SELECT * FROM projects WHERE removed_from_sheet=0 ORDER BY month, deadline').map(P.hydrate);
    const cols = ['code', 'name', 'month', 'brand', 'type', 'assignee', 'priority', 'status', 'deadline', 'brief_received_at', 'updated_at'];
    const csv = [cols.join(',')].concat(rows.map((p) => cols.map((c) => `"${String(c === 'assignee' ? mm[p.assignee_id]?.name || '' : p[c] ?? '').replace(/"/g, '""')}"`).join(','))).join('\n');
    res.set({ 'Content-Type': 'text/csv', 'Content-Disposition': 'attachment; filename="projects.csv"' }).send(csv);
  });

  // ---------------------------------------------------------------- static frontend + errors
  app.use(express.static(path.join(__dirname, '..', 'public'), { extensions: ['html'], etag: true, maxAge: 0 }));
  app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));
  app.use((err, req, res, next) => { // eslint-disable-line no-unused-vars
    const status = err.status || 500;
    if (status >= 500) console.error('[error]', err);
    res.status(status).json({ error: status >= 500 ? (err.message || 'Internal error') : err.message });
  });
  return app;
}
void DEFAULTS; void fmtDate; void resolveMember;
