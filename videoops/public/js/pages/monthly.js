import { h, api, state, icon, fmt, avatar, statusPill, priorityTag, assigneeChip, pickStatus, pickAssignee, liveOn, clear, act, toast, refreshBootstrap, STATUS_COLORS, empty } from '../core.js';
import { ring, hbars, barList } from '../charts.js';

export default async function render(ctx) {
  const root = ctx.root;
  let months = [];
  async function load() {
    months = await api.get('/api/months');
    if (!months.length) { clear(root); root.append(head(), empty('calendar', 'No monthly briefs yet', 'When a new month tab or rows appear in your Google Sheet, a workspace is created here automatically.', h('a', { class: 'btn', href: '#/integrations' }, 'Open integrations'))); return; }
    const want = ctx.params[0];
    const key = months.find((m) => m.key === want)?.key || months.find((m) => m.key === state.today.slice(0, 7))?.key || months[0].key;
    ctx.setCrumbs(['Monthly Briefs', fmt.monthLabel(key)]);
    const [detail, list] = await Promise.all([api.get(`/api/months/${key}`), api.get(`/api/projects${api.qs({ month: key, pageSize: 100, sort: 'deadline' })}`)]);
    draw(key, detail, list.items);
  }
  const reload = () => load().catch(console.error);
  liveOn('sync', reload);
  const head = (key) => h('div', { class: 'page-h' }, h('div', h('h1', 'Monthly Briefs'), h('div', { class: 'sub' }, 'Every month gets its own workspace the moment its briefs land in the sheet.')),
    h('div', { class: 'actions' }, key && h('a', { class: 'btn', href: `#/projects?month=${key}` }, icon('projects', 15), 'Open in table')));

  function draw(key, d, items) {
    clear(root);
    const c = d.counters;
    root.append(head(key));
    const now = Date.now();
    const sorted = [...months].sort((a, b) => a.key.localeCompare(b.key));
    root.append(h('div', { class: 'month-chips' }, sorted.map((m) => {
      const fresh = m.lastReceived && now - new Date(m.lastReceived).getTime() < 7 * 864e5;
      return h('a', { class: `mchip ${m.key === key ? 'on' : ''}`, href: `#/monthly/${m.key}` }, h('span', { class: 'mchip-l' }, m.label), h('span', { class: 'mchip-n num' }, `${m.total}`), fresh && h('span', { class: 'tag c', style: '--c:var(--accent)' }, 'New'));
    })));

    root.append(h('section', { class: 'card mhero' },
      h('div', { class: 'mhero-ring' }, ring({ value: d.completion, size: 104, thickness: 10, color: 'var(--green)' }), h('div', h('div', { class: 'eyebrow' }, 'Completion'), h('div', { class: 'mh-title' }, d.label), h('div', { class: 'dim', style: 'font-size:12px;margin-top:3px' }, `${c.completed} of ${c.total} delivered`))),
      h('div', { class: 'kpis mkpis' }, [
        ['Received', c.total, 'inbox', 'var(--blue)'], ['Assigned', c.assigned, 'user', 'var(--violet)'], ['Completed', c.completed, 'check', 'var(--green)'], ['In progress', c.in_progress, 'play', 'var(--teal)'],
        ['Pending', c.pending, 'clock', 'var(--accent)'], ['Overdue', c.overdue, 'alert', c.overdue ? 'var(--red)' : 'var(--gray)'], ['Due soon', c.due_soon, 'flag', 'var(--accent)'],
      ].map(([l, v, ic, col]) => h('div', { class: 'kpi static', style: { '--c': col } }, h('div', { class: 'lab' }, icon(ic, 14), l), h('div', { class: 'val' }, v))))));

    const grid = h('div', { class: 'dg' });
    grid.append(
      sec('c4', 'Status breakdown', null, barList({ rows: d.byStatus.map((s) => ({ label: s.key, n: s.n, color: STATUS_COLORS[s.key], key: s.key })), labelWidth: 128, onClick: (r) => ctx.go(`#/projects?month=${key}&status=${encodeURIComponent(r.key)}`) })),
      sec('c8', 'Team workload this month', 'Projects per teammate · completed vs open', d.team.length ? hbars({ labelWidth: 150, max: Math.max(...d.team.map((t) => t.total)), rows: d.team.map((t) => ({ label: t.name, sub: `${t.done || 0} of ${t.total} done`, avatar: avatar(t, 26), segments: [{ n: t.done || 0, color: 'var(--s-done)', name: 'Completed' }, { n: t.total - (t.done || 0), color: 'var(--s-assigned)', name: 'Open' }], value: t.total })) }) : empty('users', 'No assignments yet')),
      sec('c12', 'Monthly deadlines', 'Week by week', timeline(d)));
    root.append(grid);

    root.append(h('section', { class: 'card flush', style: 'margin-top:16px' }, h('div', { class: 'card-h', style: 'padding-bottom:12px' }, h('div', h('h3', `Projects · ${d.label}`), h('div', { class: 'sub' }, `${items.length} projects, sorted by deadline`))),
      h('div', { class: 'table-wrap' }, table(items))));
    root.append(h('div', { class: 'dim', style: 'font-size:12px;margin-top:14px;display:flex;gap:8px;align-items:center' }, icon('sparkles', 13), d.createdAt ? `Workspace auto-created ${fmt.timeLong(d.createdAt)} when the first ${d.label} briefs were detected in the sheet.` : 'Workspace created automatically from the sheet.'));
  }

  function sec(cls, title, sub, body) { return h('section', { class: `card ${cls}` }, h('div', { class: 'card-h' }, h('div', h('h3', title), sub && h('div', { class: 'sub' }, sub))), h('div', { class: 'card-b' }, body)); }

  function timeline(d) {
    if (!d.weeks.length) return empty('calendar', 'No deadlines set for this month');
    return h('div', { class: 'tl' }, d.weeks.map((w) => h('div', { class: 'tl-week' },
      h('div', { class: 'tl-h' }, h('span', { class: 'eyebrow' }, `Week of ${fmt.date(w.start)}`), h('span', { class: 'tag' }, fmt.plural(w.items.length, 'deadline'))),
      h('div', { class: 'tl-items' }, w.items.map((p) => {
        const m = state.team.find((x) => x.name === p.assignee);
        return h('a', { class: `tl-item ${p.overdue ? 'over' : ''}`, href: `#/projects/${p.id}` },
          h('div', { class: 'tl-day' }, h('b', { class: 'num' }, p.deadline.slice(8).replace(/^0/, '')), h('span', fmt.dow(p.deadline))),
          h('div', { class: 'grow', style: 'min-width:0' }, h('div', { class: 'tl-name' }, p.name), h('div', { class: 'row gap-8 wrap', style: 'margin-top:5px' }, statusPill(p.status), p.overdue && h('span', { class: 'tag c', style: '--c:var(--red)' }, 'Overdue'), h('span', { class: 'row gap-6 dim', style: 'font-size:12px' }, m ? avatar(m, 18) : null, p.assignee || 'Unassigned'))));
      })))));
  }

  function table(items) {
    if (!items.length) return empty('projects', 'No projects in this month');
    return h('table', { class: 't' }, h('thead', h('tr', ['Project', 'Brand / campaign', 'Type', 'Assigned', 'Priority', 'Status', 'Deadline'].map((t) => h('th', t)))),
      h('tbody', items.map((p) => {
        const due = fmt.due(p);
        return h('tr', { class: 'click', onClick: (e) => { if (!e.target.closest('.pill,.assign-cell')) ctx.go(`#/projects/${p.id}`); } },
          h('td', h('div', { class: 'trunc', style: 'font-weight:550;max-width:340px' }, p.name), h('div', { class: 'mono dim', style: 'font-size:11px' }, p.code, p.flags.length ? h('span', { style: 'color:var(--accent);margin-left:8px' }, `⚠ ${p.flags.length} flag${p.flags.length > 1 ? 's' : ''}`) : null)),
          h('td', { class: 'muted' }, p.brand || '—'), h('td', { class: 'muted' }, p.type || h('span', { style: 'color:var(--accent)' }, 'Missing')),
          h('td', h('span', { class: 'assign-cell', style: 'cursor:pointer', onClick: (e) => pickAssignee(e.currentTarget, p, reload) }, assigneeChip(p))),
          h('td', priorityTag(p.priority)),
          h('td', statusPill(p.status, { onClick: (e) => { e.stopPropagation(); pickStatus(e.currentTarget, p.status, async (s) => { const r = await act(() => api.patch(`/api/projects/${p.id}`, { status: s })); if (r) { toast(`Status → ${s}`, { type: 'ok' }); refreshBootstrap(); reload(); } }); } })),
          h('td', h('span', { class: `due-txt ${due.tone}` }, due.text)));
      })));
  }

  await load();
}
