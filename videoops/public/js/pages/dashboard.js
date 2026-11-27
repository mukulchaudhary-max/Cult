import { h, api, state, icon, fmt, avatar, statusPill, priorityTag, syncNow, liveOn, clear, STATUS_COLORS, PRIO_COLORS, memberById, empty } from '../core.js';
import { donut, ring, columns, hbars, barList } from '../charts.js';

const KIND_ICON = { project_created: ['plus', 'var(--blue)'], assigned: ['user', 'var(--violet)'], reassigned: ['shuffle', 'var(--violet)'], auto_assign: ['shuffle', 'var(--teal)'], sheet_change: ['sheet', 'var(--accent)'], status_changed: ['check', 'var(--green)'], field_changed: ['edit', 'var(--gray)'], comment: ['message', 'var(--pink)'], flagged: ['flag', 'var(--accent)'], reminder: ['clock', 'var(--accent)'], overdue: ['alert', 'var(--red)'], month_created: ['calendar', 'var(--blue)'], duplicate_row: ['copy', 'var(--gray)'], removed_from_sheet: ['trash', 'var(--red)'], sync_failed: ['alert', 'var(--red)'], team_added: ['users', 'var(--green)'], team_updated: ['users', 'var(--gray)'], team_removed: ['users', 'var(--red)'], restored: ['refresh', 'var(--green)'] };
const greeting = () => { const hr = new Date().getHours(); return hr < 12 ? 'Good morning' : hr < 17 ? 'Good afternoon' : 'Good evening'; };

export default async function render(ctx) {
  const root = ctx.root;
  let busy = false;
  async function load() {
    if (busy) return; busy = true;
    try {
      const [d, act] = await Promise.all([api.get('/api/dashboard'), api.get('/api/activity?limit=12')]);
      draw(d, act.items);
    } finally { busy = false; }
  }
  const reload = () => load().catch(console.error);
  liveOn('sync', reload); liveOn('notification', () => setTimeout(reload, 400));

  function draw(d, activity) {
    clear(root);
    const c = d.counters;
    const ownerFull = state.settings.workspace?.owner_name || '';
    const owner = !ownerFull || /^production lead$/i.test(ownerFull) ? '' : ownerFull.split(' ')[0];
    const attention = c.overdue + c.unassigned + c.flagged;
    const sentence = attention ? `${attention} item${attention > 1 ? 's' : ''} need attention today${c.due_soon ? ` · ${c.due_soon} due soon` : ''}.` : 'Everything is on track — nothing needs attention.';
    root.append(h('div', { class: 'page-h' },
      h('div', h('div', { class: 'eyebrow' }, new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })), h('h1', { style: 'margin-top:8px' }, owner ? `${greeting()}, ${owner}` : greeting()), h('div', { class: 'sub' }, sentence)),
      h('div', { class: 'actions' },
        state.mode.sheet === 'demo' && h('a', { class: 'btn', href: '#/sheet' }, icon('sheet', 15), 'Open sheet simulator'),
        h('button', { class: 'btn primary', id: 'dash-sync', onClick: async (e) => { const r = await syncNow('manual'); if (r) reload(); } }, icon('refresh', 15), 'Sync now'))));

    root.append(hero(d), pipeline(d));
    root.append(h('div', { class: 'kpis dg-kpis' }, kpis(c)));

    const grid = h('div', { class: 'dg' });
    grid.append(
      card('c5', 'Status breakdown', 'All active briefs', statusCard(d)),
      card('c4', 'Projects by month', 'Completed vs open', monthsCard(d)),
      card('c3', 'Priority mix', 'Click to filter', priorityCard(d)),
      card('c7', 'Team workload', 'Active projects per teammate · balance keeps everyone level', workloadCard(d), balanceChip(d)),
      card('c5', 'Needs attention', 'What the automation could not resolve alone', attentionCard(c)),
      card('c6', 'Upcoming deadlines', 'Next 14 days', upcomingCard(d), h('a', { class: 'btn ghost xs', href: '#/projects?due=soon' }, 'View all', icon('right', 12))),
      card('c6', 'Recent activity', 'Every automated action is logged', activityCard(activity), h('a', { class: 'btn ghost xs', href: '#/changes' }, 'Audit log', icon('right', 12))));
    root.append(grid);
  }

  function card(cls, title, sub, body, right) {
    return h('section', { class: `card ${cls}` }, h('div', { class: 'card-h' }, h('div', h('h3', title), sub && h('div', { class: 'sub' }, sub)), right && h('div', { class: 'right' }, right)), h('div', { class: 'card-b' }, body));
  }

  // ── hero ──
  function hero(d) {
    const i = d.impact;
    const tiles = [
      ['shuffle', `${i.autoRate}%`, 'assignments automated', 'var(--teal)'],
      ['mail', i.emailsSent, 'emails sent automatically', 'var(--blue)'],
      ['sheet', i.changesCaught, 'sheet changes caught', 'var(--accent)'],
      ['inbox', i.imported, 'briefs imported', 'var(--violet)'],
      ['refresh', i.syncRuns, 'sync runs, zero manual checks', 'var(--green)'],
    ];
    return h('section', { class: 'card hero' },
      h('div', { class: 'hero-main' },
        h('div', { class: 'eyebrow', style: 'color:var(--accent)' }, 'Automation impact'),
        h('div', { class: 'hero-val num' }, fmt.hours(i.minutesSaved)),
        h('div', { class: 'hero-lab' }, 'est. manual work saved'),
        h('div', { class: 'dim hero-note' }, `Triage, assignment, briefing emails and change-tracking for ${i.imported} projects — handled without opening the sheet.`)),
      h('div', { class: 'hero-tiles' }, tiles.map(([ic, v, l, col]) => h('div', { class: 'hero-tile', style: { '--c': col } }, h('div', { class: 'hero-tile-ico' }, icon(ic, 15)), h('div', h('div', { class: 'hero-tile-v num' }, v), h('div', { class: 'hero-tile-l' }, l))))),
      h('div', { class: 'hero-ring' }, ring({ value: d.balance, size: 92, thickness: 9, color: d.balance >= 80 ? 'var(--green)' : d.balance >= 60 ? 'var(--accent)' : 'var(--coral)', label: d.balance }), h('div', { class: 'col gap-4', style: 'align-items:center' }, h('div', { style: 'font-weight:600' }, 'Workload balance'), h('div', { class: 'dim', style: 'font-size:11.5px;text-align:center' }, d.balance >= 80 ? 'Evenly distributed' : d.balance >= 60 ? 'Slight imbalance' : 'Needs rebalancing'))));
  }
  const balanceChip = (d) => h('span', { class: 'tag c', style: { '--c': d.balance >= 80 ? 'var(--green)' : 'var(--accent)' } }, icon('gauge', 12), `Balance ${d.balance}/100`);

  // ── pipeline ──
  function pipeline(d) {
    const i = d.impact, lr = d.lastRun, mon = state.settings.monitor || {};
    const stages = [
      ['sheet', 'Sheet monitored', mon.enabled ? `every ${mon.interval_min} min` : 'paused', lr ? `${lr.rows_seen} rows scanned` : '—'],
      ['inbox', 'Briefs detected', `${lr?.created ?? 0} new last run`, `${i.imported} total`],
      ['film', 'Imported', `${i.imported} projects`, 'deduplicated by ID'],
      ['shuffle', 'Assigned', `${i.autoAssigned} auto`, `${i.manualAssigned} manual`],
      ['mail', 'Teammates emailed', `${i.emailsSent} emails`, 'assignment + alerts'],
      ['history', 'Changes tracked', `${i.changesCaught} caught`, `${lr?.changes ?? 0} last run`],
    ];
    const run = state.syncing;
    const el = h('section', { class: 'card pipe' },
      h('div', { class: 'card-h' }, h('div', h('h3', 'Automation pipeline'), h('div', { class: 'sub' }, lr ? `Last sync ${fmt.rel(lr.finished_at || lr.started_at)} · ${lr.trigger} · ${lr.duration_ms ?? 0}ms` : 'No sync yet')),
        h('div', { class: 'right' }, lr && h('span', { class: 'tag c', style: { '--c': lr.status === 'success' ? 'var(--green)' : 'var(--red)' } }, lr.status === 'success' ? 'Healthy' : 'Failed'))),
      h('div', { class: 'card-b' },
        h('div', { class: 'stages' }, stages.map(([ic, t, a, b], idx) => h('div', { class: `stage ${run ? 'running' : ''}`, style: { '--i': idx } }, h('div', { class: 'stage-dot' }, icon(ic, 16)), h('div', { class: 'stage-t' }, t), h('div', { class: 'stage-a num' }, a), h('div', { class: 'stage-b' }, b)))),
        lr && h('div', { class: 'lastrun' }, h('span', { class: 'eyebrow' }, 'Last sync did'), [['created', 'imported', 'var(--blue)'], ['updated', 'updated', 'var(--accent)'], ['assigned', 'assigned', 'var(--teal)'], ['emails', 'emails sent', 'var(--violet)'], ['changes', 'changes logged', 'var(--pink)']].map(([k, l, col]) => h('span', { class: 'lr-chip', style: { '--c': col } }, h('b', { class: 'num' }, lr[k] ?? 0), ` ${l}`)))));
    const onSync = () => { if (!el.isConnected) return window.removeEventListener('syncstate', onSync); el.querySelectorAll('.stage').forEach((s) => s.classList.toggle('running', state.syncing)); };
    window.addEventListener('syncstate', onSync);
    return el;
  }

  // ── KPIs ──
  function kpis(c) {
    const defs = [
      ['Total Projects', c.total, 'projects', 'var(--blue)', '#/projects', 'across all months'],
      ['New Briefs', c.new_briefs, 'inbox', 'var(--accent)', '#/projects?sort=received&dir=desc', 'received in last 7 days'],
      ['Assigned', c.assigned, 'user', 'var(--violet)', '#/projects', `${c.total ? Math.round((c.assigned / c.total) * 100) : 0}% of projects`],
      ['Unassigned', c.unassigned, 'shuffle', c.unassigned ? 'var(--coral)' : 'var(--green)', '#/projects?assignee=unassigned', c.unassigned ? 'waiting on automation / you' : 'all covered'],
      ['In Progress', c.in_progress, 'play', 'var(--teal)', '#/projects?status=In Progress', `${c.review} in review`],
      ['Completed', c.completed, 'check', 'var(--green)', '#/projects?status=Completed', `${c.total ? Math.round((c.completed / c.total) * 100) : 0}% done`],
      ['Overdue', c.overdue, 'alert', c.overdue ? 'var(--red)' : 'var(--gray)', '#/projects?due=overdue', c.overdue ? 'past deadline' : 'none overdue'],
      ['Due Soon', c.due_soon, 'clock', 'var(--accent)', '#/projects?due=soon', `next ${(state.settings.reminders?.days_before ?? 2) + 1} days`],
    ];
    return defs.map(([lab, v, ic, col, href, foot]) => h('a', { class: 'kpi', href, style: { '--c': col } }, h('div', { class: 'lab' }, icon(ic, 15), lab), h('div', { class: 'val' }, v), h('div', { class: 'foot' }, foot)));
  }

  // ── charts ──
  function statusCard(d) {
    const data = d.byStatus.map((s) => ({ key: s.key, n: s.n, color: STATUS_COLORS[s.key] }));
    const total = data.reduce((a, x) => a + x.n, 0);
    return h('div', { class: 'donut-wrap' }, donut({ data, size: 168, thickness: 20, center: { value: total, label: 'projects' }, onClick: (x) => ctx.go(`#/projects?status=${encodeURIComponent(x.key)}`) }),
      h('div', { class: 'legend-col' }, data.map((x) => h('a', { class: 'lg-row', href: `#/projects?status=${encodeURIComponent(x.key)}` }, h('i', { style: { '--c': x.color } }), h('span', { class: 'trunc' }, x.key), h('b', { class: 'num mono' }, x.n)))));
  }
  function monthsCard(d) {
    if (!d.byMonth.length) return empty('calendar', 'No months yet');
    const data = d.byMonth.map((m) => ({ key: m.key, label: fmt.monthShort(m.key), series: [{ n: m.completed, color: 'var(--s-done)', name: 'Completed' }, { n: m.total - m.completed, color: 'var(--s-assigned)', name: 'Open' }] }));
    return h('div', columns({ data, height: 200, onClick: (x) => ctx.go(`#/monthly/${x.key}`) }), h('div', { class: 'legend mt-12' }, h('span', { style: '--c:var(--s-done)' }, h('i'), 'Completed'), h('span', { style: '--c:var(--s-assigned)' }, h('i'), 'Open')));
  }
  function priorityCard(d) {
    const tot = d.byPriority.reduce((a, p) => a + p.n, 0) || 1, hi = d.byPriority.filter((p) => p.key === 'High' || p.key === 'Urgent').reduce((a, p) => a + p.n, 0);
    return h('div', { class: 'col gap-16' }, barList({ rows: d.byPriority.map((p) => ({ label: p.key, n: p.n, color: PRIO_COLORS[p.key], key: p.key })).reverse(), labelWidth: 62, onClick: (r) => ctx.go(`#/projects?priority=${r.key}`) }),
      h('div', { class: 'prio-note' }, h('b', { class: 'num' }, `${Math.round((hi / tot) * 100)}%`), h('span', 'of briefs are High or Urgent — routed first by the assignment engine')));
  }
  function workloadCard(d) {
    const segs = ['Assigned', 'In Progress', 'Review', 'Changes Required', 'On Hold'];
    const rows = d.byTeammate.map((t) => {
      const m = memberById(t.id) || {};
      const leave = m.leave_until && m.leave_until >= state.today;
      const off = !t.available;
      const bs = Object.keys(t.byStatus).length ? t.byStatus : { Assigned: t.active };
      const segments = segs.map((s) => ({ n: bs[s] || 0, color: STATUS_COLORS[s], name: s }));
      return { id: t.id, label: t.name.replace(' (you)', ''), sub: t.owner ? 'You' : leave ? `On leave until ${fmt.date(m.leave_until)}` : off ? 'Unavailable' : `${t.completed} completed`, avatar: avatar({ name: t.name, color: t.color }, 26, { off }), segments, value: t.active, off };
    });
    const body = h('div', { class: 'wl' }, hbars({ rows, labelWidth: 170, max: Math.max(6, ...rows.map((r) => r.value)) }), h('div', { class: 'legend mt-16' }, segs.map((s) => h('span', { style: { '--c': STATUS_COLORS[s] } }, h('i'), s))));
    body.querySelectorAll('.row.gap-12').forEach((r, i) => { if (rows[i].off) r.classList.add('is-off'); });
    return body;
  }

  function attentionCard(c) {
    const items = [
      ['alert', 'Overdue', c.overdue, 'past their deadline', 'var(--red)', '#/projects?due=overdue'],
      ['shuffle', 'Unassigned', c.unassigned, 'waiting for a teammate', 'var(--coral)', '#/projects?assignee=unassigned'],
      ['flag', 'Missing information', c.flagged, 'no deadline, brief, link or type', 'var(--accent)', '#/projects?flagged=1'],
      ['clock', 'Due soon', c.due_soon, 'deadline within the reminder window', 'var(--blue)', '#/projects?due=soon'],
    ];
    return h('div', { class: 'attn' }, items.map(([ic, t, n, s, col, href]) => h('a', { class: `attn-row ${n ? '' : 'zero'}`, href, style: { '--c': col } }, h('div', { class: 'attn-ico' }, icon(ic, 16)), h('div', { class: 'grow' }, h('div', { style: 'font-weight:550' }, t), h('div', { class: 'dim', style: 'font-size:12px' }, s)), h('div', { class: 'attn-n num' }, n), icon('right', 14))));
  }

  function upcomingCard(d) {
    if (!d.upcoming.length) return empty('check', 'No deadlines in the next 14 days');
    return h('div', { class: 'list' }, d.upcoming.map((p) => {
      const m = p.assignee_id ? memberById(p.assignee_id) : null;
      const tone = p.days < 0 ? 'bad' : p.days <= 1 ? 'warn' : p.days <= 3 ? 'soon' : 'ok';
      const txt = p.days < 0 ? `${-p.days}d overdue` : p.days === 0 ? 'Today' : p.days === 1 ? 'Tomorrow' : `in ${p.days}d`;
      return h('a', { class: 'li', href: `#/projects/${p.id}` },
        h('div', { class: `due-chip ${tone}` }, h('b', { class: 'num' }, txt), h('span', fmt.date(p.deadline))),
        h('div', { class: 'grow', style: 'min-width:0' }, h('div', { class: 'trunc', style: 'font-weight:550' }, p.name), h('div', { class: 'row gap-8 dim', style: 'font-size:12px' }, h('span', { class: 'mono' }, p.code), priorityTag(p.priority))),
        m ? avatar(m, 24) : h('span', { class: 'tag' }, 'Unassigned'), statusPill(p.status));
    }));
  }
  function activityCard(items) {
    if (!items.length) return empty('history', 'No activity yet');
    return h('div', { class: 'list' }, items.map((a) => {
      const [ic, col] = KIND_ICON[a.kind] || ['sparkles', 'var(--gray)'];
      const el = h(a.project_id ? 'a' : 'div', { class: 'li act', href: a.project_id ? `#/projects/${a.project_id}` : undefined },
        h('div', { class: 'act-ico', style: { '--c': col } }, icon(ic, 14)),
        h('div', { class: 'grow', style: 'min-width:0' }, h('div', { class: 'act-msg' }, a.message), h('div', { class: 'dim', style: 'font-size:11.5px' }, a.project_name ? `${a.project_name} · ` : '', h('span', a.actor === 'system' ? 'automation' : a.actor === 'sheet' ? 'Google Sheet' : a.actor))),
        h('span', { class: 'dim mono', style: 'font-size:11px;white-space:nowrap' }, fmt.rel(a.ts)));
      return el;
    }));
  }

  await load();
}
