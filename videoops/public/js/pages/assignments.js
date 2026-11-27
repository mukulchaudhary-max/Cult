import { h, api, act, icon, fmt, state, avatar, statusPill, priorityTag, modeTag, MODE_COLORS, pickAssignee, modal, confirmDialog, toast, select, empty, refreshBootstrap, go, liveOn, debounce } from '../core.js';
import { dueTag } from './team.js';

const STRATEGY = { balance_total: 'Balance total workload', equal_batch: 'Equal share of each batch' };
const MODE_LABEL = (m) => state.assignModes?.[m] || { auto: 'Auto-assigned', sheet: 'From Google Sheet', manual: 'Manually assigned', self: 'Assigned to me', locked: 'Do not auto-assign' }[m] || m;
const mate = (id) => state.team.find((m) => m.id === id);
const outReason = (m) => !m ? null : m.leave_until && m.leave_until >= state.today ? `on leave until ${fmt.date(m.leave_until, true)}` : m.availability === 'unavailable' ? 'unavailable' : !m.enabled && !m.is_owner ? 'auto-assign is off' : null;

export default async function render(ctx) {
  const { root } = ctx;
  let board = { columns: [], pending: 0 }, history = [], month = '', histQ = '', histActor = '', dragging = null;
  const top = h('div'), boardEl = h('div'), histEl = h('div');
  root.append(h('div', { class: 'page-h' },
    h('div', h('div', { class: 'eyebrow', style: 'margin-bottom:8px' }, 'Workflow'), h('h1', 'Assignments'), h('div', { class: 'sub' }, 'The assignment engine distributes new briefs fairly. Drag cards to override it — your decisions are always respected.')),
    h('div', { class: 'actions' }, h('a', { class: 'btn', href: '#/automation' }, icon('settings', 14), 'Assignment rules'))), top, boardEl, histEl);

  async function loadAll() {
    const [b, hs] = await Promise.all([api.get('/api/assignments/board'), api.get('/api/assignments?limit=100')]);
    board = b; history = hs; drawTop(); drawBoard(); drawHistory();
  }
  const reloadBoard = async () => { board = await api.get('/api/assignments/board'); history = await api.get('/api/assignments?limit=100'); drawTop(); drawBoard(); drawHistory(); refreshBootstrap(); };

  // ───────── engine panel
  function drawTop() {
    const a = state.settings.assign || {};
    const un = board.columns[0]?.projects || [], pending = un.filter((p) => p.assign_mode !== 'locked').length, excluded = un.length - pending;
    const run = h('button', { class: 'btn primary', style: 'height:40px;padding:0 18px', disabled: !pending, onClick: () => preview(run) }, icon('sparkles', 15), pending ? `Run auto-assignment` : 'Nothing to assign');
    top.replaceChildren(h('div', { class: 'card as-engine' },
      h('div', { class: 'stat' }, h('div', { class: 'big', style: { color: pending ? 'var(--accent)' : 'var(--green)' } }, String(pending)),
        h('div', h('div', { style: 'font-weight:620;font-size:14.5px' }, pending ? `project${pending === 1 ? '' : 's'} waiting for assignment` : 'Everything is assigned'),
          h('div', { class: 'muted', style: 'font-size:12.5px;margin-top:2px' }, (pending ? 'Review the proposed distribution before anything is sent.' : 'New briefs are picked up automatically at the next sheet sync.') + (excluded ? ` ${excluded} project${excluded > 1 ? 's are' : ' is'} excluded from automation (“Do not auto-assign”).` : '')),
          h('div', { class: 'as-flow' }, h('span', { class: `st` }, h('i', { class: `live-dot ${a.enabled ? '' : 'off'}`, style: 'display:inline-block' }), a.enabled ? 'Automation on' : 'Automation paused'), h('span', { class: 'st' }, icon('layers', 12), STRATEGY[a.strategy] || a.strategy),
            a.skip_unavailable !== false ? h('span', { class: 'st' }, icon('shield', 12), 'Skips unavailable teammates') : null, h('span', { class: 'st' }, icon('lock', 12), 'Respects sheet & manual assignments')))),
      h('div', { class: 'col gap-8', style: 'align-items:flex-end' }, run, !pending ? null : h('span', { class: 'dim', style: 'font-size:11.5px' }, 'Preview first · no emails until you confirm'))));
  }

  async function preview(btn) {
    btn.disabled = true;
    const plan = await act(() => api.post('/api/assignments/preview'));
    btn.disabled = false; if (!plan) return;
    if (!plan.pending) return toast('Nothing to assign', { type: 'ok' });
    const maxAfter = Math.max(1, ...plan.loadsAfter.map((l) => l.after));
    const body = h('div', { class: 'col gap-16' },
      plan.unassigned.length ? h('div', { class: 'callout warn' }, icon('alert', 16), h('div', h('b', `${plan.unassigned.length} project${plan.unassigned.length > 1 ? 's' : ''} cannot be auto-assigned`), plan.unassigned.map((u) => h('div', { style: 'font-size:12.5px;margin-top:3px' }, `${u.projectName} — ${u.reason}`)))) : null,
      h('div', h('div', { class: 'eyebrow mb-8' }, `Proposed distribution · ${STRATEGY[plan.strategy] || plan.strategy}`),
        h('div', { class: 'as-pv-scroll' }, h('table', { class: 'as-pv-table' }, h('thead', h('tr', ['Project', 'Priority', 'Deadline', 'Assign to', 'Why'].map((t) => h('th', t)))),
          h('tbody', plan.assignments.map((a) => { const m = mate(a.memberId); return h('tr', h('td', { style: 'font-weight:550;max-width:210px' }, a.projectName), h('td', priorityTag(a.priority)), h('td', { class: 'muted' }, a.deadline ? fmt.date(a.deadline) : '—'), h('td', h('span', { class: 'who-chip' }, avatar(m || a.memberName, 22), a.memberName)), h('td', { class: 'dim', style: 'font-size:11.5px;max-width:260px' }, a.reason)); }))))),
      h('div', h('div', { class: 'eyebrow mb-8' }, 'Workload before → after'),
        h('div', { class: 'col gap-12' }, plan.loadsAfter.map((l) => { const m = mate(l.memberId); return h('div', { class: 'as-ba', style: l.skipped ? 'opacity:.55' : '' },
          h('span', { class: 'row gap-8', style: 'min-width:0' }, avatar(m || l.name, 20), h('span', { class: 'trunc' }, l.name.split(' ')[0])),
          l.skipped ? h('span', { class: 'dim', style: 'font-size:12px' }, `Skipped — ${l.skipped.replace(/\d{4}-\d{2}-\d{2}/, (d) => fmt.date(d, true))}`) : h('div', { class: 'tr', style: { '--c': m?.color } }, h('i', { class: 'b', style: { width: `${(l.before / maxAfter) * 100}%` } }), h('i', { class: 'a', style: { width: `${(l.added / maxAfter) * 100}%` } })),
          h('span', { class: 'mono num', style: 'text-align:right;font-size:12px' }, l.skipped ? `${l.before}` : h('span', `${l.before} → `, h('b', { style: 'color:var(--accent-2)' }, l.after)))); }))));
    modal({ title: `Review ${plan.assignments.length} assignment${plan.assignments.length === 1 ? '' : 's'}`, width: 860, body, actions: (close) => [
      h('button', { class: 'btn', onClick: close }, 'Cancel'),
      h('button', { class: 'btn primary', disabled: !plan.assignments.length, onClick: async (e) => {
        e.currentTarget.disabled = true; e.currentTarget.textContent = 'Assigning…';
        const r = await act(() => api.post('/api/assignments/run'));
        close(); if (!r) return;
        toast(`${r.assignments.length} project${r.assignments.length === 1 ? '' : 's'} assigned`, { type: 'ok', sub: `${r.emails} teammate email${r.emails === 1 ? '' : 's'} sent${r.unassigned.length ? ` · ${r.unassigned.length} need manual assignment` : ''}` });
        reloadBoard();
      } }, icon('send', 14), 'Confirm & assign (emails teammates)')] });
  }

  // ───────── board
  function drawBoard() {
    const mon = state.months || [];
    const cols = board.columns;
    const shown = (c) => c.projects.filter((p) => !month || p.month === month);
    boardEl.replaceChildren(
      h('div', { class: 'row wrap', style: 'margin:6px 0 12px' }, h('h2', { style: 'margin:0;font-size:15px;font-weight:620' }, 'Workload board'), h('span', { class: 'dim', style: 'font-size:12.5px' }, 'Drag a card onto a teammate to reassign — they and the previous owner are emailed'),
        h('div', { class: 'end' }, select([['', 'All months'], ...mon.map((m) => [m.key, m.label])], month, (v) => { month = v; drawBoard(); }, 'sm'))),
      h('div', { class: 'as-bwrap' }, cols.map((c) => column(c, shown(c)))));
  }

  function column(c, cards) {
    const m = c.id ? mate(c.id) : null, reason = c.id && !c.is_owner ? outReason(m) : null;
    const un = c.id == null;
    const el = h('div', { class: `as-col ${un ? 'un' : ''} ${reason ? 'dim' : ''}`,
      onDragover: (e) => { if (dragging) { e.preventDefault(); el.classList.add('over'); } },
      onDragleave: (e) => { if (!el.contains(e.relatedTarget)) el.classList.remove('over'); },
      onDrop: (e) => { e.preventDefault(); el.classList.remove('over'); if (dragging) drop(c, m, reason); } },
      h('div', { class: 'as-ch' }, un ? h('span', { class: 'avatar', style: { '--s': '30px', '--c': 'var(--surface-4)', color: 'var(--text-3)' } }, icon('inbox', 15)) : avatar(m || { name: c.name, color: c.color }, 30),
        h('div', { style: 'min-width:0' }, h('div', { class: 'nm trunc' }, c.name), h('div', { class: 'sb' }, un ? 'Waiting for the engine' : c.is_owner ? 'Assigned to me' : reason ? `Not receiving new work · ${reason}` : m?.availability === 'limited' ? 'Limited capacity' : 'Available')), h('span', { class: 'cnt' }, String(cards.length))),
      h('div', { class: 'as-list' }, cards.length ? cards.map((p) => cardEl(p, c)) : h('div', { class: 'as-empty' }, un ? 'Nothing waiting' : 'Drop projects here')));
    return el;
  }

  function cardEl(p, col) {
    const el = h('div', { class: 'as-card', draggable: true, onDragstart: (e) => { dragging = { p, from: col }; e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', String(p.id)); setTimeout(() => el.classList.add('drag'), 0); }, onDragend: () => { dragging = null; el.classList.remove('drag'); document.querySelectorAll('.as-col.over').forEach((x) => x.classList.remove('over')); } },
      h('div', { class: 'cd' }, p.code, p.flags?.length ? h('span', { style: 'color:var(--amber);display:inline-flex', 'data-tip': `<b>Missing info</b><br><span class="m">${p.flags.map((f) => f.label).join(' · ')}</span>` }, icon('flag', 12)) : null, h('span', { class: 'end' }, fmt.monthShort(p.month))),
      h('span', { class: 'ti', role: 'link', tabindex: 0, style: 'cursor:inherit', onClick: () => go(`#/projects/${p.id}`), onKeydown: (e) => e.key === 'Enter' && go(`#/projects/${p.id}`) }, p.name),
      h('div', { class: 'meta' }, priorityTag(p.priority), dueTag(p), statusPill(p.status)),
      h('div', { class: 'foot' }, modeTag(p.assign_mode, MODE_LABEL(p.assign_mode)), h('span', { class: 'end' }),
        h('button', { 'aria-label': 'Change assignee', onClick: (e) => pickAssignee(e.currentTarget, p, () => reloadBoard()) }, p.assignee_id ? avatar({ name: p.assignee_name, color: p.assignee_color }, 18) : icon('user', 13), 'Change', icon('down', 11))));
    return el;
  }

  async function drop(c, m, reason) {
    const { p, from } = dragging; dragging = null;
    if (from.id === c.id) return;
    let body;
    if (c.id == null) {
      const choice = await chooseUnassign(p);
      if (!choice) return;
      body = { assignee_id: null, mode: choice };
    } else body = { assignee_id: c.id };
    // optimistic move
    const prev = JSON.stringify(board);
    from.projects = from.projects.filter((x) => x.id !== p.id);
    c.projects.unshift({ ...p, assignee_id: c.id, assignee_name: m?.name, assignee_color: m?.color, assign_mode: c.id == null ? body.mode : c.is_owner ? 'self' : 'manual' });
    drawTop(); drawBoard();
    const r = await act(() => api.post(`/api/projects/${p.id}/assign`, body));
    if (!r) { board = JSON.parse(prev); drawTop(); drawBoard(); return; }
    const np = r.project;
    if (c.id == null) toast(body.mode === 'locked' ? `${p.name} excluded from auto-assignment` : np.assignee_name ? `Released — auto-assigned to ${np.assignee_name}` : 'Released to auto-assign', { type: 'ok' });
    else if (c.is_owner) toast('Assigned to you', { type: 'ok', sub: 'No email sent' });
    else toast(`${from.id ? 'Reassigned' : 'Assigned'} to ${c.name}`, { type: 'ok', sub: from.id && !from.is_owner ? 'Both teammates emailed · history recorded' : 'Teammate emailed · history recorded' });
    if (reason) setTimeout(() => toast(`Heads up: ${c.name.split(' ')[0]} is ${reason}`, { type: 'info', sub: 'The assignment still went through — it was your call.' }), 600);
    reloadBoard();
  }
  function chooseUnassign(p) {
    return new Promise((res) => {
      let done = false; const fin = (v) => { if (!done) { done = true; res(v); } };
      modal({ title: 'Remove assignee?', width: 480, onClose: () => fin(null),
        body: h('div', { class: 'col gap-12' }, h('div', { class: 'muted' }, `“${p.name}” will be taken off ${p.assignee_name || 'its teammate'}. What should happen next?`),
          h('div', { class: 'callout' }, icon('shuffle', 16), h('div', h('b', 'Release to auto-assign'), h('div', 'The engine picks the least-loaded available teammate right away.'))),
          h('div', { class: 'callout' }, icon('lock', 16), h('div', h('b', 'Do not auto-assign'), h('div', 'Keeps it unassigned and excluded from automation until you assign it.')))),
        actions: (close) => [h('button', { class: 'btn', onClick: () => { fin(null); close(); } }, 'Cancel'), h('button', { class: 'btn', onClick: () => { fin('locked'); close(); } }, icon('lock', 14), 'Do not auto-assign'), h('button', { class: 'btn primary', onClick: () => { fin('auto'); close(); } }, icon('shuffle', 14), 'Release to auto-assign')] });
    });
  }

  // ───────── history
  function drawHistory() {
    const q = histQ.toLowerCase();
    const rows = history.filter((r) => (!histActor || r.actor === histActor) && (!q || `${r.project_name} ${r.from_name || ''} ${r.to_name || ''} ${r.reason || ''}`.toLowerCase().includes(q)));
    const side = (id, name) => name ? h('span', { class: 'who-chip' }, avatar(mate(id) || name, 20), h('span', { class: 'trunc' }, name.split(' ')[0])) : h('span', { class: 'dim' }, 'Unassigned');
    const actors = [...new Set(history.map((r) => r.actor))];
    histEl.replaceChildren(h('div', { class: 'card flush mt-24' },
      h('div', { class: 'card-h', style: 'padding-bottom:14px;flex-wrap:wrap' }, h('h3', 'Assignment history'), h('span', { class: 'sub' }, `${rows.length} of ${history.length} events`),
        h('div', { class: 'right as-hr' }, h('div', { class: 'input-ico as-hs' }, icon('search', 14), h('input', { class: 'input sm', placeholder: 'Search project, teammate, reason…', value: histQ, onInput: debounce((e) => { histQ = e.target.value; drawHistory(); const i = document.querySelector('.as-hsearch'); if (i) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); } }, 150), class: 'input sm as-hsearch' })),
          select([['', 'All actors'], ...actors.map((a) => [a, { system: 'System (auto)', you: 'You', sheet: 'Google Sheet' }[a] || a])], histActor, (v) => { histActor = v; drawHistory(); }, 'sm'))),
      rows.length ? h('div', rows.map((r) => h('div', { class: 'as-hist-row' },
        h('div', { style: 'min-width:0' }, h('a', { class: 'pn trunc', style: 'display:block', href: `#/projects/${r.project_id}` }, r.project_name), h('div', { class: 'dim mono', style: 'font-size:10.5px' }, r.project_code)),
        h('div', { class: 'row gap-8' }, side(r.from_member_id, r.from_name), icon('arrow', 13), side(r.to_member_id, r.to_name)),
        h('div', modeTag(r.mode, MODE_LABEL(r.mode))),
        h('div', { class: 'muted', style: 'font-size:12px' }, r.reason || '—', h('div', { class: 'dim', style: 'font-size:11px;margin-top:1px' }, `by ${{ system: 'system', you: 'you', sheet: 'Google Sheet' }[r.actor] || r.actor}`)),
        h('div', { class: 'row gap-6 dim', style: 'justify-content:flex-end;font-size:11.5px' }, r.emailed ? h('span', { style: 'color:var(--green);display:inline-flex', 'data-tip': 'Teammate notified by email' }, icon('mail', 13)) : null, h('span', { 'data-tip': fmt.timeLong(r.created_at) }, fmt.rel(r.created_at)))))) : empty('history', 'No matching events', 'Assignments will be logged here as they happen.')));
  }

  await loadAll();
  // never re-render under the user's cursor mid-drag; refresh right after the drop instead
  let stale = false;
  liveOn('sync', () => { if (dragging) stale = true; else reloadBoard(); });
  document.addEventListener('dragend', () => { if (stale) { stale = false; setTimeout(reloadBoard, 400); } });
}
void confirmDialog; void MODE_COLORS;
