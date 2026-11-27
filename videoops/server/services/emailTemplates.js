import { esc, fmtDate, fmtDuration, monthLabel } from '../util.js';
import { getSettings } from '../settings.js';
import { sheetLink } from '../integrations/sheetSource.js';

const appUrl = () => process.env.APP_URL || 'http://localhost:3000';

export function projectVars(project, member, extra = {}) {
  const s = getSettings();
  const links = (project.links || []);
  return {
    teammate_name: member?.name?.split(' ')[0] || 'there',
    project_name: project.name, project_code: project.code, project_type: project.type || 'AI Video Production',
    brand: project.brand || '—', deadline: project.deadline ? fmtDate(project.deadline) : 'Not specified', priority: project.priority,
    brief: project.brief || 'No brief provided yet — please check with the project manager.',
    reference_links: links.length ? links.join('\n   ') : 'None provided',
    sheet_link: sheetLink(project), dashboard_link: `${appUrl()}/#/projects/${project.id}`,
    duration: fmtDuration(project.duration_sec), month: monthLabel(project.month), owner_name: s.workspace.owner_name, ...extra,
  };
}
export const fill = (tpl, vars) => String(tpl).replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k) => (vars[k] ?? ''));

const linkify = (s) => esc(s).replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" style="color:#b45309;text-decoration:underline">$1</a>');

export function layout({ title, preheader = '', body, cta }) {
  const s = getSettings();
  return `<!doctype html><html><body style="margin:0;background:#f4f4f2;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#1c1c1e">
<span style="display:none;opacity:0;height:0;overflow:hidden">${esc(preheader)}</span>
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f2;padding:28px 12px"><tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#fff;border-radius:14px;overflow:hidden;border:1px solid #e6e6e1">
<tr><td style="background:#0d0e11;padding:18px 28px"><span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:#ffb454;margin-right:10px"></span><span style="color:#f2f2f0;font-weight:600;letter-spacing:.2px;font-size:15px">${esc(s.email.from_name)}</span><span style="color:#8b8f99;font-size:12px;float:right;line-height:22px">${esc(title)}</span></td></tr>
<tr><td style="padding:28px;font-size:15px;line-height:1.6">${body}
${cta ? `<p style="margin:26px 0 4px"><a href="${esc(cta.url)}" style="background:#0d0e11;color:#fff;text-decoration:none;padding:11px 20px;border-radius:9px;font-weight:600;font-size:14px;display:inline-block">${esc(cta.label)}</a></p>` : ''}
</td></tr>
<tr><td style="padding:16px 28px;background:#fafaf8;border-top:1px solid #eee;color:#8a8a85;font-size:12px">Sent automatically by ${esc(s.email.from_name)} · AI Video Production Hub</td></tr>
</table></td></tr></table></body></html>`;
}

const detailsTable = (rows) => `<table cellpadding="0" cellspacing="0" style="width:100%;border:1px solid #ececE7;border-radius:10px;border-collapse:separate;margin:10px 0 16px">${rows.map(([k, v], i) => `<tr><td style="padding:9px 14px;width:34%;color:#6b6b66;font-size:13px;vertical-align:top;${i ? 'border-top:1px solid #f0f0ec' : ''}">${esc(k)}</td><td style="padding:9px 14px;font-size:14px;${i ? 'border-top:1px solid #f0f0ec' : ''}">${linkify(v).replace(/\n\s*/g, '<br>')}</td></tr>`).join('')}</table>`;

/** Render the editable plain-text template into branded HTML (bullets "- Label: value" become a table). */
export function renderTemplateHtml(text) {
  const blocks = [];
  let rows = [];
  const flush = () => { if (rows.length) { blocks.push(detailsTable(rows)); rows = []; } };
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const m = line.match(/^\s*[-•]\s*([^:]{1,40}):\s*(.*)$/);
    if (m) {
      let val = m[2];
      while (i + 1 < lines.length && /^\s{2,}\S/.test(lines[i + 1])) val += '\n' + lines[++i].trim();
      rows.push([m[1], val]);
    } else {
      flush();
      if (line.trim()) blocks.push(`<p style="margin:0 0 12px">${linkify(line)}</p>`);
    }
  }
  flush();
  return blocks.join('');
}

export function assignmentEmail(project, member) {
  const s = getSettings();
  const vars = projectVars(project, member);
  const text = fill(s.email.assignment_body, vars);
  return {
    subject: fill(s.email.assignment_subject, vars), text,
    html: layout({ title: 'New assignment', preheader: `${project.name} — due ${vars.deadline}`, body: renderTemplateHtml(text), cta: { label: 'Open project', url: vars.dashboard_link } }),
  };
}

export function reassignedToEmail(project, member, prev, by) {
  const v = projectVars(project, member);
  const rows = [['Project', project.name], ['Type', v.project_type], ['Deadline', v.deadline], ['Priority', project.priority], ['Brief', v.brief], ['Reference links', v.reference_links], ['Google Sheet', v.sheet_link]];
  const text = `Hi ${v.teammate_name},\n\n"${project.name}" has been reassigned to you${prev ? ` (previously with ${prev.name})` : ''}.\n\n${rows.map(([k, x]) => `- ${k}: ${x}`).join('\n')}\n\nThanks,\n${by}`;
  return {
    subject: `Project Reassigned to You – ${project.name}`, text,
    html: layout({ title: 'Reassigned to you', body: `<p style="margin:0 0 12px">Hi ${esc(v.teammate_name)},</p><p style="margin:0 0 12px"><b>${esc(project.name)}</b> has been reassigned to you${prev ? ` — it was previously with ${esc(prev.name)}` : ''}.</p>${detailsTable(rows)}<p style="margin:0">Thanks,<br>${esc(by)}</p>`, cta: { label: 'Open project', url: v.dashboard_link } }),
  };
}

export function reassignedFromEmail(project, prev, next, by) {
  const first = prev.name.split(' ')[0];
  const text = `Hi ${first},\n\n"${project.name}" (due ${project.deadline ? fmtDate(project.deadline) : 'TBD'}) has been reassigned to ${next ? next.name : 'another teammate'}. You don't need to take any further action on it, and it has been removed from your workload.\n\nThanks,\n${by}`;
  return {
    subject: `Project Reassigned – ${project.name}`, text,
    html: layout({ title: 'Project reassigned', body: `<p style="margin:0 0 12px">Hi ${esc(first)},</p><p style="margin:0 0 12px"><b>${esc(project.name)}</b> (due ${esc(project.deadline ? fmtDate(project.deadline) : 'TBD')}) has been reassigned to <b>${esc(next ? next.name : 'another teammate')}</b>.</p><p style="margin:0 0 12px">No further action is needed from you — it has been removed from your workload.</p><p style="margin:0">Thanks,<br>${esc(by)}</p>` }),
  };
}

export function newBriefsEmail(groups, flagged) {
  const total = groups.reduce((n, g) => n + g.projects.length, 0);
  const body = [`<p style="margin:0 0 12px">${total} new project brief${total > 1 ? 's were' : ' was'} detected in your Google Sheet and imported into the dashboard.</p>`];
  const textLines = [`${total} new project brief(s) detected in your Google Sheet.`, ''];
  for (const g of groups) {
    body.push(`<p style="margin:18px 0 6px;font-weight:600">${esc(g.label)} · ${g.projects.length} project${g.projects.length > 1 ? 's' : ''}</p>`);
    body.push(detailsTable(g.projects.slice(0, 12).map((p) => [p.name, `${p.type || 'Type TBD'} · due ${p.deadline ? fmtDate(p.deadline) : 'TBD'} · ${p.priority}`])));
    if (g.projects.length > 12) body.push(`<p style="color:#6b6b66;margin:0 0 8px">…and ${g.projects.length - 12} more</p>`);
    textLines.push(`${g.label} (${g.projects.length})`, ...g.projects.map((p) => `- ${p.name} — ${p.type || 'type TBD'}, due ${p.deadline ? fmtDate(p.deadline) : 'TBD'}, ${p.priority}`), '');
  }
  if (flagged.length) {
    body.push(`<p style="margin:18px 0 6px;font-weight:600;color:#b45309">⚠ ${flagged.length} brief${flagged.length > 1 ? 's need' : ' needs'} attention</p>`);
    body.push(detailsTable(flagged.slice(0, 12).map((p) => [p.name, p.flags.map((f) => f.label).join(', ')])));
    textLines.push('Needs attention:', ...flagged.map((p) => `- ${p.name}: ${p.flags.map((f) => f.label).join(', ')}`));
  }
  body.push('<p style="margin:14px 0 0;color:#6b6b66;font-size:13px">Projects without a teammate are being distributed automatically — you\'ll find the assignments in the dashboard.</p>');
  return { subject: `New briefs received – ${groups.map((g) => g.label).join(', ')} (${total} project${total > 1 ? 's' : ''})`, text: textLines.join('\n'), html: layout({ title: 'New briefs', preheader: `${total} new briefs imported`, body: body.join(''), cta: { label: 'Review in dashboard', url: `${appUrl()}/#/monthly` } }) };
}

export function changeEmail(project, changes) {
  const when = new Date().toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
  const rows = changes.flatMap((c) => [[`${c.label} — previous`, c.old_value || '(empty)'], [`${c.label} — updated`, c.new_value || '(empty)']]);
  const text = `Project Update Detected\nProject: ${project.name}\nChanges detected:\n${changes.map((c) => `- Previous ${c.label.toLowerCase()}: ${c.old_value || '(empty)'}\n- Updated ${c.label.toLowerCase()}: ${c.new_value || '(empty)'}`).join('\n')}\nTime of change: ${when}`;
  return {
    subject: `Project Update Detected – ${project.name}`, text,
    html: layout({ title: 'Sheet change detected', preheader: `${changes.length} change(s) in ${project.name}`, body: `<p style="margin:0 0 4px;font-weight:700;font-size:17px">Project Update Detected</p><p style="margin:0 0 12px;color:#6b6b66">Project: <b style="color:#1c1c1e">${esc(project.name)}</b></p><p style="margin:0">Changes detected:</p>${detailsTable(rows)}<p style="margin:0;color:#6b6b66;font-size:13px">Detected ${esc(when)}</p>`, cta: { label: 'View project & history', url: `${appUrl()}/#/projects/${project.id}` } }),
  };
}

export function changeDigestEmail(items) {
  const when = new Date().toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
  const body = [`<p style="margin:0 0 12px"><b>${items.length} projects</b> changed in your Google Sheet.</p>`];
  const text = [`${items.length} projects changed in your Google Sheet (${when}):`];
  for (const { project, changes } of items) {
    body.push(`<p style="margin:14px 0 4px;font-weight:600">${esc(project.name)}</p>`, detailsTable(changes.map((c) => [c.label, `${c.old_value || '(empty)'} → ${c.new_value || '(empty)'}`])));
    text.push(`\n${project.name}`, ...changes.map((c) => `- ${c.label}: ${c.old_value || '(empty)'} → ${c.new_value || '(empty)'}`));
  }
  return { subject: `Project Updates Detected – ${items.length} projects changed`, text: text.join('\n'), html: layout({ title: 'Sheet changes', body: body.join(''), cta: { label: 'Open change history', url: `${appUrl()}/#/changes` } }) };
}

export function reminderEmail(project, member, days) {
  const v = projectVars(project, member);
  const when = days < 0 ? `${-days} day${days === -1 ? '' : 's'} overdue` : days === 0 ? 'due today' : `due in ${days} day${days === 1 ? '' : 's'}`;
  const text = `Hi ${v.teammate_name},\n\nReminder: "${project.name}" is ${when} (deadline ${v.deadline}). Current status: ${project.status}.\n\nThanks`;
  return { subject: `${days < 0 ? 'Overdue' : 'Deadline reminder'} – ${project.name} (${when})`, text, html: layout({ title: 'Deadline reminder', body: `<p style="margin:0 0 12px">Hi ${esc(v.teammate_name)},</p><p style="margin:0 0 12px"><b>${esc(project.name)}</b> is <b>${when}</b>.</p>${detailsTable([['Deadline', v.deadline], ['Status', project.status], ['Priority', project.priority]])}`, cta: { label: 'Open project', url: v.dashboard_link } }) };
}

export function alertEmail({ title, intro, rows = [], cta }) {
  return {
    subject: title, text: `${title}\n\n${intro}\n${rows.map(([k, v]) => `- ${k}: ${v}`).join('\n')}`,
    html: layout({ title: 'Alert', body: `<p style="margin:0 0 6px;font-weight:700;font-size:17px">${esc(title)}</p><p style="margin:0 0 12px">${esc(intro)}</p>${rows.length ? detailsTable(rows) : ''}`, cta }),
  };
}
