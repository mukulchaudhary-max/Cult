import { h, api, act, icon, fmt, state, statusPill, priorityTag, avatar, assigneeChip, pickStatus, pickAssignee, assign, menu, modal, confirmDialog, toast, select, field, debounce, empty, modeTag, skeleton, sheetLinkBtn, syncNow, liveOn, clear, STATUS_COLORS, PRIO_COLORS, MODE_COLORS, memberById } from '../core.js';

export default async function render(ctx) {
  if (ctx.params[0]) return renderDetail(ctx, ctx.params[0]);
  return renderTable(ctx);
}

/* ═════════════════════════════ TABLE ═════════════════════════════ */
const COLS = [
  ['name', 'Project'], ['month', 'Month'], ['brand', 'Brand / Campaign'], ['type', 'Type'], ['assignee', 'Assigned To'], ['priority', 'Priority'],
  ['status', 'Status'], ['received', 'Brief Received'], ['deadline', 'Deadline'], ['updated', 'Last Updated'], ['assignment', 'Assignment'],
];
const DEFAULTS = { q: '', month: '', assignee: '', status: '', priority: '', type: '', mode: '', due: '', flagged: '', sort: 'deadline', dir: 'asc', page: 1, pageSize: 25 };
const MODE_OPTS = [['', 'Any assignment'], ['auto', 'Auto-assigned'], ['sheet', 'From Google Sheet'], ['manual', 'Manually assigned'], ['self', 'Assigned to me'], ['locked', 'Do not auto-assign']];

async function renderTable(ctx) {
  ctx.setCrumbs(['All Projects']);
  const f = { ...DEFAULTS };
  for (const [k, v] of Object.entries(ctx.query)) if (k in f && v !== '') f[k] = ['page', 'pageSize'].includes(k) ? Math.max(1, +v || DEFAULTS[k]) : v;
  const rows = new Map(); const selected = new Set();
  let token = 0, data = { items: [], total: 0, pages: 1 };

  const syncUrl = () => {
    const o = {}; for (const k of Object.keys(DEFAULTS)) if (String(f[k]) !== String(DEFAULTS[k])) o[k] = f[k];
    history.replaceState(null, '', `#/projects${api.qs(o)}`);
  };

  // ── toolbar (built once)
  const searchIn = h('input', { class: 'input', placeholder: 'Search name, brand, brief, code…', value: f.q, onInput: debounce((e) => { f.q = e.target.value.trim(); f.page = 1; load(); }, 260) });
  const mem = state.team.filter((m) => !m.is_owner), me = state.team.find((m) => m.is_owner);
  const filterSel = (key, label, opts) => { const s = select([['', label], ...opts], f[key], (v) => { f[key] = v; f.page = 1; load(); }, 'sm'); s.dataset.key = key; return s; };
  const sels = {
    month: filterSel('month', 'All months', state.months.map((m) => [m.key, m.label])),
    assignee: filterSel('assignee', 'All teammates', [['unassigned', 'Unassigned'], ...mem.map((m) => [m.id, m.name]), ...(me ? [[me.id, `${me.name} (me)`]] : [])]),
    status: filterSel('status', 'All statuses', state.statuses.map((s) => [s, s])),
    priority: filterSel('priority', 'All priorities', state.priorities.map((s) => [s, s])),
    type: filterSel('type', 'All types', state.types.map((s) => [s, s])),
    mode: filterSel('mode', 'Any assignment', MODE_OPTS.slice(1)),
  };
  const quick = {};
  const quickBtn = (key, val, label, ico) => { const b = h('button', { class: 'btn sm quick', onClick: () => { f[key] = f[key] === val ? '' : val; f.page = 1; load(); } }, icon(ico, 13), label); quick[`${key}:${val}`] = b; return b; };
  const toolbar = h('div', { class: 'card pj-toolbar' },
    h('div', { class: 'input-ico pj-search' }, icon('search', 15), searchIn),
    h('div', { class: 'pj-filters' }, Object.values(sels)),
    h('div', { class: 'pj-quick' }, quickBtn('due', 'overdue', 'Overdue', 'alert'), quickBtn('due', 'soon', 'Due soon', 'clock'), quickBtn('flagged', '1', 'Missing info', 'flag')));
  const chips = h('div', { class: 'pj-chips' });
  const tbody = h('tbody'); const thead = h('thead'); const foot = h('div', { class: 'pj-foot' });
  const selAll = h('input', { type: 'checkbox', class: 'cb', 'aria-label': 'Select all on page', onChange: (e) => { data.items.forEach((p) => (e.target.checked ? selected.add(p.id) : selected.delete(p.id))); paintSel(); } });
  const bulk = h('div', { class: 'pj-bulk hide' });
  const table = h('table', { class: 't pj-table' }, thead, tbody);
  const wrap = h('div', { class: 'table-wrap pj-wrap' }, table);

  const paintHead = () => {
    thead.replaceChildren(h('tr', h('th', { style: 'width:38px' }, selAll), COLS.map(([k, l]) => h('th', { class: 'sortable', dataset: { sort: k }, onClick: () => { if (f.sort === k) f.dir = f.dir === 'asc' ? 'desc' : 'asc'; else { f.sort = k; f.dir = ['received', 'updated', 'priority'].includes(k) ? 'desc' : 'asc'; } f.page = 1; load(); } }, l, f.sort === k ? h('span', { class: 'arr' }, f.dir === 'asc' ? '↑' : '↓') : null))));
  };

  // ── row
  const dueTone = { bad: 'var(--red)', warn: 'var(--amber)', soon: 'var(--amber)', done: 'var(--text-3)', ok: 'var(--text)' };
  const rowEl = (p) => {
    const due = fmt.due(p);
    const flags = p.flags || [];
    const tr = h('tr', { class: `click ${selected.has(p.id) ? 'sel' : ''}`, dataset: { id: p.id } },
      h('td', h('input', { type: 'checkbox', class: 'cb', dataset: { act: 'sel' }, checked: selected.has(p.id), 'aria-label': `Select ${p.name}` })),
      h('td', { class: 'pj-name' }, h('div', { class: 'row gap-8' },
        h('div', { style: 'min-width:0' }, h('div', { class: 'trunc pj-title' }, p.name), h('div', { class: 'row gap-6' }, h('span', { class: 'mono dim', style: 'font-size:11px' }, p.code),
          flags.length ? h('span', { class: 'pj-flag', dataset: { tip: `<b>Missing info</b><br>${flags.map((x) => x.label).join('<br>')}` } }, icon('flag', 11), flags.length) : null)))),
      h('td', { class: 'muted nowrap' }, fmt.monthShort(p.month)),
      h('td', h('div', { class: 'trunc', style: 'max-width:150px' }, p.brand || h('span', { class: 'dim' }, '—'))),
      h('td', h('div', { class: 'trunc', style: 'max-width:150px' }, p.type || h('span', { class: 'tag c', style: { '--c': 'var(--amber)' } }, 'Missing'))),
      h('td', h('button', { class: 'pj-cell-btn', dataset: { act: 'assignee' } }, assigneeChip(p))),
      h('td', h('button', { class: 'pj-cell-btn', dataset: { act: 'priority' } }, priorityTag(p.priority))),
      h('td', h('span', { dataset: { act: 'status' } }, statusPill(p.status, { onClick: () => {} }))),
      h('td', { class: 'muted num nowrap' }, fmt.date(p.brief_received_at)),
      h('td', { class: 'num nowrap', style: { color: dueTone[due.tone] } }, h('div', { style: 'font-weight:550' }, due.text), p.deadline && due.tone !== 'ok' && due.tone !== 'done' ? h('div', { class: 'dim', style: 'font-size:11px' }, fmt.date(p.deadline)) : null),
      h('td', { class: 'dim nowrap' }, fmt.rel(p.updated_at)),
      h('td', p.assignee_id || p.assign_mode === 'locked' ? modeTag(p.assign_mode, p.assignment_status) : h('span', { class: 'tag c', style: { '--c': 'var(--amber)' } }, 'Unassigned')));
    return tr;
  };
  const paintRows = () => {
    rows.clear(); data.items.forEach((p) => rows.set(p.id, p));
    if (!data.items.length) {
      const anyFilter = Object.keys(DEFAULTS).some((k) => !['sort', 'dir', 'page', 'pageSize'].includes(k) && f[k]);
      tbody.replaceChildren(h('tr', h('td', { colSpan: COLS.length + 1 }, empty('inbox', anyFilter ? 'No projects match these filters' : 'No projects yet', anyFilter ? 'Try removing a filter or searching for something else.' : 'New briefs from your Google Sheet will appear here automatically.', anyFilter ? h('button', { class: 'btn sm', onClick: clearAll }, 'Clear filters') : null))));
    } else tbody.replaceChildren(...data.items.map(rowEl));
    selAll.checked = data.items.length > 0 && data.items.every((p) => selected.has(p.id));
  };
  const replaceRow = (np) => { const old = tbody.querySelector(`tr[data-id="${np.id}"]`); const item = data.items.findIndex((x) => x.id === np.id); if (item >= 0) data.items[item] = np; rows.set(np.id, np); if (old) old.replaceWith(rowEl(np)); };

  // delegated interactions
  tbody.addEventListener('click', async (e) => {
    const tr = e.target.closest('tr[data-id]'); if (!tr) return;
    const id = +tr.dataset.id, p = rows.get(id); const a = e.target.closest('[data-act]');
    if (!a) { if (!e.target.closest('a,button,input')) location.hash = `#/projects/${id}`; return; }
    const act_ = a.dataset.act;
    if (act_ === 'sel') { a.checked ? selected.add(id) : selected.delete(id); tr.classList.toggle('sel', a.checked); paintSel(); return; }
    if (act_ === 'assignee') pickAssignee(a, p, (np) => replaceRow(np));
    if (act_ === 'status') pickStatus(a, p.status, async (s) => { const np = await act(() => api.patch(`/api/projects/${id}`, { status: s }), `Status → ${s}`); if (np) { replaceRow(np); } });
    if (act_ === 'priority') menu(a, state.priorities.map((x) => ({ label: x, dot: PRIO_COLORS[x], checked: x === p.priority, onClick: async () => { if (x === p.priority) return; const np = await act(() => api.patch(`/api/projects/${id}`, { priority: x }), `Priority → ${x}`); if (np) replaceRow(np); } })));
  });

  // ── bulk
  const paintSel = () => {
    const n = selected.size; bulk.classList.toggle('hide', !n);
    selAll.checked = data.items.length > 0 && data.items.every((p) => selected.has(p.id));
    if (!n) return;
    const run = async (action, value, msg) => { const r = await act(() => api.post('/api/projects/bulk', { ids: [...selected], action, value }), msg); if (r) { selected.clear(); await load(true); } };
    bulk.replaceChildren(h('span', { class: 'pj-bulk-n' }, `${n} selected`), h('div', { class: 'pj-bulk-sep' }),
      h('button', { class: 'btn sm', onClick: (e) => menu(e.currentTarget, [{ section: 'Assign to' }, ...mem.map((m) => ({ label: m.name, avatar: avatar(m, 22), sub: m.active != null ? `${m.active} active` : '', onClick: () => run('assign', m.id, `Assigned ${n} to ${m.name}`) })), ...(me ? [{ divider: true }, { label: 'Assign to me', icon: 'user', onClick: () => run('assign', me.id, `Assigned ${n} to me`) }] : []), { label: 'Do not auto-assign', icon: 'lock', onClick: () => run('assign', 'locked', `${n} excluded from auto-assign`) }], { search: true, placeholder: 'Assign to…', width: 260 }) }, icon('users', 14), 'Assign to…'),
      h('button', { class: 'btn sm', onClick: (e) => menu(e.currentTarget, state.statuses.map((s) => ({ label: s, dot: STATUS_COLORS[s], onClick: () => run('status', s, `${n} set to ${s}`) }))) }, icon('layers', 14), 'Set status…'),
      h('button', { class: 'btn sm', onClick: (e) => menu(e.currentTarget, state.priorities.map((s) => ({ label: s, dot: PRIO_COLORS[s], onClick: () => run('priority', s, `${n} set to ${s}`) }))) }, icon('flag', 14), 'Set priority…'),
      h('div', { class: 'pj-bulk-sep' }), h('button', { class: 'btn ghost sm', onClick: () => { selected.clear(); tbody.querySelectorAll('tr.sel').forEach((t) => { t.classList.remove('sel'); const c = t.querySelector('.cb'); if (c) c.checked = false; }); paintSel(); } }, 'Clear'));
  };

  // ── chips + footer
  const chipDefs = () => {
    const lab = { month: (v) => `Month: ${fmt.monthLabel(v)}`, assignee: (v) => `Teammate: ${v === 'unassigned' ? 'Unassigned' : memberById(+v)?.name || v}`, status: (v) => `Status: ${v}`, priority: (v) => `Priority: ${v}`, type: (v) => `Type: ${v}`, mode: (v) => `Assignment: ${(MODE_OPTS.find((o) => o[0] === v) || [])[1] || v}`, due: (v) => (v === 'overdue' ? 'Overdue' : 'Due soon'), flagged: () => 'Missing info', q: (v) => `Search: “${v}”` };
    return Object.keys(lab).filter((k) => f[k]).map((k) => [k, lab[k](f[k])]);
  };
  const clearAll = () => { Object.assign(f, { ...DEFAULTS, sort: f.sort, dir: f.dir, pageSize: f.pageSize }); searchIn.value = ''; load(); };
  const paintChrome = () => {
    const defs = chipDefs();
    chips.classList.toggle('hide', !defs.length);
    chips.replaceChildren(...defs.map(([k, t]) => h('span', { class: 'pj-chip' }, t, h('button', { 'aria-label': 'Remove filter', onClick: () => { f[k] = ''; if (k === 'q') searchIn.value = ''; f.page = 1; load(); } }, icon('x', 11)))), h('button', { class: 'btn ghost xs', onClick: clearAll }, 'Clear all'));
    for (const [k, s] of Object.entries(sels)) s.value = f[k];
    for (const [key, b] of Object.entries(quick)) { const [k, v] = key.split(':'); b.classList.toggle('on', f[k] === v); }
    paintHead();
    const from = data.total ? (f.page - 1) * f.pageSize + 1 : 0, to = Math.min(f.page * f.pageSize, data.total);
    const pg = (n, lab, dis) => h('button', { class: 'btn sm', disabled: dis, onClick: () => { f.page = n; load(); wrap.scrollTop = 0; } }, lab);
    foot.replaceChildren(h('span', { class: 'muted num' }, `${from}–${to} of ${data.total} project${data.total === 1 ? '' : 's'}`), h('div', { class: 'grow' }),
      h('span', { class: 'dim' }, 'Rows'), select([25, 50, 100], f.pageSize, (v) => { f.pageSize = +v; f.page = 1; load(); }, 'sm pj-ps'),
      pg(f.page - 1, icon('left', 14), f.page <= 1), h('span', { class: 'num muted', style: 'min-width:64px;text-align:center' }, `${f.page} / ${data.pages || 1}`), pg(f.page + 1, icon('right', 14), f.page >= (data.pages || 1)));
  };

  async function load(keepScroll) {
    const mine = ++token; syncUrl();
    const sy = window.scrollY;
    try {
      const d = await api.get(`/api/projects${api.qs({ q: f.q, month: f.month, assignee: f.assignee, status: f.status, priority: f.priority, type: f.type, mode: f.mode, due: f.due, flagged: f.flagged, sort: f.sort, dir: f.dir, page: f.page, pageSize: f.pageSize })}`);
      if (mine !== token) return;
      data = d; if (f.page > Math.max(d.pages, 1)) { f.page = Math.max(d.pages, 1); return load(); }
      paintRows(); paintChrome(); paintSel(); if (keepScroll) window.scrollTo(0, sy);
    } catch (e) { toast(e.message, { type: 'err' }); }
  }

  ctx.root.append(
    h('div', { class: 'page-h' }, h('div', h('div', { class: 'eyebrow', style: 'margin-bottom:8px' }, 'Pipeline'), h('h1', 'All Projects'), h('div', { class: 'sub' }, 'Every brief imported from Google Sheets — reassign, re-prioritise and update status inline.')),
      h('div', { class: 'actions' }, h('a', { class: 'btn', href: '/api/export/projects.csv', download: 'projects.csv' }, icon('download', 15), 'Export CSV'),
        h('button', { class: 'btn primary', onClick: async (e) => { const r = await syncNow('manual'); if (r) { toast(r.created || r.changes ? `${r.created} new · ${r.changes} changes` : 'Sheet is up to date', { type: 'ok' }); load(true); } } }, icon('refresh', 15), 'Sync now'))),
    toolbar, chips, h('div', { class: 'card flush pj-card' }, wrap, foot), bulk);
  paintHead();
  tbody.replaceChildren(...Array.from({ length: 8 }, () => h('tr', h('td', { colSpan: COLS.length + 1 }, skeleton(22)))));
  await load();
  liveOn('sync', () => load(true));
}

/* ═════════════════════════════ DETAIL ═════════════════════════════ */
const KIND = {
  project_created: ['sheet', 'var(--blue)', 'Imported'], assigned: ['user', 'var(--violet)', 'Assigned'], reassigned: ['shuffle', 'var(--violet)', 'Reassigned'], auto_assign: ['sparkles', 'var(--teal)', 'Auto-assigned'],
  status_changed: ['layers', 'var(--teal)', 'Status'], field_changed: ['edit', 'var(--text-2)', 'Updated'], sheet_change: ['sheet', 'var(--blue)', 'Sheet change'], comment: ['message', 'var(--accent)', 'Comment'],
  reminder: ['clock', 'var(--amber)', 'Reminder'], overdue: ['alert', 'var(--red)', 'Overdue'], flagged: ['flag', 'var(--amber)', 'Flagged'], removed_from_sheet: ['alert', 'var(--red)', 'Removed'], restored: ['refresh', 'var(--green)', 'Restored'],
};
const host = (u) => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return u; } };

async function renderDetail(ctx, id) {
  let data, tab = 'timeline', notesDraft = null, commentDraft = '';
  const fetchData = async () => { data = await api.get(`/api/projects/${id}`); };
  try { await fetchData(); } catch (e) {
    ctx.setCrumbs([h('a', { href: '#/projects' }, 'Projects'), 'Not found']);
    ctx.root.append(h('div', { class: 'card' }, empty('inbox', e.status === 404 ? 'Project not found' : 'Could not load project', e.status === 404 ? 'It may have been removed or the link is wrong.' : e.message, h('a', { class: 'btn', href: '#/projects' }, icon('left', 14), 'Back to all projects'))));
    return;
  }
  const mount = h('div', { class: 'pd' }); ctx.root.append(mount);

  const patch = async (body, msg) => { const r = await act(() => api.patch(`/api/projects/${id}`, body), msg); if (r) { await fetchData(); paint(); } return r; };

  function paint() {
    const p = data.project; const y = window.scrollY;
    ctx.setCrumbs([h('a', { href: '#/projects' }, 'Projects'), h('span', { class: 'mono' }, p.code)]);
    const due = fmt.due(p);
    const tone = { bad: 'var(--red)', warn: 'var(--amber)', soon: 'var(--amber)', done: 'var(--green)', ok: 'var(--text-2)' }[due.tone];
    const head = h('div', { class: 'pd-head' },
      h('div', { class: 'grow', style: 'min-width:0' },
        h('div', { class: 'row gap-8 wrap', style: 'margin-bottom:10px' }, h('span', { class: 'mono pd-code' }, p.code), h('span', { class: 'dim' }, '·'), h('span', { class: 'muted' }, p.month_label), p.brand ? h('span', { class: 'tag' }, p.brand) : null, p.removed_from_sheet ? h('span', { class: 'tag c', style: { '--c': 'var(--red)' } }, 'Removed from sheet') : null),
        h('h1', { class: 'pd-title' }, p.name),
        h('div', { class: 'row gap-12 wrap', style: 'margin-top:12px' }, h('span', { onClick: (e) => pickStatus(e.currentTarget, p.status, (s) => patch({ status: s }, `Status → ${s}`)) }, statusPill(p.status, { onClick: () => {} })),
          priorityTag(p.priority), h('span', { class: 'row gap-6 num', style: { color: tone, fontWeight: 550 } }, icon('calendar', 14), p.deadline ? (['ok', 'done'].includes(due.tone) ? fmt.dateLong(p.deadline) : `${fmt.dateLong(p.deadline)} · ${due.text}`) : 'No deadline set'))),
      h('div', { class: 'pd-actions' },
        h('button', { class: 'btn', onClick: (e) => pickAssignee(e.currentTarget, p, async () => { await fetchData(); paint(); }) }, p.assignee_id ? avatar({ name: p.assignee_name, color: p.assignee_color }, 20) : icon('user', 15), p.assignee_name || 'Assign', icon('down', 12)),
        sheetLinkBtn(p, 'btn'),
        p.status !== 'Completed' ? h('button', { class: 'btn primary', onClick: () => patch({ status: 'Completed' }, 'Marked complete') }, icon('check', 15), 'Mark complete') : h('button', { class: 'btn', onClick: () => patch({ status: 'In Progress' }, 'Reopened') }, icon('refresh', 14), 'Reopen')));

    // ── main column
    const flags = p.flags || [];
    const briefCard = h('div', { class: 'card' }, h('div', { class: 'card-h' }, h('h3', 'Brief'), h('span', { class: 'sub' }, 'from Google Sheet')),
      h('div', { class: 'card-b' }, p.brief ? h('div', { class: 'pd-brief' }, p.brief) : h('div', { class: 'callout warn' }, icon('alert', 16), h('div', h('b', 'No brief provided'), h('div', 'Ask the requester for a brief — the assignee was still notified.')))));
    const flagCard = flags.length ? h('div', { class: 'callout warn' }, icon('flag', 16), h('div', h('b', `Missing information · ${flags.length}`), h('ul', { class: 'pd-flags' }, flags.map((x) => h('li', x.label))))) : null;
    const links = p.links || [];
    const linksCard = h('div', { class: 'card' }, h('div', { class: 'card-h' }, h('h3', 'Reference links'), h('span', { class: 'tag' }, links.length)),
      h('div', { class: 'card-b' }, links.length ? h('div', { class: 'col gap-6' }, links.map((u) => h('a', { class: 'pd-link', href: u, target: '_blank', rel: 'noopener noreferrer' }, icon('link', 14), h('span', { class: 'pd-host' }, host(u)), h('span', { class: 'trunc dim' }, u.replace(/^https?:\/\/(www\.)?/, '')), icon('ext', 12)))) : h('div', { class: 'dim' }, 'No reference links in the brief.')));
    const extra = Object.entries(p.extra || {});
    const sourceCard = h('div', { class: 'card' }, h('div', { class: 'card-h' }, h('h3', 'Product & sheet source')),
      h('div', { class: 'card-b' }, h('dl', { class: 'pd-dl' },
        kv('Product', p.product_info || '—'), kv('Sheet tab', p.sheet_tab || '—'), kv('Sheet row', p.sheet_row ? `Row ${p.sheet_row}` : '—'), kv('Brief received', fmt.timeLong(p.brief_received_at)),
        ...extra.map(([k, v]) => kv(k, v)))));
    const notes = h('textarea', { class: 'textarea', placeholder: 'Internal notes — visible only to your team…', rows: 4 }); notes.value = notesDraft ?? (p.notes || '');
    const saveNotes = h('button', { class: 'btn sm', disabled: notes.value === (p.notes || '') }, 'Save notes');
    const persist = async () => { // saves in place — no repaint, so the click that caused a blur is never swallowed
      const val = notes.value; if (val === (data.project.notes || '')) return;
      const r = await act(() => api.patch(`/api/projects/${id}`, { notes: val }), 'Notes saved');
      if (r) { data.project.notes = val; if (notes.value === val) notesDraft = null; saveNotes.disabled = notes.value === val; }
    };
    saveNotes.addEventListener('click', persist);
    notes.addEventListener('input', () => { notesDraft = notes.value; saveNotes.disabled = notes.value === (data.project.notes || ''); });
    notes.addEventListener('blur', persist);
    const notesCard = h('div', { class: 'card' }, h('div', { class: 'card-h' }, h('h3', 'Notes'), h('div', { class: 'right' }, saveNotes)), h('div', { class: 'card-b' }, notes));

    // tabs
    const counts = { timeline: data.timeline.length, assignments: data.assignments.length, changes: data.changes.length, comments: data.comments.length, emails: data.emails.length };
    const tabsEl = h('div', { class: 'tabs' }, [['timeline', 'Timeline'], ['assignments', 'Assignment history'], ['changes', 'Change history'], ['comments', 'Comments'], ['emails', 'Emails']].map(([k, l]) => h('button', { class: tab === k ? 'on' : '', onClick: () => { tab = k; paint(); } }, l, h('span', { class: 'count' }, counts[k]))));
    const panel = h('div', { class: 'card-b pd-panel' }, tabPanel());
    const tabsCard = h('div', { class: 'card' }, h('div', { style: 'padding:0 8px' }, tabsEl), panel);

    // ── sidebar
    const dueIn = h('input', { class: 'input sm', type: 'date', value: p.deadline || '', onChange: (e) => patch({ deadline: e.target.value }, e.target.value ? 'Deadline updated' : 'Deadline cleared') });
    const typeSel = select([['', 'Not set'], ...state.types.map((t) => [t, t]), ...(p.type && !state.types.includes(p.type) ? [[p.type, p.type]] : [])], p.type || '', (v) => patch({ type: v }, 'Type updated'), 'sm');
    const details = h('div', { class: 'card' }, h('div', { class: 'card-h' }, h('h3', 'Details')),
      h('div', { class: 'card-b' }, h('dl', { class: 'pd-dl side' },
        h('dt', 'Assigned to'), h('dd', h('button', { class: 'pj-cell-btn', onClick: (e) => pickAssignee(e.currentTarget, p, async () => { await fetchData(); paint(); }) }, assigneeChip(p)), h('div', { class: 'row gap-6', style: 'margin-top:6px' }, p.assignee_id || p.assign_mode === 'locked' ? modeTag(p.assign_mode, p.assignment_status) : h('span', { class: 'tag c', style: { '--c': 'var(--amber)' } }, 'Unassigned')), p.auto_reason && p.assign_mode === 'auto' ? h('div', { class: 'dim', style: 'font-size:11.5px;margin-top:6px;line-height:1.4' }, p.auto_reason) : null),
        h('dt', 'Priority'), h('dd', h('button', { class: 'pj-cell-btn', onClick: (e) => menu(e.currentTarget, state.priorities.map((x) => ({ label: x, dot: PRIO_COLORS[x], checked: x === p.priority, onClick: () => x !== p.priority && patch({ priority: x }, `Priority → ${x}`) }))) }, priorityTag(p.priority), icon('down', 11))),
        h('dt', 'Deadline'), h('dd', dueIn),
        h('dt', 'Project type'), h('dd', typeSel),
        h('dt', 'Duration'), h('dd', fmt.dur(p.duration_sec)),
        h('dt', 'Brand'), h('dd', p.brand || '—'),
        h('dt', 'Month'), h('dd', h('a', { class: 'pd-a', href: `#/projects?month=${p.month}` }, p.month_label)),
        h('dt', 'Received'), h('dd', fmt.timeLong(p.brief_received_at)),
        h('dt', 'Last updated'), h('dd', fmt.rel(p.updated_at)))));
    const idx = state.statuses.indexOf(p.status);
    const stepper = h('div', { class: 'card' }, h('div', { class: 'card-h' }, h('h3', 'Workflow'), h('span', { class: 'sub' }, 'click to set status')),
      h('div', { class: 'card-b' }, h('ol', { class: 'pd-steps' }, state.statuses.map((s, i) => h('li', { class: `${i < idx ? 'past' : ''} ${i === idx ? 'now' : ''}`, style: { '--c': STATUS_COLORS[s] }, onClick: () => s !== p.status && patch({ status: s }, `Status → ${s}`) }, h('i'), h('span', s))))));

    mount.replaceChildren(head, h('div', { class: 'pd-grid' }, h('div', { class: 'col gap-16 pd-main' }, flagCard, briefCard, linksCard, sourceCard, notesCard, tabsCard), h('div', { class: 'col gap-16 pd-side' }, details, stepper)));
    window.scrollTo(0, y);
  }
  const kv = (k, v) => [h('dt', k), h('dd', v)];

  function tabPanel() {
    const d = data;
    if (tab === 'timeline') {
      if (!d.timeline.length) return empty('clock', 'No activity yet');
      return h('ol', { class: 'pd-tl' }, d.timeline.map((a) => { const [ico, col, lab] = KIND[a.kind] || ['info', 'var(--text-3)', a.kind]; return h('li', { style: { '--c': col } }, h('span', { class: 'pd-tl-dot' }, icon(ico, 13)), h('div', { class: 'grow' }, h('div', { class: 'row gap-8 wrap' }, h('b', lab), h('span', { class: 'dim' }, a.actor === 'system' ? 'Automation' : a.actor === 'sheet' ? 'Google Sheet' : a.actor === 'you' ? 'You' : a.actor)), h('div', { class: 'muted pd-tl-msg' }, a.message)), h('span', { class: 'dim nowrap', dataset: { tip: fmt.timeLong(a.ts) } }, fmt.rel(a.ts))); }));
    }
    if (tab === 'assignments') {
      if (!d.assignments.length) return empty('shuffle', 'No assignments yet');
      return h('div', { class: 'col gap-12' }, d.assignments.map((a) => h('div', { class: 'pd-asg' }, h('div', { class: 'row gap-8 wrap' }, h('span', { class: a.from_name ? '' : 'dim' }, a.from_name || 'Unassigned'), icon('arrow', 14), h('b', a.to_name || (a.mode === 'locked' ? 'Do not auto-assign' : 'Unassigned')), modeTag(a.mode, (state.assignModes || {})[a.mode] || a.mode), a.emailed ? h('span', { class: 'tag c', style: { '--c': 'var(--green)' }, dataset: { tip: 'Assignment email sent' } }, icon('mail', 11), 'emailed') : null, h('span', { class: 'end dim', dataset: { tip: fmt.timeLong(a.created_at) } }, fmt.rel(a.created_at))), h('div', { class: 'dim', style: 'margin-top:4px' }, `${a.reason || '—'} · by ${a.actor === 'you' ? 'you' : a.actor === 'sheet' ? 'Google Sheet' : 'automation'}`))));
    }
    if (tab === 'changes') {
      if (!d.changes.length) return empty('history', 'No changes recorded', 'Edits from the sheet or the dashboard will be logged here.');
      return h('div', { class: 'col gap-12' }, d.changes.map((c) => h('div', { class: 'pd-chg' }, h('div', { class: 'row gap-8 wrap' }, h('b', c.label), h('span', { class: 'tag c', style: { '--c': c.source === 'sheet' ? 'var(--blue)' : 'var(--violet)' } }, c.source === 'sheet' ? 'Sheet' : 'App'), c.applied === 0 ? h('span', { class: 'tag c', style: { '--c': 'var(--amber)' } }, 'ignored') : null, h('span', { class: 'end dim', dataset: { tip: fmt.timeLong(c.created_at) } }, fmt.rel(c.created_at))),
        h('div', { class: 'pd-diff' }, h('span', { class: 'old' }, clip(c.old_value) || '(empty)'), icon('arrow', 13), h('span', { class: 'new' }, clip(c.new_value) || '(empty)')), c.note ? h('div', { class: 'dim', style: 'margin-top:4px;font-size:12px' }, c.note) : null)));
    }
    if (tab === 'comments') {
      const ta = h('textarea', { class: 'textarea', rows: 2, placeholder: 'Add an internal update or comment…' }); ta.value = commentDraft; ta.addEventListener('input', () => { commentDraft = ta.value; });
      const post = async () => { const b = ta.value.trim(); if (!b) return; const r = await act(() => api.post(`/api/projects/${id}/comments`, { body: b }), 'Comment added'); if (r) { commentDraft = ''; await fetchData(); tab = 'comments'; paint(); } };
      ta.addEventListener('keydown', (e) => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') post(); });
      return h('div', { class: 'col gap-16' }, h('div', { class: 'col gap-8' }, ta, h('div', { class: 'row' }, h('span', { class: 'dim', style: 'font-size:12px' }, '⌘↵ to post'), h('button', { class: 'btn primary sm end', onClick: post }, icon('send', 13), 'Post'))),
        d.comments.length ? d.comments.map((c) => h('div', { class: 'row gap-12', style: 'align-items:flex-start' }, avatar(c.author, 28, { color: (state.team.find((m) => m.name === c.author) || {}).color }), h('div', { class: 'grow' }, h('div', { class: 'row gap-8' }, h('b', c.author), h('span', { class: 'dim', dataset: { tip: fmt.timeLong(c.created_at) } }, fmt.rel(c.created_at))), h('div', { class: 'pd-comment' }, c.body)))) : h('div', { class: 'dim', style: 'text-align:center;padding:10px' }, 'No comments yet — start the conversation.'));
    }
    if (tab === 'emails') {
      if (!d.emails.length) return empty('mail', 'No emails sent for this project');
      return h('table', { class: 't' }, h('thead', h('tr', ['Subject', 'To', 'Type', 'Status', 'Sent'].map((x) => h('th', x)))), h('tbody', d.emails.map((e) => h('tr', { class: 'click', onClick: () => openEmail(e.id) }, h('td', { style: 'font-weight:550' }, e.subject), h('td', { class: 'muted' }, e.to_name || e.to_addr), h('td', h('span', { class: 'tag' }, e.kind.replace(/_/g, ' '))), h('td', h('span', { class: 'tag c', style: { '--c': e.status === 'failed' ? 'var(--red)' : 'var(--green)' } }, e.status)), h('td', { class: 'dim nowrap' }, fmt.rel(e.created_at))))));
    }
    return null;
  }
  const clip = (s) => (s && s.length > 220 ? `${s.slice(0, 220)}…` : s);
  async function openEmail(eid) {
    const e = await act(() => api.get(`/api/emails/${eid}`)); if (!e) return;
    const frame = h('iframe', { class: 'pd-mail', sandbox: '', srcdoc: e.html, title: e.subject });
    modal({ title: e.subject, width: 680, body: h('div', h('div', { class: 'muted', style: 'margin-bottom:10px;font-size:12.5px' }, `To: ${e.to_name ? `${e.to_name} <${e.to_addr}>` : e.to_addr} · ${e.status} · ${fmt.timeLong(e.created_at)}`), frame) });
  }

  paint();
  liveOn('sync', async () => { await fetchData().catch(() => {}); paint(); });
}
