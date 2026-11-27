import { h, api, act, icon, state, toast, confirmDialog, field, refreshBootstrap, debounce, STATUS_COLORS, PRIO_COLORS } from '../core.js';

export default async function render(ctx) {
  const { root } = ctx;
  const S = state.settings;
  const info = await api.get('/api/integrations');
  const savedEl = h('span', { class: 'saved dim' });
  let tmr;
  const save = async (patch) => { const r = await act(() => api.put('/api/settings', patch)); if (r) { state.settings = r; refreshBootstrap(); savedEl.replaceChildren(icon('check', 13), 'Saved'); savedEl.classList.add('show'); clearTimeout(tmr); tmr = setTimeout(() => savedEl.classList.remove('show'), 1600); } };
  const inp = (path, val, type = 'text') => h('input', { class: 'input', type, value: val, onChange: (e) => { const patch = {}; const k = path.split('.'); let o = patch; k.slice(0, -1).forEach((p) => (o = o[p] = {})); o[k.at(-1)] = e.target.value.trim(); save(patch); } });

  root.append(h('div', { class: 'page-h' }, h('div', h('h1', 'Settings'), h('div', { class: 'sub' }, 'Workspace profile, data and security.')), h('div', { class: 'actions' }, savedEl)),
    h('div', { class: 'grid', style: 'grid-template-columns:repeat(auto-fit,minmax(min(380px,100%),1fr));align-items:start' },
      h('section', { class: 'card' }, h('div', { class: 'card-h' }, h('h3', 'Workspace & owner')), h('div', { class: 'card-b col gap-12' },
        field('Workspace name', inp('workspace.name', S.workspace.name)),
        field('Your name', inp('workspace.owner_name', S.workspace.owner_name), 'Shown in emails sent to teammates as the sender/signature.'),
        field('Your email (notifications)', inp('workspace.owner_email', S.workspace.owner_email, 'email'), 'New-brief summaries, sheet-change alerts and warnings are sent here.'))),
      h('section', { class: 'card' }, h('div', { class: 'card-h' }, h('h3', 'Data')), h('div', { class: 'card-b col gap-12' },
        h('div', { class: 'a-row' }, h('div', { class: 'grow' }, h('div', { class: 'a-label' }, 'Export projects'), h('div', { class: 'a-desc' }, 'Download every project as CSV.')), h('a', { class: 'btn sm', href: '/api/export/projects.csv' }, icon('download', 14), 'Export CSV')),
        h('div', { class: 'a-row' }, h('div', { class: 'grow' }, h('div', { class: 'a-label' }, 'Reset demo data'), h('div', { class: 'a-desc' }, 'Rebuild the sample workspace (5 weeks of realistic history).')), h('button', { class: 'btn sm', onClick: async () => { if (await confirmDialog({ title: 'Reset demo data?', message: 'This rebuilds the demo workspace from scratch.', confirmLabel: 'Reset demo' })) { await act(() => api.post('/api/demo/reset'), 'Demo data restored'); await refreshBootstrap(); } } }, icon('refresh', 13), 'Reset demo')),
        h('div', { class: 'a-row' }, h('div', { class: 'grow' }, h('div', { class: 'a-label' }, 'Clear all data & start fresh'), h('div', { class: 'a-desc' }, 'Removes demo projects, teammates, history and notifications — use before connecting your real sheet. Settings and Google connection are kept.')), h('button', { class: 'btn sm danger', onClick: async () => { if (await confirmDialog({ title: 'Clear all data?', message: 'All projects, teammates, assignments, notifications, emails and history will be permanently deleted. You will then add your team and connect your sheet.', confirmLabel: 'Delete everything', danger: true })) { await act(() => api.post('/api/workspace/clear'), 'Workspace cleared'); await refreshBootstrap(); location.hash = '#/team?add=1'; } } }, icon('trash', 13), 'Clear data')))),
      h('section', { class: 'card' }, h('div', { class: 'card-h' }, h('h3', 'Security & access')), h('div', { class: 'card-b col gap-8' },
        item('shield', 'Google OAuth 2.0 sign-in', info.googleConfigured ? 'Enabled — only allowed accounts can open this workspace.' : 'Not configured — running as a single-user demo workspace.'),
        item('lock', 'Least-privilege scopes', 'Sheets: read-only · Gmail: send-only. The app can’t read your inbox or edit your sheet.'),
        item('shield', 'Tokens encrypted at rest', 'Refresh tokens are sealed with AES-256-GCM using SESSION_SECRET and never reach the browser.'),
        item('history', 'Everything is logged', 'Every automated action is written to the activity log, change history and sync log.'))),
      h('section', { class: 'card' }, h('div', { class: 'card-h' }, h('h3', 'Reference')), h('div', { class: 'card-b col gap-12' },
        h('div', h('div', { class: 'eyebrow mb-8' }, 'Project statuses'), h('div', { class: 'row wrap gap-6' }, state.statuses.map((s) => h('span', { class: 'pill', style: { '--c': STATUS_COLORS[s] } }, s)))),
        h('div', h('div', { class: 'eyebrow mb-8' }, 'Priorities'), h('div', { class: 'row wrap gap-6' }, state.priorities.map((p) => h('span', { class: 'pill', style: { '--c': PRIO_COLORS[p] } }, p)))),
        h('div', h('div', { class: 'eyebrow mb-8' }, 'Keyboard'), h('div', { class: 'row gap-8' }, h('span', { class: 'kbd' }, '⌘ / Ctrl + K'), h('span', { class: 'muted' }, 'Search projects and run commands'))),
        h('div', { class: 'dim', style: 'font-size:12px' }, `Theme: dark (cinematic) · Timezone follows your browser · Version 1.0`)))));
  void debounce;
}
const item = (ico, t, d) => h('div', { class: 'row gap-12', style: 'align-items:flex-start' }, h('div', { class: 'a-ico sm' }, icon(ico, 15)), h('div', h('div', { class: 'a-label' }, t), h('div', { class: 'a-desc' }, d)));
