// Core project domain logic: hydration, workload, status/field edits, assignment (manual + auto).
import { all, get, run, insert, update } from '../db.js';
import { getSettings } from '../settings.js';
import { nowIso, today } from '../clock.js';
import { jparse, fmtDate, httpError } from '../util.js';
import { PRIORITY_WEIGHT, STATUSES, PRIORITIES, ASSIGN_MODE_LABEL } from '../constants.js';
import { planAssignments } from '../engine/assign.js';
import { log, notify } from './notify.js';
import { sendEmail } from './mailer.js';
import * as T from './emailTemplates.js';

export function hydrate(r) {
  if (!r) return null;
  return { ...r, links: jparse(r.links, []), extra: jparse(r.extra, {}), flags: jparse(r.flags, []), sheet_snapshot: jparse(r.sheet_snapshot, null), removed_from_sheet: !!r.removed_from_sheet };
}
export const getProject = (id) => hydrate(get('SELECT * FROM projects WHERE id=?', id));
export function getMember(id) {
  const m = get('SELECT * FROM team_members WHERE id=?', id);
  return m ? hydrateMember(m) : null;
}
export function hydrateMember(m) { return { ...m, enabled: !!m.enabled, is_owner: !!m.is_owner, prefs: jparse(m.prefs, {}) }; }
export const allMembers = () => all('SELECT * FROM team_members ORDER BY is_owner DESC, name').map(hydrateMember);

/** Existing workload per member (count + priority-weighted). */
export function memberLoads() {
  const s = getSettings();
  const skip = s.assign.count_on_hold ? `('Completed')` : `('Completed','On Hold')`;
  const rows = all(`SELECT assignee_id, priority FROM projects WHERE assignee_id IS NOT NULL AND removed_from_sheet=0 AND status NOT IN ${skip}`);
  const loads = {};
  for (const r of rows) {
    const l = (loads[r.assignee_id] ||= { count: 0, weighted: 0 });
    l.count += 1; l.weighted += PRIORITY_WEIGHT[r.priority] || 1;
  }
  return loads;
}

// ---- field + status edits ---------------------------------------------------------------------
export async function setStatus(id, status, { actor = 'you', quiet = false } = {}) {
  if (!STATUSES.includes(status)) throw httpError(`Invalid status: ${status}`);
  const p = getProject(id);
  if (!p) throw httpError('Project not found', 404);
  if (p.status === status) return p;
  const patch = { status, updated_at: nowIso() };
  patch.completed_at = status === 'Completed' ? nowIso() : null;
  update('projects', id, patch);
  insert('changes', { project_id: id, field: 'status', label: 'Project status', old_value: p.status, new_value: status, source: 'app', applied: 1, note: null, created_at: nowIso() });
  log('status_changed', `Status changed: ${p.status} → ${status}`, { actor, projectId: id });
  if (!quiet) await notify('status_update', { title: `${p.name} → ${status}`, body: `Status changed from ${p.status} to ${status}.`, projectId: id });
  return getProject(id);
}

export async function updateFields(id, patch, { actor = 'you' } = {}) {
  const p = getProject(id);
  if (!p) throw httpError('Project not found', 404);
  const out = {};
  const labels = { priority: 'Priority', deadline: 'Delivery date', notes: 'Internal notes', type: 'Project type' };
  const fmt = { deadline: (v) => (v ? fmtDate(v) : '') };
  if (patch.priority !== undefined) { if (!PRIORITIES.includes(patch.priority)) throw httpError('Invalid priority'); out.priority = patch.priority; }
  if (patch.deadline !== undefined) { if (patch.deadline && !/^\d{4}-\d{2}-\d{2}$/.test(patch.deadline)) throw httpError('Invalid date'); out.deadline = patch.deadline || null; }
  if (patch.notes !== undefined) out.notes = String(patch.notes);
  if (patch.type !== undefined) out.type = String(patch.type);
  for (const [k, v] of Object.entries(out)) {
    if ((p[k] ?? '') === (v ?? '')) { delete out[k]; continue; }
    if (k !== 'notes') insert('changes', { project_id: id, field: k, label: labels[k], old_value: (fmt[k] || String)(p[k] ?? ''), new_value: (fmt[k] || String)(v ?? ''), source: 'app', applied: 1, created_at: nowIso() });
    log('field_changed', `${labels[k]} updated${k === 'notes' ? '' : `: ${(fmt[k] || String)(p[k] ?? '—')} → ${(fmt[k] || String)(v ?? '—')}`}`, { actor, projectId: id });
  }
  if (Object.keys(out).length) update('projects', id, { ...out, updated_at: nowIso() });
  return getProject(id);
}

// ---- assignment -----------------------------------------------------------------------------
/**
 * Assign / reassign / unassign a project. memberId=null + mode 'locked' => "Do not auto-assign".
 * Records assignment history, updates workload implicitly, and sends the emails.
 */
export async function assignProject(id, memberId, { mode = 'manual', actor = 'you', reason = null, quiet = false } = {}) {
  const s = getSettings();
  const p = getProject(id);
  if (!p) throw httpError('Project not found', 404);
  const prev = p.assignee_id ? getMember(p.assignee_id) : null;
  const next = memberId ? getMember(memberId) : null;
  if (memberId && !next) throw httpError('Teammate not found', 404);
  let nextMode = mode;
  if (next?.is_owner) nextMode = 'self';
  if (!next && mode !== 'locked') nextMode = 'auto';
  if ((prev?.id ?? null) === (next?.id ?? null) && p.assign_mode === nextMode) return { noop: true, project: p };

  const patch = { assignee_id: next?.id ?? null, assign_mode: nextMode, updated_at: nowIso() };
  if (next && ['New Brief Received', 'Pending Assignment'].includes(p.status)) patch.status = 'Assigned';
  if (!next && p.status === 'Assigned') patch.status = 'Pending Assignment';
  if (!next && p.status === 'New Brief Received') patch.status = 'Pending Assignment';
  update('projects', id, patch);
  if (next && !next.is_owner) update('team_members', next.id, { last_assigned_at: nowIso() });

  const why = reason || (actor === 'you' ? 'Changed manually' : actor === 'sheet' ? 'Assignee specified in Google Sheet' : 'Auto-assigned');
  insert('assignments', { project_id: id, from_member_id: prev?.id ?? null, to_member_id: next?.id ?? null, mode: nextMode, reason: why, actor, created_at: nowIso() });
  const fromTxt = prev ? prev.name : 'Unassigned', toTxt = next ? next.name : nextMode === 'locked' ? 'Do not auto-assign' : 'Unassigned';
  log(prev ? 'reassigned' : 'assigned', prev || actor === 'you' ? `Assignment changed: ${fromTxt} → ${toTxt}` : `Assigned to ${toTxt} — ${why}`, { actor, projectId: id, meta: { from: prev?.id, to: next?.id, mode: nextMode } });

  const result = { noop: false, project: getProject(id), prev, next, emails: 0 };
  const fresh = result.project;
  const by = s.workspace.owner_name;
  // email the new teammate
  if (next && !next.is_owner && s.email.notify_assignee) {
    const mail = prev ? T.reassignedToEmail(fresh, next, prev, by) : T.assignmentEmail(fresh, next);
    const r = await sendEmail({ to: next.email, toName: next.name, kind: prev ? 'reassigned_to' : 'assignment', projectId: id, ...mail });
    if (r.ok) {
      result.emails++;
      run('UPDATE assignments SET emailed=1 WHERE id=(SELECT MAX(id) FROM assignments WHERE project_id=?)', id);
      if (!quiet) await notify('assignment_confirmation', { title: `Assignment email sent to ${next.name}`, body: `${fresh.name} — ${r.simulated ? 'simulated delivery' : 'delivered via Gmail'} to ${next.email}`, projectId: id });
    } else if (!quiet) await notify('assignment_confirmation', { title: `Could not email ${next.name}`, body: r.error, severity: 'warning', projectId: id, force: true });
  }
  // tell the previous teammate it moved
  if (prev && !prev.is_owner && prev.id !== next?.id && s.email.notify_previous_assignee && s.overrides.notify_previous_on_manual) {
    const r = await sendEmail({ to: prev.email, toName: prev.name, kind: 'reassigned_from', projectId: id, ...T.reassignedFromEmail(fresh, prev, next, by) });
    if (r.ok) result.emails++;
  }
  if (!quiet && (prev || actor === 'you')) {
    await notify('reassigned', { title: `${fresh.name}: ${fromTxt} → ${toTxt}`, body: `${ASSIGN_MODE_LABEL[nextMode]} · ${why}`, projectId: id });
  }
  return result;
}

/** Plan (dry-run) or execute automatic distribution of every unassigned, non-locked project. */
export async function autoAssignPending({ dryRun = false, actor = 'system', ids = null } = {}) {
  const s = getSettings();
  let pending = all(`SELECT id,name,priority,deadline,type,brand FROM projects WHERE assignee_id IS NULL AND assign_mode!='locked' AND status!='Completed' AND removed_from_sheet=0`);
  if (ids) pending = pending.filter((p) => ids.includes(p.id));
  const members = allMembers().filter((m) => !m.is_owner);
  const plan = planAssignments({
    projects: pending, members, loads: memberLoads(),
    options: { strategy: s.assign.strategy, weightByPriority: s.assign.weight_by_priority, preferenceTolerance: s.assign.preference_tolerance, skipUnavailable: s.assign.skip_unavailable, defaultMaxActive: s.assign.default_max_active, today: today() },
  });
  const byId = Object.fromEntries(pending.map((p) => [p.id, p]));
  const byMember = Object.fromEntries(members.map((m) => [m.id, m]));
  const view = {
    pending: pending.length,
    assignments: plan.assignments.map((a) => ({ ...a, projectName: byId[a.projectId].name, priority: byId[a.projectId].priority, deadline: byId[a.projectId].deadline, memberName: byMember[a.memberId].name })),
    unassigned: plan.unassigned.map((u) => ({ ...u, projectName: byId[u.projectId].name })),
    loadsAfter: Object.entries(plan.loadsAfter).map(([id, l]) => ({ memberId: +id, name: byMember[id].name, ...l, skipped: plan.skippedMembers[id] || null })),
    strategy: s.assign.strategy,
  };
  if (dryRun || !pending.length) return { ...view, applied: false, emails: 0 };

  let emails = 0;
  for (const a of plan.assignments) {
    const r = await assignProject(a.projectId, a.memberId, { mode: 'auto', actor, reason: a.reason, quiet: false });
    emails += r.emails || 0;
    update('projects', a.projectId, { auto_reason: a.reason });
  }
  if (plan.assignments.length) {
    const counts = {};
    for (const a of view.assignments) counts[a.memberName] = (counts[a.memberName] || 0) + 1;
    const summary = Object.entries(counts).map(([n, c]) => `${n.split(' ')[0]} ${c}`).join(' · ');
    await notify('auto_assigned', { title: `${plan.assignments.length} project${plan.assignments.length > 1 ? 's' : ''} auto-assigned`, body: summary, meta: { counts }, severity: 'success' });
    log('auto_assign', `Auto-assigned ${plan.assignments.length} projects (${summary})`, { actor, meta: { counts } });
  }
  if (plan.unassigned.length) {
    const names = view.unassigned.map((u) => u.projectName);
    await notify('assign_failed', {
      title: `${plan.unassigned.length} project${plan.unassigned.length > 1 ? 's' : ''} could not be auto-assigned`, body: `${names.slice(0, 4).join(', ')}${names.length > 4 ? '…' : ''} — ${plan.unassigned[0].reason}`, severity: 'warning',
      meta: { ids: plan.unassigned.map((u) => u.projectId) },
      email: T.alertEmail({ title: `${plan.unassigned.length} project(s) could not be auto-assigned`, intro: plan.unassigned[0].reason, rows: view.unassigned.slice(0, 10).map((u) => [u.projectName, 'Needs manual assignment']), cta: { label: 'Open assignments', url: `${process.env.APP_URL || 'http://localhost:3000'}/#/assignments` } }),
    });
    for (const u of plan.unassigned) {
      const pr = getProject(u.projectId);
      if (pr.status === 'New Brief Received') update('projects', u.projectId, { status: 'Pending Assignment' });
    }
  }
  return { ...view, applied: true, emails };
}
