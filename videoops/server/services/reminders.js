import { all, run, get } from '../db.js';
import { getSettings } from '../settings.js';
import { nowIso, today } from '../clock.js';
import { addDays, daysBetween, fmtDate } from '../util.js';
import { getMember, hydrate } from './projects.js';
import { notify, log } from './notify.js';
import { sendEmail } from './mailer.js';
import * as T from './emailTemplates.js';

export async function runReminders() {
  const s = getSettings();
  if (!s.reminders.enabled) return { dueSoon: 0, overdue: 0 };
  const t = today();
  const soon = addDays(t, s.reminders.days_before);
  const base = `removed_from_sheet=0 AND deadline IS NOT NULL AND status NOT IN ('Completed','On Hold')`;
  let dueSoon = 0, overdue = 0;
  const mark = (id, kind, day) => {
    if (get('SELECT 1 x FROM reminders WHERE project_id=? AND kind=? AND day=?', id, kind, day)) return false;
    run('INSERT INTO reminders(project_id,kind,day,created_at) VALUES(?,?,?,?)', id, kind, day, nowIso());
    return true;
  };
  const link = (p) => `${process.env.APP_URL || 'http://localhost:3000'}/#/projects/${p.id}`;
  for (const row of all(`SELECT * FROM projects WHERE ${base} AND deadline >= ? AND deadline <= ? ORDER BY deadline`, t, soon)) {
    const p = hydrate(row);
    if (!mark(p.id, 'due_soon', p.deadline)) continue;
    const days = daysBetween(t, p.deadline);
    const who = p.assignee_id ? getMember(p.assignee_id) : null;
    const when = days === 0 ? 'today' : days === 1 ? 'tomorrow' : `in ${days} days`;
    await notify('deadline_soon', { title: `Due ${when}: ${p.name}`, body: `${who ? who.name : 'Unassigned'} · ${p.status} · ${fmtDate(p.deadline)}`, severity: days <= 1 ? 'warning' : 'info', projectId: p.id, email: T.alertEmail({ title: `Deadline approaching – ${p.name}`, intro: `Due ${when} (${fmtDate(p.deadline)}).`, rows: [['Assigned to', who?.name || 'Unassigned'], ['Status', p.status], ['Priority', p.priority]], cta: { label: 'Open project', url: link(p) } }) });
    if (who && !who.is_owner && s.reminders.email_assignee) await sendEmail({ to: who.email, toName: who.name, kind: 'deadline_reminder', projectId: p.id, ...T.reminderEmail(p, who, days) });
    log('reminder', `Deadline reminder sent (${when})`, { actor: 'system', projectId: p.id });
    dueSoon++;
  }
  if (s.reminders.overdue_alerts) {
    for (const row of all(`SELECT * FROM projects WHERE ${base} AND deadline < ? ORDER BY deadline`, t)) {
      const p = hydrate(row);
      if (!mark(p.id, 'overdue', p.deadline)) continue;
      const days = daysBetween(p.deadline, t);
      const who = p.assignee_id ? getMember(p.assignee_id) : null;
      await notify('overdue', { title: `Overdue by ${days} day${days > 1 ? 's' : ''}: ${p.name}`, body: `${who ? who.name : 'Unassigned'} · ${p.status} · was due ${fmtDate(p.deadline)}`, severity: 'error', projectId: p.id, email: T.alertEmail({ title: `Project overdue – ${p.name}`, intro: `Overdue by ${days} day(s). Deadline was ${fmtDate(p.deadline)}.`, rows: [['Assigned to', who?.name || 'Unassigned'], ['Status', p.status]], cta: { label: 'Open project', url: link(p) } }) });
      if (who && !who.is_owner && s.reminders.email_assignee) await sendEmail({ to: who.email, toName: who.name, kind: 'overdue_reminder', projectId: p.id, ...T.reminderEmail(p, who, -days) });
      log('overdue', `Marked overdue (${days}d)`, { actor: 'system', projectId: p.id });
      overdue++;
    }
  }
  return { dueSoon, overdue };
}
