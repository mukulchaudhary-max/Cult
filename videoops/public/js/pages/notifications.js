import { h, api, act, icon, fmt, state, go, modal, toast, liveOn, empty, clear, refreshBootstrap, debounce } from '../core.js';

const TYPE_META = {
  new_briefs: ['inbox', 'var(--green)'], project_added: ['plus', 'var(--blue)'], sheet_change: ['sheet', 'var(--accent)'], auto_assigned: ['shuffle', 'var(--teal)'],
  reassigned: ['users', 'var(--violet)'], deadline_soon: ['clock', 'var(--amber)'], overdue: ['alert', 'var(--coral)'], status_update: ['target', 'var(--blue)'],
  assignment_confirmation: ['mail', 'var(--green)'], missing_info: ['flag', 'var(--amber)'], assign_failed: ['alert', 'var(--red)'], sync_error: ['alert', 'var(--red)'],
};
const ACT_ICON = { project_created: 'plus', assigned: 'user', reassigned: 'shuffle', auto_assign: 'zap', status_changed: 'target', field_changed: 'edit', sheet_change: 'sheet', comment: 'message', reminder: 'clock', overdue: 'alert', flagged: 'flag', removed_from_sheet: 'trash', restored: 'refresh', month_created: 'calendar', team_added: 'users', team_updated: 'users', team_removed: 'users', duplicate_row: 'copy', sync_failed: 'alert', google_connected: 'plug', sheet_connected: 'sheet' };

const cut = (v) => (!v ? '(empty)' : v.length > 70 ? `${v.slice(0, 68)}…` : v);

export default async function render(ctx) {
  const { root } = ctx;
  let tab = ctx.query.tab || 'inbox', type = ctx.query.type || '', unreadOnly = false, data = null, emailKind = '', actKind = '';
  const body = h('div');
  const head = h('div', { class: 'page-h' }, h('div', h('h1', 'Notifications'), h('div', { class: 'sub' }, 'Everything the automation does, in one place — briefs detected, sheet changes, assignments, reminders and every email sent.')),
    h('div', { class: 'actions' },
      h('button', { class: 'btn', onClick: async () => { await act(() => api.post('/api/notifications/read', { all: true })); state.unread = 0; refreshBootstrap(); load(); } }, icon('check', 15), 'Mark all read'),
      h('a', { class: 'btn', href: '#/automation?section=notify' }, icon('settings', 15), 'Preferences')));
  const tabsEl = h('div', { class: 'tabs mb-16' });
  root.append(head, tabsEl, body);

  const drawTabs = () => {
    clear(tabsEl);
    [['inbox', 'Notifications', data?.unread], ['emails', 'Email outbox'], ['log', 'Automation log']].forEach(([id, label, n]) =>
      tabsEl.append(h('button', { class: tab === id ? 'on' : '', onClick: () => { tab = id; drawTabs(); load(); } }, label, n ? h('span', { class: 'count' }, n) : null)));
  };

  async function load() {
    if (tab === 'inbox') return loadInbox(); if (tab === 'emails') return loadEmails(); return loadLog();
  }

  async function loadInbox() {
    data = await api.get(`/api/notifications${api.qs({ type, unread: unreadOnly ? 1 : '', limit: 100 })}`);
    state.unread = data.unread; drawTabs();
    const chips = h('div', { class: 'row wrap gap-6 mb-16' },
      h('button', { class: `chip-f ${!type && !unreadOnly ? 'on' : ''}`, onClick: () => { type = ''; unreadOnly = false; load(); } }, 'All'),
      h('button', { class: `chip-f ${unreadOnly ? 'on' : ''}`, onClick: () => { unreadOnly = !unreadOnly; load(); } }, 'Unread', h('b', data.unread)),
      Object.entries(state.notifyTypes).filter(([k]) => data.typeCounts[k]).map(([k, v]) => h('button', { class: `chip-f ${type === k ? 'on' : ''}`, onClick: () => { type = type === k ? '' : k; load(); } }, h('i', { style: { background: (TYPE_META[k] || [])[1] } }), v.label, h('b', data.typeCounts[k]))));
    const list = h('div', { class: 'card flush feed' });
    if (!data.items.length) list.append(empty('bell', 'No notifications here', 'New briefs, sheet changes and assignments will show up as they happen.'));
    let lastDay = '';
    for (const n of data.items) {
      const day = n.created_at.slice(0, 10);
      if (day !== lastDay) { lastDay = day; list.append(h('div', { class: 'day-sep' }, day === state.today ? 'Today' : fmt.dateLong(day))); }
      const [ico, color] = TYPE_META[n.type] || ['bell', 'var(--gray)'];
      const diffs = n.type === 'sheet_change' && n.meta?.changes ? n.meta.changes.slice(0, 3) : null;
      const el = h('div', { class: `notif ${n.read ? '' : 'unread'} sev-${n.severity}`, onClick: async () => { if (!n.read) { api.post('/api/notifications/read', { ids: [n.id] }); n.read = 1; state.unread = Math.max(0, state.unread - 1); refreshBootstrap(); el.classList.remove('unread'); } if (n.project_id) go(`#/projects/${n.project_id}`); else if (n.meta?.month) go(`#/monthly/${n.meta.month}`); else if (n.type === 'auto_assigned' || n.type === 'assign_failed') go('#/assignments'); else if (n.type === 'sync_error') go('#/changes?tab=sync'); } },
        h('div', { class: 'n-ico', style: { '--c': color } }, icon(ico, 16)),
        h('div', { class: 'grow', style: 'min-width:0' },
          h('div', { class: 'row gap-8' }, h('div', { class: 'n-title' }, n.title), !n.read && h('i', { class: 'udot' })),
          n.body && h('div', { class: 'muted n-body' }, n.body),
          diffs && h('div', { class: 'n-diffs' }, diffs.map((c) => h('div', { class: 'row gap-8 wrap' }, h('span', { class: 'tag' }, c.label), h('span', { class: 'old' }, cut(c.old_value)), icon('arrow', 12), h('span', { class: 'new' }, cut(c.new_value)), c.applied === 0 && h('span', { class: 'tag c', style: { '--c': 'var(--gray)' } }, 'ignored'))))),
        h('div', { class: 'n-time dim', 'data-tip': fmt.timeLong(n.created_at) }, fmt.rel(n.created_at)));
      list.append(el);
    }
    clear(body).append(chips, list);
  }

  async function loadEmails() {
    const emails = await api.get(`/api/emails${api.qs({ kind: emailKind, limit: 150 })}`);
    const kinds = [['', 'All'], ['assignment', 'Assignments'], ['reassigned', 'Reassignments'], ['owner_', 'To me'], ['deadline_reminder', 'Reminders']];
    const STAT = { sent: ['Sent', 'var(--green)'], simulated: ['Simulated', 'var(--accent)'], failed: ['Failed', 'var(--red)'], queued: ['Queued', 'var(--gray)'] };
    const mode = state.settings.email?.mode;
    clear(body).append(
      h('div', { class: `callout ${mode === 'gmail' ? 'ok' : 'warn'} mb-16` }, icon('mail', 16), h('div', mode === 'gmail' ? h('span', h('b', 'Gmail is connected.'), ' Emails below were delivered through your Gmail account.') : h('span', h('b', 'Demo mode — emails are rendered but not delivered.'), ' Click any message to see exactly what your teammate (or you) would receive. Connect Gmail in Integrations to send for real.'))),
      h('div', { class: 'row wrap gap-6 mb-16' }, kinds.map(([k, l]) => h('button', { class: `chip-f ${emailKind === k ? 'on' : ''}`, onClick: () => { emailKind = k; loadEmails(); } }, l))),
      h('div', { class: 'card flush' }, emails.length ? h('div', { class: 'table-wrap' }, h('table', { class: 't' },
        h('thead', h('tr', ['To', 'Subject', 'Type', 'Status', 'Sent'].map((c) => h('th', c)))),
        h('tbody', emails.map((e) => { const [sl, sc] = STAT[e.status] || STAT.queued; return h('tr', { class: 'click', onClick: () => openEmail(e.id) },
          h('td', h('div', { style: 'font-weight:550' }, e.to_name || e.to_addr), h('div', { class: 'dim mono', style: 'font-size:11.5px' }, e.to_addr)),
          h('td', { style: 'max-width:420px' }, h('div', { class: 'trunc' }, e.subject)),
          h('td', h('span', { class: 'tag' }, e.kind.replace('owner_', 'to me · ').replace(/_/g, ' '))),
          h('td', h('span', { class: 'pill', style: { '--c': sc } }, sl)),
          h('td', { class: 'dim' }, fmt.time(e.created_at))); })))) : empty('mail', 'No emails yet')));
  }

  async function openEmail(id) {
    const e = await act(() => api.get(`/api/emails/${id}`)); if (!e) return;
    modal({ title: e.subject, width: 720, body: h('div', h('div', { class: 'row gap-16 wrap mb-8 muted', style: 'font-size:12.5px' }, h('span', `To: ${e.to_name || ''} <${e.to_addr}>`), h('span', fmt.timeLong(e.created_at)), h('span', { class: 'tag' }, e.status)), e.error && h('div', { class: 'callout err mb-8' }, e.error), h('iframe', { class: 'mail-frame', sandbox: '', srcdoc: e.html })) });
  }

  async function loadLog() {
    const r = await api.get(`/api/activity${api.qs({ limit: 120, kind: actKind })}`);
    const kinds = [['', 'All'], ['sheet_change', 'Sheet changes'], ['assigned', 'Assignments'], ['auto_assign', 'Auto-assign runs'], ['project_created', 'Imports'], ['reminder', 'Reminders'], ['status_changed', 'Status']];
    clear(body).append(
      h('div', { class: 'row wrap gap-6 mb-16' }, kinds.map(([k, l]) => h('button', { class: `chip-f ${actKind === k ? 'on' : ''}`, onClick: () => { actKind = k; loadLog(); } }, l))),
      h('div', { class: 'card flush feed' }, r.items.length ? r.items.map((a) => h('div', { class: 'log-row', onClick: () => a.project_id && go(`#/projects/${a.project_id}`), style: a.project_id ? 'cursor:pointer' : '' },
        h('div', { class: 'n-ico sm' }, icon(ACT_ICON[a.kind] || 'zap', 13)),
        h('div', { class: 'grow', style: 'min-width:0' }, h('div', a.project_name && h('b', { style: 'margin-right:8px' }, a.project_name), a.message), h('div', { class: 'dim', style: 'font-size:11.5px' }, `${a.actor === 'system' ? 'Automation' : a.actor === 'sheet' ? 'Google Sheet' : a.actor === 'you' ? 'You' : a.actor} · ${a.kind.replace(/_/g, ' ')}`)),
        h('div', { class: 'dim', style: 'font-size:12px;white-space:nowrap' }, fmt.rel(a.ts)))) : empty('history', 'Nothing logged yet')));
  }

  liveOn('sync', () => load()); liveOn('notification', debounce(() => tab === 'inbox' && load(), 400));
  await load(); drawTabs();
}
