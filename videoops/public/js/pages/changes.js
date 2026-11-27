import { h, api, act, icon, fmt, state, go, modal, liveOn, empty, clear, debounce, select, statusPill } from '../core.js';

export default async function render(ctx) {
  const { root } = ctx;
  let tab = ctx.query.tab === 'sync' ? 'sync' : 'changes';
  const f = { q: '', field: '', source: '', project: ctx.query.project || '' };
  let offset = 0; const PAGE = 40;
  const body = h('div'), tabsEl = h('div', { class: 'tabs mb-16' });
  root.append(h('div', { class: 'page-h' }, h('div', h('h1', 'Change History'), h('div', { class: 'sub' }, 'A full audit trail: every field that changed in Google Sheets or in the app — previous value, new value, and when — plus the log of every synchronisation run.'))), tabsEl, body);
  const drawTabs = () => { clear(tabsEl); [['changes', 'Field changes'], ['sync', 'Sync runs']].forEach(([id, l]) => tabsEl.append(h('button', { class: tab === id ? 'on' : '', onClick: () => { tab = id; offset = 0; drawTabs(); load(); } }, l))); };

  const diffCell = (c) => {
    const long = (c.old_value || '').length > 60 || (c.new_value || '').length > 60;
    return h('div', { class: 'diff' },
      h('span', { class: `old ${c.old_value ? '' : 'none'}` }, c.old_value ? (long ? `${c.old_value.slice(0, 58)}…` : c.old_value) : '(empty)'), icon('arrow', 13),
      h('span', { class: `new ${c.new_value ? '' : 'none'}` }, c.new_value ? (long ? `${c.new_value.slice(0, 58)}…` : c.new_value) : '(empty)'),
      long && h('button', { class: 'btn xs ghost', onClick: (e) => { e.stopPropagation(); showDiff(c); } }, 'Compare'));
  };
  const showDiff = (c) => modal({ title: `${c.project_name} — ${c.label}`, width: 760, body: h('div', { class: 'cmp' }, h('div', h('div', { class: 'eyebrow mb-8' }, 'Previous'), h('div', { class: 'cmp-box old' }, c.old_value || '(empty)')), h('div', h('div', { class: 'eyebrow mb-8' }, 'Updated'), h('div', { class: 'cmp-box new' }, c.new_value || '(empty)'))) });

  async function loadChanges(append) {
    const r = await api.get(`/api/changes${api.qs({ ...f, limit: PAGE, offset })}`);
    if (!append) {
      clear(body).append(
        h('div', { class: 'row wrap gap-8 mb-16' },
          h('div', { class: 'input-ico', style: 'width:260px' }, icon('search', 15), h('input', { class: 'input', placeholder: 'Search project or value…', value: f.q, onInput: debounce((e) => { f.q = e.target.value; offset = 0; loadChanges(); }, 250) })),
          select([['', 'All fields'], ...r.fields], f.field, (v) => { f.field = v; offset = 0; loadChanges(); }, 'sm'),
          select([['', 'Sheet + App'], ['sheet', 'From Google Sheet'], ['app', 'Made in app']], f.source, (v) => { f.source = v; offset = 0; loadChanges(); }, 'sm'),
          f.project && h('button', { class: 'btn sm', onClick: () => { f.project = ''; offset = 0; loadChanges(); } }, `Project #${f.project}`, icon('x', 12)),
          h('div', { class: 'end dim' }, `${r.total} change${r.total === 1 ? '' : 's'}`)),
        h('div', { class: 'card flush', id: 'chg-card' }));
    }
    const card = body.querySelector('#chg-card');
    let table = card.querySelector('table');
    if (!table) {
      card.replaceChildren(r.items.length ? h('div', { class: 'table-wrap' }, table = h('table', { class: 't' }, h('thead', h('tr', ['When', 'Project', 'Field', 'Previous → Updated', 'Source', 'Result'].map((c) => h('th', c)))), h('tbody'))) : empty('history', 'No changes recorded', 'Edit a cell in the sheet simulator and sync to see detection in action.'));
    }
    if (table) {
      table.querySelector('tbody').append(...r.items.map((c) => h('tr', { class: 'click', onClick: () => go(`#/projects/${c.project_id}`) },
        h('td', { style: 'white-space:nowrap' }, h('div', fmt.time(c.created_at))),
        h('td', { style: 'max-width:260px' }, h('div', { class: 'trunc', style: 'font-weight:550' }, c.project_name), h('div', { class: 'mono dim', style: 'font-size:11px' }, c.project_code)),
        h('td', h('span', { class: 'tag' }, c.label)),
        h('td', { style: 'min-width:300px' }, diffCell(c)),
        h('td', h('span', { class: 'tag c', style: { '--c': c.source === 'sheet' ? 'var(--green)' : 'var(--violet)' } }, c.source === 'sheet' ? 'Google Sheet' : 'App')),
        h('td', c.applied ? h('span', { class: 'dim' }, 'Applied') : h('span', { class: 'tag c', style: { '--c': 'var(--amber)' }, 'data-tip': c.note || '' }, 'Ignored')))));
      card.querySelector('.more')?.remove();
      if (offset + PAGE < r.total) card.append(h('div', { class: 'more' }, h('button', { class: 'btn sm', onClick: () => { offset += PAGE; loadChanges(true); } }, `Load more (${r.total - offset - PAGE} left)`)));
    }
  }

  async function loadSync() {
    const r = await api.get('/api/sync/runs?limit=60');
    const ST = { success: 'var(--green)', failed: 'var(--red)', running: 'var(--amber)' };
    clear(body).append(
      h('div', { class: 'grid mb-16', style: 'grid-template-columns:repeat(auto-fit,minmax(min(170px,100%),1fr))' },
        stat('Last sync', r.lastSyncAt ? fmt.rel(r.lastSyncAt) : '—'), stat('Runs logged', r.runs.length), stat('Failures', r.runs.filter((x) => x.status === 'failed').length), stat('Avg duration', `${Math.round(r.runs.reduce((a, x) => a + (x.duration_ms || 0), 0) / Math.max(r.runs.length, 1))} ms`)),
      h('div', { class: 'card flush' }, r.runs.length ? h('div', { class: 'table-wrap' }, h('table', { class: 't' },
        h('thead', h('tr', ['Run', 'Started', 'Trigger', 'Status', 'Rows', 'New', 'Updated', 'Flagged', 'Assigned', 'Emails', 'Changes', 'Time'].map((c) => h('th', c)))),
        h('tbody', r.runs.flatMap((x) => {
          const det = h('tr', { class: 'hide detail-row' }, h('td', { colSpan: 12 }, runDetail(x)));
          return [h('tr', { class: 'click', onClick: () => det.classList.toggle('hide') }, h('td', { class: 'mono dim' }, `#${x.id}`), h('td', fmt.time(x.started_at)), h('td', h('span', { class: 'tag' }, x.trigger)),
            h('td', h('span', { class: 'pill', style: { '--c': ST[x.status] } }, x.status)), ...[x.rows_seen, x.created, x.updated, x.flagged, x.assigned, x.emails, x.changes].map((n) => h('td', { class: `mono num ${n ? '' : 'dim'}` }, n || '·')), h('td', { class: 'mono dim' }, `${x.duration_ms ?? '—'}ms`)), det];
        })))) : empty('refresh', 'No sync runs yet')));
  }
  const stat = (l, v) => h('div', { class: 'card', style: 'padding:14px 16px' }, h('div', { class: 'eyebrow' }, l), h('div', { style: 'font-size:22px;font-weight:650;letter-spacing:-.02em;margin-top:8px' }, v));
  const runDetail = (x) => {
    const d = x.detail || {};
    return h('div', { class: 'run-detail' }, x.error && h('div', { class: 'callout err mb-8' }, icon('alert', 15), x.error), d.note && h('div', { class: 'muted' }, d.note),
      d.created?.length ? h('div', `Created ${d.created.length} project(s)`) : null, d.updated?.length ? h('div', `Updated ${d.updated.length} project(s): ${d.updated.map((i) => `#${i}`).join(', ')}`) : null,
      d.removed?.length ? h('div', `Flagged as removed from sheet: ${d.removed.length}`) : null, d.assignment ? h('div', `Assignment workflow: ${d.assignment.assigned} assigned, ${d.assignment.unassigned} unassignable`) : null,
      ...(d.issues || []).map((i) => h('div', { class: 'row gap-8', style: 'color:var(--amber)' }, icon('alert', 13), i.message)),
      !x.error && !d.note && !d.created?.length && !d.updated?.length && !(d.issues || []).length ? h('div', { class: 'dim' }, 'No differences found — everything already matched.') : null);
  };

  const load = () => (tab === 'changes' ? loadChanges() : loadSync());
  liveOn('sync', () => { offset = 0; load(); });
  drawTabs(); await load();
}
