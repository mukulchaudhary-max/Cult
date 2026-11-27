import { all, get } from '../db.js';
import { today } from '../clock.js';
import { addDays, daysBetween, monthLabel } from '../util.js';
import { getSettings } from '../settings.js';
import { STATUSES, PRIORITIES } from '../constants.js';
import { allMembers, memberLoads } from './projects.js';
import { balanceScore } from '../engine/assign.js';

export function counters(where = '1=1', params = []) {
  const t = today();
  const soon = addDays(t, getSettings().reminders.days_before + 1);
  const one = (sql, ...p) => get(`SELECT COUNT(*) n FROM projects WHERE removed_from_sheet=0 AND ${where} AND ${sql}`, ...params, ...p).n;
  return {
    total: one('1=1'),
    new_briefs: one(`brief_received_at >= ?`, addDays(t, -7)),
    assigned: one('assignee_id IS NOT NULL'),
    unassigned: one(`assignee_id IS NULL AND status!='Completed'`),
    in_progress: one(`status='In Progress'`),
    review: one(`status IN ('Review','Changes Required')`),
    completed: one(`status='Completed'`),
    overdue: one(`deadline IS NOT NULL AND deadline < ? AND status NOT IN ('Completed','On Hold')`, t),
    due_soon: one(`deadline IS NOT NULL AND deadline >= ? AND deadline < ? AND status NOT IN ('Completed','On Hold')`, t, soon),
    pending: one(`status IN ('New Brief Received','Pending Assignment')`),
    flagged: one(`flags != '[]' AND status!='Completed'`),
  };
}

export function dashboard() {
  const t = today();
  const base = `removed_from_sheet=0`;
  const by = (col) => all(`SELECT ${col} k, COUNT(*) n FROM projects WHERE ${base} GROUP BY ${col}`);
  const statusMap = Object.fromEntries(by('status').map((r) => [r.k, r.n]));
  const prioMap = Object.fromEntries(by('priority').map((r) => [r.k, r.n]));
  const months = all(`SELECT month k, COUNT(*) n, SUM(status='Completed') done FROM projects WHERE ${base} GROUP BY month ORDER BY month`).map((r) => ({ key: r.k, label: monthLabel(r.k), total: r.n, completed: r.done || 0 }));
  const members = allMembers().filter((m) => !m.is_owner);
  const loads = memberLoads();
  const team = members.map((m) => {
    const rows = all(`SELECT status, COUNT(*) n FROM projects WHERE ${base} AND assignee_id=? GROUP BY status`, m.id);
    const st = Object.fromEntries(rows.map((r) => [r.status, r.n]));
    return { id: m.id, name: m.name, color: m.color, active: loads[m.id]?.count || 0, completed: st['Completed'] || 0, byStatus: st, available: m.enabled && m.availability !== 'unavailable' && !(m.leave_until && m.leave_until >= t) };
  });
  const me = allMembers().find((x) => x.is_owner);
  if (me) {
    const l = loads[me.id]?.count || 0;
    if (l) {
      const st = Object.fromEntries(all(`SELECT status, COUNT(*) n FROM projects WHERE ${base} AND assignee_id=? GROUP BY status`, me.id).map((r) => [r.status, r.n]));
      team.push({ id: me.id, name: `${me.name} (you)`, color: me.color, active: l, completed: st['Completed'] || 0, byStatus: st, available: true, owner: true });
    }
  }
  const upcoming = all(`SELECT p.id, p.code, p.name, p.deadline, p.priority, p.status, p.assignee_id, m.name assignee FROM projects p LEFT JOIN team_members m ON m.id=p.assignee_id
    WHERE p.removed_from_sheet=0 AND p.deadline IS NOT NULL AND p.status NOT IN ('Completed','On Hold') ORDER BY p.deadline LIMIT 40`)
    .map((r) => ({ ...r, days: daysBetween(t, r.deadline) })).filter((r) => r.days <= 14).slice(0, 8);
  const runs = get(`SELECT COUNT(*) n, SUM(changes) ch, SUM(created) cr, SUM(assigned) asg, SUM(emails) em FROM sync_runs WHERE status='success'`);
  const autoAssigned = get(`SELECT COUNT(*) n FROM assignments WHERE mode IN ('auto','sheet') AND actor!='you'`).n;
  const manualAssigned = get(`SELECT COUNT(*) n FROM assignments WHERE actor='you'`).n;
  const emailsSent = get(`SELECT COUNT(*) n FROM emails WHERE status IN ('sent','simulated')`).n;
  const changesCaught = get(`SELECT COUNT(*) n FROM changes WHERE source='sheet'`).n;
  const lastRun = get(`SELECT * FROM sync_runs ORDER BY id DESC LIMIT 1`);
  const imported = get(`SELECT COUNT(*) n FROM projects`).n;
  // time-saved estimate: 4 min to triage+assign+brief a project by hand, 2 min per detected change, 1.5 min per email
  const minutesSaved = Math.round(imported * 4 + changesCaught * 2 + emailsSent * 1.5);
  return {
    counters: counters(),
    byStatus: STATUSES.map((s) => ({ key: s, n: statusMap[s] || 0 })),
    byPriority: PRIORITIES.map((p) => ({ key: p, n: prioMap[p] || 0 })),
    byMonth: months,
    byTeammate: team,
    balance: balanceScore(team.filter((x) => x.available && !x.owner).map((x) => x.active)),
    upcoming,
    impact: { minutesSaved, autoAssigned, manualAssigned, autoRate: autoAssigned + manualAssigned ? Math.round((autoAssigned / (autoAssigned + manualAssigned)) * 100) : 100, emailsSent, changesCaught, syncRuns: runs.n || 0, imported },
    lastRun,
    syncing: false,
  };
}

export function monthDetail(key) {
  const where = `month=?`;
  const c = counters(where, [key]);
  const t = today();
  const projects = all(`SELECT p.*, m.name assignee_name FROM projects p LEFT JOIN team_members m ON m.id=p.assignee_id WHERE p.removed_from_sheet=0 AND p.month=? ORDER BY p.deadline IS NULL, p.deadline`, key);
  const team = all(`SELECT m.id, m.name, m.color, COUNT(p.id) total, SUM(p.status='Completed') done FROM team_members m JOIN projects p ON p.assignee_id=m.id AND p.month=? AND p.removed_from_sheet=0 GROUP BY m.id ORDER BY total DESC`, key);
  const weeks = {};
  for (const p of projects) {
    if (!p.deadline) continue;
    const d = new Date(p.deadline + 'T00:00:00Z'); const dow = (d.getUTCDay() + 6) % 7;
    const mon = addDays(p.deadline, -dow);
    (weeks[mon] ||= []).push({ id: p.id, code: p.code, name: p.name, deadline: p.deadline, status: p.status, priority: p.priority, assignee: p.assignee_name, overdue: p.deadline < t && p.status !== 'Completed' });
  }
  return {
    key, label: monthLabel(key), counters: c, completion: c.total ? Math.round((c.completed / c.total) * 100) : 0,
    team, weeks: Object.entries(weeks).sort().map(([start, items]) => ({ start, items })),
    byStatus: STATUSES.map((s) => ({ key: s, n: projects.filter((p) => p.status === s).length })),
    createdAt: get('SELECT created_at FROM months WHERE key=?', key)?.created_at,
  };
}

export function monthsSummary() {
  const rows = all(`SELECT month k, COUNT(*) total, SUM(status='Completed') done, SUM(assignee_id IS NOT NULL) assigned, SUM(status='In Progress') prog, MAX(brief_received_at) last_received
    FROM projects WHERE removed_from_sheet=0 AND month IS NOT NULL GROUP BY month ORDER BY month DESC`);
  return rows.map((r) => ({ key: r.k, label: monthLabel(r.k), total: r.total, completed: r.done || 0, assigned: r.assigned || 0, in_progress: r.prog || 0, lastReceived: r.last_received, completion: r.total ? Math.round(((r.done || 0) / r.total) * 100) : 0 }));
}
