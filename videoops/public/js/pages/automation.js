import { h, api, act, icon, state, toggle, segmented, select, toast, field, avatar, go, debounce, refreshBootstrap } from '../core.js';

const DEFAULT_BODY = `Hi {{teammate_name}},

A new video production project has been assigned to you.

Project Details:
- Project Name: {{project_name}}
- Project Type: {{project_type}}
- Deadline: {{deadline}}
- Priority: {{priority}}
- Brief: {{brief}}
- Reference Links: {{reference_links}}
- Google Sheet: {{sheet_link}}

Please review the brief and begin working on the project.
You can access your assigned projects through the Project Management Dashboard: {{dashboard_link}}

Thanks,
{{owner_name}}`;
const DEFAULT_SUBJECT = 'New Video Project Assigned – {{project_name}}';
const VARS = ['teammate_name', 'project_name', 'project_code', 'project_type', 'brand', 'deadline', 'priority', 'brief', 'reference_links', 'sheet_link', 'dashboard_link', 'duration', 'month', 'owner_name'];
const FIELD_LABELS = { name: 'Project name', brand: 'Brand / campaign', type: 'Project type', brief: 'Brief / requirement', assets: 'Asset requirement (S/V/C/G)', duration: 'Video duration', deadline: 'Delivery date', priority: 'Priority', status: 'Project status', assignee: 'Assigned to', links: 'Reference links', product: 'Product information', month: 'Month', extra: 'Any other column' };

export default async function render(ctx) {
  const { root } = ctx;
  let S = structuredClone(state.settings);
  const savedEl = h('span', { class: 'saved dim' });
  let tmr;
  const save = async (patch) => {
    const r = await act(() => api.put('/api/settings', patch));
    if (!r) return;
    S = r; state.settings = r; refreshBootstrap();
    savedEl.replaceChildren(icon('check', 13), 'Saved'); savedEl.classList.add('show'); clearTimeout(tmr); tmr = setTimeout(() => savedEl.classList.remove('show'), 1800);
  };
  const set = (path, value) => { const patch = {}; let o = patch; const k = path.split('.'); k.slice(0, -1).forEach((p) => (o = o[p] = {})); o[k.at(-1)] = value; return save(patch); };

  const row = (label, desc, control, opts = {}) => h('div', { class: `a-row ${opts.stack ? 'stack' : ''}` }, h('div', { class: 'grow' }, h('div', { class: 'a-label' }, label), desc && h('div', { class: 'a-desc' }, desc)), control);
  const tg = (path, label) => toggle({ checked: path.split('.').reduce((o, k) => o?.[k], S), onChange: (v) => set(path, v), label });
  const section = (id, ico, title, desc, bodyEls, master) => {
    const body = h('div', { class: 'a-body' }, bodyEls);
    const sec = h('section', { class: 'card a-sec', id: `sec-${id}` },
      h('div', { class: 'a-head' }, h('div', { class: 'a-ico' }, icon(ico, 18)), h('div', { class: 'grow' }, h('h3', title), h('div', { class: 'dim', style: 'font-size:12.5px' }, desc)),
        master && h('div', { class: 'row gap-8' }, h('span', { class: `state-chip ${master.get() ? 'on' : ''}` }, master.get() ? 'Enabled' : 'Paused'), toggle({ checked: master.get(), onChange: (v) => { master.set(v); sec.classList.toggle('off', !v); sec.querySelector('.state-chip').textContent = v ? 'Enabled' : 'Paused'; sec.querySelector('.state-chip').classList.toggle('on', v); }, label: `${title} master switch` }))),
      body);
    if (master && !master.get()) sec.classList.add('off');
    return sec;
  };

  // ── monitoring
  const secMonitor = section('monitor', 'sheet', 'Google Sheets monitoring', 'Continuously watch the connected sheet for new monthly briefs and changes to existing projects.', [
    row('Sheet connection', state.mode.sheet === 'google' ? `Connected to “${S.integrations.sheet_title}”` : 'Using the built-in demo sheet. Connect your real Google Sheet to go live.', h('a', { class: 'btn sm', href: '#/integrations' }, icon('plug', 14), 'Manage connection')),
    row('Monitoring frequency', 'How often the platform checks the sheet. Manual “Sync now” is always available.', select([[1, 'Every minute'], [2, 'Every 2 minutes'], [5, 'Every 5 minutes'], [10, 'Every 10 minutes'], [15, 'Every 15 minutes'], [30, 'Every 30 minutes'], [60, 'Every hour']], S.monitor.interval_min, (v) => set('monitor.interval_min', +v), 'sm'), {}),
    row('Automatic project detection', 'Import new rows/tabs as projects, create the month workspace and email you a “new briefs received” summary.', tg('monitor.auto_detect')),
    row('Change detection', 'Compare every sync with the last known values and log + email exactly what changed.', tg('monitor.detect_changes')),
    state.mode.sheet === 'demo' && row('Instant sync after simulator edits', 'Demo only: when you edit the sheet simulator, sync right away so detection is visible live.', tg('monitor.autosync_on_sheet_edit')),
  ], { get: () => S.monitor.enabled, set: (v) => set('monitor.enabled', v) });

  // ── asset filter (S/V/C/G)
  const ASSETS = [['S', 'Static', 'Image / banner creatives'], ['V', 'Video', 'Edited video'], ['C', 'Carousel', 'Multi-card carousels'], ['G', 'GIF', 'Animated GIFs']];
  const codes = new Set(S.assets?.import_codes || ['V', 'G']);
  const assetGrid = h('div', { class: 'fields-grid', style: 'border-bottom:0' }, ASSETS.map(([k, l, d]) => h('label', { class: 'fchip' }, toggle({ checked: codes.has(k), label: l, onChange: async (v, e) => {
    if (v) codes.add(k); else codes.delete(k);
    if (!codes.size) { codes.add(k); e.target.checked = true; toast('Keep at least one asset type', { type: 'err' }); return; }
    await save({ assets: { import_codes: [...codes] } }); toast('Asset filter updated', { type: 'ok', sub: 'Applied on the next sync — click “Sync now” to see it' });
  } }), h('div', h('div', { style: 'font-weight:600' }, `${k} · ${l}`), h('div', { class: 'dim', style: 'font-size:11.5px' }, d)))));
  const secAssets = section('assets', 'film', 'Asset filter — what this team makes', 'The sheet’s Asset Requirement column uses codes like “2S, 1V, 1C, 1G”. Only rows containing a selected type are imported; the number next to each code is how many items are needed.', [
    h('div', { class: 'a-row stack' }, h('div', h('div', { class: 'a-label' }, 'Import rows that include'), h('div', { class: 'a-desc' }, 'S = static · V = video · C = carousel · G = GIF. Default for the video team: V and G. A “6S, 2V, 2C” row is imported and counts as 2 videos of work; a “4S, 2C” row is ignored.')), assetGrid),
  ]);

  // ── assignment
  const stratDesc = h('div', { class: 'a-desc' });
  const drawStrat = () => { stratDesc.textContent = S.assign.strategy === 'equal_batch' ? 'Every available teammate receives the same number of projects from each incoming batch (extras go to the lowest workload).' : 'Each project goes to whoever currently has the lowest total workload, so the whole team ends up balanced — existing projects included.'; };
  drawStrat();
  const secAssign = section('assign', 'shuffle', 'Automatic team assignment', 'Distribute unassigned projects fairly among available teammates — never blocked by missing information.', [
    h('div', { class: 'a-row stack' }, h('div', h('div', { class: 'a-label' }, 'Distribution rule'), stratDesc), segmented([['balance_total', 'Balance total workload'], ['equal_batch', 'Equal share of each batch']], S.assign.strategy, (v) => { S.assign.strategy = v; drawStrat(); set('assign.strategy', v); })),
    row('Balance workload by', 'Videos & GIFs: someone with a 3-video ask carries more than someone with a 1-video ask. Projects: every project counts the same.', select([['deliverables', 'Videos & GIFs to make'], ['projects', 'Number of projects']], S.assign.weight_mode, (v) => set('assign.weight_mode', v), 'sm')),
    row('Weight workload by priority', 'Urgent / High projects count more than Low ones when comparing workloads.', tg('assign.weight_by_priority')),
    row('Preference flexibility', 'Prefer teammates whose preferred types/brands match, if their workload is within this many projects of the lowest.', select([[0, 'Tie-break only (strict balance)'], [1, 'Within 1 project'], [2, 'Within 2 projects']], S.assign.preference_tolerance, (v) => set('assign.preference_tolerance', +v), 'sm')),
    row('Skip unavailable teammates', 'Never auto-assign to anyone marked unavailable or on leave.', tg('assign.skip_unavailable')),
    row('Respect assignments in the sheet', 'If the sheet’s “Assigned To” names a teammate, keep that person (the automation fills only the blanks).', tg('assign.respect_sheet_assignment')),
    row('Count “On Hold” projects in workload', 'Off by default — paused work does not take capacity.', tg('assign.count_on_hold')),
    row('Default max active projects', 'Optional capacity cap applied to everyone without a personal limit (leave empty for no cap).', h('input', { class: 'input sm', style: 'width:90px', type: 'number', min: 1, placeholder: '∞', value: S.assign.default_max_active ?? '', onChange: (e) => set('assign.default_max_active', e.target.value === '' ? null : +e.target.value) })),
  ], { get: () => S.assign.enabled, set: (v) => set('assign.enabled', v) });

  // ── availability
  const avail = state.team.filter((m) => !m.is_owner);
  const secAvail = section('availability', 'users', 'Teammate availability', 'Availability, leave dates, capacity caps and preferences are managed per teammate.', [
    h('div', { class: 'a-row stack' }, h('div', { class: 'avail-list' }, avail.map((m) => { const out = !m.enabled || m.availability === 'unavailable' || (m.leave_until && m.leave_until >= state.today); return h('div', { class: `avail ${out ? 'out' : ''}` }, avatar(m, 26, { off: out }), h('div', h('div', { style: 'font-weight:550' }, m.name.split(' ')[0]), h('div', { class: 'dim', style: 'font-size:11.5px' }, !m.enabled ? 'Auto-assign off' : m.availability === 'unavailable' ? 'Unavailable' : m.leave_until && m.leave_until >= state.today ? `Leave → ${m.leave_until.slice(5)}` : m.availability === 'limited' ? 'Limited (50%)' : `${m.active ?? 0} active`))); })),
      h('div', { class: 'row' }, h('a', { class: 'btn sm', href: '#/team' }, icon('users', 14), 'Open Team Management'))),
  ]);

  // ── overrides
  const secOver = section('overrides', 'lock', 'Manual override', 'You always have the final say. Manual choices are respected by every automation.', [
    row('Assignment controls', 'On any project you can pick a teammate, “Assign to me”, “Do not auto-assign”, or release it back to the automation.', h('span', { class: 'tag c', style: { '--c': 'var(--green)' } }, 'Always on')),
    row('Let the sheet override my manual assignments', 'Off (recommended): if you reassign a project in the app, later changes to “Assigned To” in the sheet are logged but ignored.', tg('overrides.sheet_can_override_manual')),
    row('Tell the previous teammate when a project moves', 'Email the person who loses a project so nobody keeps working on it.', tg('overrides.notify_previous_on_manual')),
  ]);

  // ── email + template
  const subj = h('input', { class: 'input', value: S.email.assignment_subject });
  const bodyTa = h('textarea', { class: 'textarea mono', style: 'min-height:300px;font-size:12.5px;line-height:1.6' }, S.email.assignment_body);
  const frame = h('iframe', { class: 'mail-frame', sandbox: '', style: 'height:430px' });
  const preview = debounce(async () => { const r = await api.post('/api/emails/preview', { assignment_subject: subj.value, assignment_body: bodyTa.value }).catch(() => null); if (r) { frame.srcdoc = r.html; pvSubject.textContent = r.subject; } }, 350);
  const pvSubject = h('div', { style: 'font-weight:600' });
  const saveTpl = debounce(() => save({ email: { assignment_subject: subj.value, assignment_body: bodyTa.value } }), 700);
  const onTpl = () => { preview(); saveTpl(); };
  subj.addEventListener('input', onTpl); bodyTa.addEventListener('input', onTpl);
  const insertVar = (v) => { const s = bodyTa.selectionStart ?? bodyTa.value.length; bodyTa.setRangeText(`{{${v}}}`, s, bodyTa.selectionEnd ?? s, 'end'); bodyTa.focus(); onTpl(); };
  const secEmail = section('email', 'mail', 'Gmail notifications & email templates', 'Teammates are emailed automatically when a project is assigned or moved.', [
    row('Email teammates on assignment', 'Send the assignment email (brief, deadline, links, sheet link) the moment a project is assigned.', tg('email.notify_assignee')),
    row('Email the previous teammate on reassignment', 'Tell them the project has moved and was removed from their workload.', tg('email.notify_previous_assignee')),
    row('Sender name', 'Shown as the “From” name on outgoing mail.', h('input', { class: 'input sm', style: 'width:200px', value: S.email.from_name, onChange: (e) => set('email.from_name', e.target.value) })),
    h('div', { class: 'a-row stack' }, h('div', h('div', { class: 'a-label' }, 'Assignment email template'), h('div', { class: 'a-desc' }, 'Edit the subject and body. Lines like “- Label: value” become the project details table. Click a variable to insert it.')),
      h('div', { class: 'tpl' }, h('div', { class: 'col gap-8' }, field('Subject', subj), field('Body', bodyTa),
        h('div', { class: 'row wrap gap-6' }, VARS.map((v) => h('button', { class: 'chip-f', onClick: () => insertVar(v) }, `{{${v}}}`))),
        h('div', h('button', { class: 'btn sm', onClick: () => { subj.value = DEFAULT_SUBJECT; bodyTa.value = DEFAULT_BODY; onTpl(); } }, icon('refresh', 13), 'Reset to default'))),
        h('div', { class: 'col gap-8' }, h('div', { class: 'eyebrow' }, 'Live preview — sample project'), h('div', { class: 'card', style: 'padding:10px 12px;background:var(--bg-2)' }, h('div', { class: 'dim', style: 'font-size:11.5px' }, 'Subject'), pvSubject), frame))),
  ]);
  preview();

  // ── notification prefs
  const prefRows = Object.entries(state.notifyTypes).map(([k, v]) => h('div', { class: 'pref-row' }, h('div', { class: 'grow' }, h('div', { class: 'a-label' }, v.label)),
    h('div', { class: 'pref-col' }, toggle({ checked: S.notify[k]?.app, onChange: (x) => set(`notify.${k}.app`, x), label: `${v.label} in-app` })),
    h('div', { class: 'pref-col' }, toggle({ checked: S.notify[k]?.email, onChange: (x) => set(`notify.${k}.email`, x), label: `${v.label} email` }))));
  const secNotify = section('notify', 'bell', 'Notification preferences', 'Choose which activities appear in the notification center and which also email you.', [
    h('div', { class: 'pref-head' }, h('div', { class: 'grow eyebrow' }, 'Activity'), h('div', { class: 'pref-col eyebrow' }, 'In-app'), h('div', { class: 'pref-col eyebrow' }, 'Email me')), ...prefRows,
    row('Your notification address', 'Owner emails (new briefs, sheet changes, alerts) go here. Change it in Settings.', h('span', { class: 'mono', style: 'font-size:12.5px' }, S.workspace.owner_email)),
  ]);

  // ── reminders
  const secRem = section('reminders', 'clock', 'Deadline reminders', 'Remind teammates (and you) before deadlines, and flag overdue work.', [
    row('Remind when due within', 'Sent once per project, with the assignee emailed directly.', h('div', { class: 'row gap-6' }, h('input', { class: 'input sm', style: 'width:70px', type: 'number', min: 0, max: 30, value: S.reminders.days_before, onChange: (e) => set('reminders.days_before', Math.max(0, +e.target.value || 0)) }), h('span', { class: 'dim' }, 'days'))),
    row('Email the assignee', 'Send the reminder to the assigned teammate’s Gmail.', tg('reminders.email_assignee')),
    row('Overdue alerts', 'Notify you (and the assignee) once when a project passes its deadline.', tg('reminders.overdue_alerts')),
    row('Run reminder check now', 'Reminders run automatically every 30 minutes.', h('button', { class: 'btn sm', onClick: async () => { const r = await act(() => api.post('/api/reminders/run')); if (r) toast('Reminder check complete', { type: 'ok', sub: `${r.dueSoon} due-soon · ${r.overdue} overdue newly flagged` }); } }, icon('play', 13), 'Run now')),
  ], { get: () => S.reminders.enabled, set: (v) => set('reminders.enabled', v) });

  // ── change detection
  const secDetect = section('detection', 'eye', 'Change detection rules', 'Choose which columns are tracked. Untracked columns still sync silently — they just won’t be logged or emailed.', [
    h('div', { class: 'fields-grid' }, Object.entries(FIELD_LABELS).map(([k, l]) => h('label', { class: 'fchip' }, toggle({ checked: S.change_detection.fields[k] !== false, onChange: (v) => set(`change_detection.fields.${k}`, v), label: l }), h('span', l)))),
    row('Ignore whitespace-only edits', 'Extra spaces or line breaks are not reported as changes.', tg('change_detection.ignore_whitespace')),
    row('Group emails above', 'If more than this many projects change in one sync, send a single digest email instead of one per project.', h('input', { class: 'input sm', style: 'width:70px', type: 'number', min: 1, max: 50, value: S.change_detection.email_digest_threshold, onChange: (e) => set('change_detection.email_digest_threshold', Math.max(1, +e.target.value || 5)) })),
  ]);

  const sections = [['monitor', 'Sheet monitoring', secMonitor], ['assets', 'Asset filter (S/V/C/G)', secAssets], ['assign', 'Team assignment', secAssign], ['availability', 'Availability', secAvail], ['overrides', 'Manual override', secOver], ['email', 'Gmail & templates', secEmail], ['notify', 'Notifications', secNotify], ['reminders', 'Deadline reminders', secRem], ['detection', 'Change detection', secDetect]];
  const nav = h('nav', { class: 'a-nav card' }, h('div', { class: 'eyebrow', style: 'padding:4px 10px 8px' }, 'Automations'), sections.map(([id, l]) => h('a', { href: `#/automation?section=${id}`, onClick: (e) => { e.preventDefault(); document.getElementById(`sec-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }); } }, l)));
  root.append(h('div', { class: 'page-h' }, h('div', h('h1', 'Automation Settings'), h('div', { class: 'sub' }, 'Every automation can be switched on or off on its own — changing one never affects the others. Changes save instantly.')), h('div', { class: 'actions' }, savedEl)),
    h('div', { class: 'a-layout' }, nav, h('div', { class: 'col gap-16', style: 'min-width:0' }, sections.map((s) => s[2]))));
  if (ctx.query.section) setTimeout(() => document.getElementById(`sec-${ctx.query.section}`)?.scrollIntoView({ block: 'start' }), 60);
  void go;
}
