import { h, api, act, icon, fmt, state, avatar, statusPill, modal, confirmDialog, toast, toggle, segmented, field, menu, empty, refreshBootstrap, go, liveOn, skeleton } from '../core.js';
import { ring } from '../charts.js';

const AVAIL = { available: ['Available', 'var(--green)'], limited: ['Limited (50%)', 'var(--amber)'], unavailable: ['Unavailable', 'var(--gray)'] };
const balance = (counts) => {
  if (counts.length < 2) return 100;
  const max = Math.max(...counts), min = Math.min(...counts), avg = counts.reduce((a, b) => a + b, 0) / counts.length;
  if (!avg) return 100;
  return Math.max(0, Math.round(100 - ((max - min) / Math.max(avg, 1)) * 40));
};
const daysTo = (d) => Math.round((new Date(`${d}T00:00:00Z`) - new Date(`${state.today}T00:00:00Z`)) / 86400000);
export function dueTag(p) {
  if (!p.deadline) return h('span', { class: 'tag c due-tag warn' }, 'No deadline');
  const d = daysTo(p.deadline); let tone = 'ok', text = fmt.date(p.deadline);
  if (p.status === 'Completed') tone = 'done';
  else if (d < 0 && p.status !== 'On Hold') { tone = 'bad'; text = `${-d}d overdue`; } else if (d === 0) { tone = 'warn'; text = 'Due today'; } else if (d <= 3) { tone = 'soon'; text = `in ${d}d`; }
  return h('span', { class: `tag c due-tag ${tone}` }, icon('clock', 11), text);
}
const stateOf = (m) => m.onLeave ? [`On leave until ${fmt.date(m.leave_until, true)}`, 'var(--coral)'] : AVAIL[m.availability] || AVAIL.available;

export default async function render(ctx) {
  const { root } = ctx;
  let team = [];
  const wrap = h('div'); root.append(wrap);
  wrap.append(h('div', { class: 'skeleton', style: 'height:200px' }));
  // workload unit: videos+GIFs to make (default) or plain project count
  const byDel = () => state.settings.assign?.weight_mode === 'deliverables';
  const load_ = (m) => (byDel() ? m.deliverables : m.active);
  const unitLbl = () => (byDel() ? 'videos & GIFs' : 'projects');
  const load = async () => { team = await api.get('/api/team'); draw(); };
  const mutated = async () => { refreshBootstrap(); await load(); };

  function draw() {
    const mates = team.filter((m) => !m.is_owner || m.enabled), owner = team.find((m) => m.is_owner && !m.enabled);
    const avail = mates.filter((m) => m.available);
    const counts = avail.map(load_);
    const avg = counts.length ? counts.reduce((a, b) => a + b, 0) / counts.length : 0;
    const score = balance(counts);
    wrap.replaceChildren(
      h('div', { class: 'page-h' },
        h('div', h('div', { class: 'eyebrow', style: 'margin-bottom:8px' }, 'Team'), h('h1', 'Team Management'),
          h('div', { class: 'sub' }, `${avail.length} of ${mates.length} teammates available for auto-assignment · balance score ${score}/100`)),
        h('div', { class: 'actions' }, h('button', { class: 'btn primary', onClick: () => editor() }, icon('plus', 15), 'Add teammate'))),
      workloadPanel(mates, avail, avg, score),
      mates.length ? h('div', { class: 'tm-grid' }, mates.map(card)) : empty('users', 'No teammates yet', 'Add your editors so new briefs can be distributed automatically.', h('button', { class: 'btn primary', onClick: () => editor() }, icon('plus', 15), 'Add teammate')),
      owner && ownerRow(owner));
  }

  function workloadPanel(mates, avail, avg, score) {
    const spread = byDel() ? 2 : 1;
    const scale = Math.max(1, ...avail.map(load_), avg * 1.3) * 1.12;
    const loadColor = (m) => (load_(m) > avg + 1.5 * spread ? 'var(--coral)' : load_(m) > avg + 0.5 * spread ? 'var(--amber)' : load_(m) < avg - spread ? 'var(--blue)' : 'var(--teal)');
    const out = mates.filter((m) => !m.available);
    return h('div', { class: 'tm-summary' },
      h('div', { class: 'card tm-balance' }, ring({ value: score, size: 86, thickness: 9, color: score >= 80 ? 'var(--green)' : score >= 60 ? 'var(--amber)' : 'var(--coral)', label: String(score) }),
        h('div', h('h3', 'Balance score'), h('div', { class: 'muted', style: 'font-size:12.5px;line-height:1.5' }, score >= 85 ? 'Workload is evenly spread across available teammates.' : 'Some teammates carry noticeably more than others. New briefs go to the least loaded.'))),
      h('div', { class: 'card' }, h('div', { class: 'card-h' }, h('h3', 'Team workload'), h('span', { class: 'sub' }, `Active ${unitLbl()} per available teammate`), h('div', { class: 'right dim', style: 'font-size:11.5px;display:flex;gap:12px;align-items:center' }, h('span', { class: 'row gap-6' }, h('i', { style: 'width:2px;height:12px;background:var(--text);opacity:.75;display:block' }), `Avg ${avg.toFixed(1)}`))),
        h('div', { class: 'card-b col gap-12' }, avail.length ? avail.map((m) => h('div', { class: 'tm-load-row' },
          h('div', { class: 'row gap-8', style: 'min-width:0' }, avatar(m, 22), h('span', { class: 'trunc', style: 'font-weight:550;font-size:12.5px' }, m.name)),
          h('div', { class: 'tm-track' }, h('i', { style: { width: `${(load_(m) / scale) * 100}%`, '--c': loadColor(m) } }), h('b', { style: { left: `${(avg / scale) * 100}%` } })),
          h('div', { class: 'mono muted num', style: 'text-align:right;font-size:12px', 'data-tip': `${m.active} projects · ${m.deliverables} videos/GIFs` }, String(load_(m))))) : h('div', { class: 'dim' }, 'No teammates are currently available.'),
          out.length ? h('div', { class: 'dim', style: 'font-size:11.5px;padding-top:4px;border-top:1px solid var(--line)' }, `Not receiving new projects: ${out.map((m) => `${m.name.split(' ')[0]} (${m.onLeave ? 'on leave' : !m.enabled ? 'auto-assign off' : 'unavailable'})`).join(', ')}`) : null)));
  }

  function card(m) {
    const avgAll = team.filter((x) => (!x.is_owner || x.enabled) && x.available).map(load_); const avg = avgAll.length ? avgAll.reduce((a, b) => a + b, 0) / avgAll.length : 0;
    const [label, color] = stateOf(m);
    const cap = m.max_active, pctBase = Math.max(...team.filter((x) => !x.is_owner || x.enabled).map(load_), 1) * 1.15;
    const sp = byDel() ? 2 : 1;
    const col = load_(m) > avg + 1.5 * sp ? 'var(--coral)' : load_(m) > avg + 0.5 * sp ? 'var(--amber)' : load_(m) < avg - sp ? 'var(--blue)' : 'var(--teal)';
    const p = m.prefs || {};
    const chips = [...(p.preferred_types || []).map((t) => [t, 'var(--teal)']), ...(p.preferred_brands || []).map((t) => [t, 'var(--teal)']), ...(p.excluded_types || []).map((t) => [`No ${t}`, 'var(--coral)']), ...(p.excluded_brands || []).map((t) => [`No ${t}`, 'var(--coral)'])];
    const mbtn = h('button', { class: 'icon-btn', 'aria-label': 'Teammate actions', onClick: () => menu(mbtn, [
      { label: 'Edit teammate', icon: 'edit', onClick: () => editor(m) },
      { label: m.availability === 'unavailable' || m.onLeave ? 'Set available' : 'Set unavailable', icon: m.availability === 'unavailable' || m.onLeave ? 'check' : 'pause', onClick: () => quickAvail(m) },
      ...(m.is_owner ? [] : [{ divider: true }, { label: 'Remove teammate', icon: 'trash', onClick: () => remove(m) }])]) }, icon('more', 18));
    return h('div', { class: `card tm-card ${m.available ? '' : 'off'}` },
      h('div', { class: 'tm-top' }, avatar(m, 42), h('div', { class: 'grow', style: 'min-width:0' }, h('div', { class: 'nm' }, m.is_owner ? `${m.name} (you)` : m.name), h('div', { class: 'role' }, m.is_owner ? 'Project Manager · also takes projects' : (m.role || 'AI Video Editor')), h('div', { class: 'tm-mail' }, icon('mail', 12), m.email)), mbtn),
      h('div', { class: 'row wrap gap-6' }, h('span', { class: 'tm-state', style: { '--c': color } }, h('i'), label), !m.enabled ? h('span', { class: 'tag' }, 'Auto-assign off') : null),
      h('div', { class: 'tm-meter' }, h('div', { class: 'top' }, h('span', h('b', String(load_(m))), ` active ${unitLbl()}`), h('span', { class: 'dim' }, cap ? `cap ${cap} projects` : `team avg ${avg.toFixed(1)}`)),
        h('div', { class: 'progress' }, h('i', { style: { width: `${Math.min(100, (load_(m) / pctBase) * 100)}%`, '--c': col } }))),
      h('div', { class: 'tm-stats' }, stat(m.active, 'Projects'), stat(m.deliverables, 'Videos/GIFs'), stat(m.overdue, 'Overdue', m.overdue > 0)),
      chips.length ? h('div', { class: 'tm-chips' }, chips.map(([t, c]) => h('span', { class: 'tm-chip', style: { '--c': c } }, t))) : h('div', { class: 'dim', style: 'font-size:12px' }, 'No assignment preferences set'),
      m.projects.length ? h('details', { class: 'tm-proj' }, h('summary', icon('right', 13), `Ongoing projects (${m.projects.length})`), h('div', { class: 'tm-plist' }, m.projects.map((pr) => h('div', { class: 'tm-pitem', onClick: () => go(`#/projects/${pr.id}`) }, h('div', h('div', { class: 'n' }, pr.name), h('div', { class: 'c' }, pr.code)), h('div', { class: 'col gap-4', style: 'align-items:flex-end' }, dueTag(pr), statusPill(pr.status)))))) : h('div', { class: 'dim', style: 'font-size:12px' }, 'No ongoing projects'),
      h('div', { class: 'tm-auto' }, h('span', { class: 'grow' }, h('span', { class: 't' }, 'Auto-assign'), h('span', { class: 'dim' }, m.enabled ? ' · receives new briefs' : ' · skipped by automation')),
        toggle({ checked: m.enabled, label: `Auto-assign ${m.name}`, onChange: async (v) => { const r = await act(() => api.patch(`/api/team/${m.id}`, { enabled: v }), `${m.name.split(' ')[0]} ${v ? 'will now receive' : 'is excluded from'} auto-assignments`); if (r) mutated(); else load(); } })));
  }
  const stat = (n, l, bad) => h('div', { class: `tm-stat ${bad ? 'bad' : ''}` }, h('b', String(n)), h('span', l));

  function ownerRow(o) {
    return h('div', { class: 'card tm-owner' }, avatar(o, 38), h('div', { class: 'grow' }, h('div', { style: 'font-weight:620' }, `${o.name} (you)`), h('div', { class: 'dim', style: 'font-size:12px' }, 'Project Manager · not receiving auto-assigned projects — only “Assign to me”')),
      h('div', { class: 'tm-stat', style: 'min-width:92px' }, h('b', String(o.active)), h('span', 'Assigned to me')),
      h('label', { class: 'row gap-8', style: 'cursor:pointer' }, toggle({ checked: false, label: 'Also take projects', onChange: async (v) => { const r = await act(() => api.patch(`/api/team/${o.id}`, { enabled: v }), 'You will now receive auto-assigned projects'); if (r) mutated(); } }), h('span', { class: 'muted', style: 'font-size:12.5px' }, 'Also take projects')),
      o.projects.length ? h('a', { class: 'btn sm', href: `#/projects?assignee=${o.id}` }, 'View', icon('arrow', 13)) : null);
  }

  async function quickAvail(m) {
    const makeAvail = m.availability === 'unavailable' || m.onLeave;
    const r = await act(() => api.patch(`/api/team/${m.id}`, makeAvail ? { availability: 'available', leave_until: null } : { availability: 'unavailable' }), `${m.name.split(' ')[0]} is now ${makeAvail ? 'available' : 'unavailable'}`);
    if (r) mutated();
  }
  async function remove(m) {
    if (!(await confirmDialog({ title: `Remove ${m.name}?`, message: 'They will stop receiving assignments. This cannot be undone. Teammates with active projects must be reassigned first.', confirmLabel: 'Remove', danger: true }))) return;
    try { await api.del(`/api/team/${m.id}`); toast(`${m.name} removed`, { type: 'ok' }); mutated(); } catch (e) { toast(e.message, { type: 'err', ms: 6000 }); }
  }

  function chipPicker(options, selected, color, onChange) {
    const box = h('div', { class: 'row wrap gap-6' });
    const paint = () => box.replaceChildren(...options.map((o) => h('button', { type: 'button', class: `tm-chipbtn ${selected.has(o) ? 'on' : ''}`, style: { '--c': color }, onClick: () => { selected.has(o) ? selected.delete(o) : selected.add(o); onChange?.(); paint(); } }, selected.has(o) ? icon('check', 12) : null, o)));
    paint(); return box;
  }

  function editor(m) {
    const edit = !!m;
    const p = m?.prefs || {};
    const f = { name: m?.name || '', email: m?.email || '', role: m?.role || 'AI Video Editor', availability: m?.availability || 'available', leave_until: m?.leave_until || '', max_active: m?.max_active ?? '', enabled: m ? m.enabled : true };
    const prefT = new Set(p.preferred_types || []), exT = new Set(p.excluded_types || []);
    const err = h('div', { class: 'callout err hide' });
    const helper = h('div', { class: 'dim', style: 'font-size:11.5px;margin-top:6px' });
    const helperTxt = { available: 'Receives a full share of new projects.', limited: 'Counts as half capacity — receives roughly half as many new projects.', unavailable: 'Never receives automatic assignments (existing projects stay).' };
    const paintHelp = () => { helper.textContent = helperTxt[f.availability]; };
    paintHelp();
    const inp = (k, o = {}) => h('input', { class: 'input', value: f[k], ...o, onInput: (e) => { f[k] = e.target.value; } });
    const brandsIn = h('input', { class: 'input', placeholder: 'e.g. Cult Apparel, Cult Gear', value: (p.preferred_brands || []).join(', ') });
    const exBrandsIn = h('input', { class: 'input', placeholder: 'e.g. Mind.fit', value: (p.excluded_brands || []).join(', ') });
    const body = h('div', { class: 'tm-form' },
      err,
      field('Full name', inp('name', { placeholder: 'Aarav Mehta' })), field('Gmail address', inp('email', { type: 'email', placeholder: 'name@gmail.com' }), 'Assignment emails are sent here.'),
      field('Role', inp('role', { placeholder: 'AI Video Editor' })), field('Max active projects', inp('max_active', { type: 'number', min: 1, placeholder: 'No limit' }), 'Optional hard cap for auto-assignment.'),
      h('div', { class: 'full' }, field('Availability', segmented([['available', 'Available'], ['limited', 'Limited'], ['unavailable', 'Unavailable']], f.availability, (v) => { f.availability = v; paintHelp(); }), null), helper),
      field('On leave until', inp('leave_until', { type: 'date' }), 'Skipped by auto-assign through this date.'),
      field('Auto-assign', h('div', { class: 'row gap-10', style: 'height:34px' }, toggle({ checked: f.enabled, label: 'Auto-assign', onChange: (v) => { f.enabled = v; } }), h('span', { class: 'muted' }, 'Include in automatic distribution')), null),
      h('div', { class: 'tm-sec full' }, 'Assignment preferences'),
      h('div', { class: 'full' }, field('Preferred project types', chipPicker(state.types, prefT, 'var(--teal)'), 'Soft preference — used as a tie-breaker, never at the cost of fairness.')),
      h('div', { class: 'full' }, field('Preferred brands', brandsIn)),
      h('div', { class: 'tm-sec full' }, 'Restrictions'),
      h('div', { class: 'full' }, field('Never assign these types', chipPicker(state.types, exT, 'var(--coral)'), 'Hard rule — the automation will skip this teammate for these projects.')),
      h('div', { class: 'full' }, field('Never assign these brands', exBrandsIn)));
    const list = (s) => s.split(',').map((x) => x.trim()).filter(Boolean);
    modal({ title: edit ? `Edit ${m.name}` : 'Add teammate', width: 640, body, actions: (close) => [
      h('button', { class: 'btn', onClick: close }, 'Cancel'),
      h('button', { class: 'btn primary', onClick: async (e) => {
        err.classList.add('hide');
        if (!f.name.trim()) return showErr('Name is required');
        if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(f.email.trim())) return showErr('Enter a valid email address');
        const payload = { name: f.name.trim(), email: f.email.trim(), role: f.role.trim() || 'AI Video Editor', enabled: f.enabled, availability: f.availability, leave_until: f.leave_until || null, max_active: f.max_active === '' ? null : +f.max_active,
          prefs: { preferred_types: [...prefT], preferred_brands: list(brandsIn.value), excluded_types: [...exT], excluded_brands: list(exBrandsIn.value) } };
        e.currentTarget.disabled = true;
        try { edit ? await api.patch(`/api/team/${m.id}`, payload) : await api.post('/api/team', payload); toast(edit ? 'Teammate updated' : `${payload.name} added to the team`, { type: 'ok', sub: edit ? undefined : 'Any waiting projects were distributed automatically' }); close(); mutated(); }
        catch (ex) { e.target.disabled = false; showErr(ex.message); }
      } }, edit ? 'Save changes' : 'Add teammate')] });
    function showErr(msg) { err.replaceChildren(icon('alert', 15), msg); err.classList.remove('hide'); err.scrollIntoView({ block: 'nearest' }); }
  }

  await load();
  liveOn('sync', load);
  if (ctx.query.add) { history.replaceState(null, '', '#/team'); editor(); }
}
void skeleton;
