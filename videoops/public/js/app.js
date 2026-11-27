import { h, $, api, state, icon, fmt, avatar, toast, modal, go, clear, debounce, statusPill, syncNow, liveOn, _resetPageSubs, _emitLive, _setBootstrapHook, esc } from './core.js';

const NAV = [
  { id: 'dashboard', label: 'Dashboard', icon: 'dashboard' },
  { id: 'projects', label: 'All Projects', icon: 'projects' },
  { id: 'monthly', label: 'Monthly Briefs', icon: 'calendar' },
  { id: 'team', label: 'Team Management', icon: 'users' },
  { id: 'assignments', label: 'Assignments', icon: 'shuffle', badge: 'pending' },
  { id: 'notifications', label: 'Notifications', icon: 'bell', badge: 'unread' },
  { id: 'changes', label: 'Change History', icon: 'history' },
  { id: 'automation', label: 'Automation Settings', icon: 'zap', sec: 'Automation' },
  { id: 'integrations', label: 'Integrations', icon: 'plug' },
  { id: 'settings', label: 'Settings', icon: 'settings' },
];
const TITLES = { dashboard: 'Dashboard', projects: 'All Projects', monthly: 'Monthly Briefs', team: 'Team Management', assignments: 'Assignments', notifications: 'Notifications', changes: 'Change History', automation: 'Automation Settings', integrations: 'Integrations', settings: 'Settings', sheet: 'Integrations' };
const PAGES = { dashboard: () => import('./pages/dashboard.js'), projects: () => import('./pages/projects.js'), monthly: () => import('./pages/monthly.js'), team: () => import('./pages/team.js'), assignments: () => import('./pages/assignments.js'), notifications: () => import('./pages/notifications.js'), changes: () => import('./pages/changes.js'), automation: () => import('./pages/automation.js'), integrations: () => import('./pages/integrations.js'), settings: () => import('./pages/settings.js'), sheet: () => import('./pages/integrations.js') };

const root = $('#app');
let main, sidebar, crumbsEl, bellDot, pendingCount = 0;

async function loadBootstrap() {
  const b = await api.get('/api/bootstrap');
  Object.assign(state, { settings: b.settings, team: b.team, statuses: b.statuses, priorities: b.priorities, types: b.types, notifyTypes: b.notifyTypes, months: b.months, today: b.today, unread: b.unread, mode: b.mode, lastSyncAt: b.lastSyncAt, syncing: b.syncing, assignModes: b.assignModes });
  // team members carry live workload for pickers
  try { const t = await api.get('/api/team'); state.team = t; } catch { /* non-fatal */ }
  try { const d = await api.get('/api/assignments/board'); pendingCount = d.pending; } catch { /* non-fatal */ }
  paintChrome();
}
_setBootstrapHook(() => loadBootstrap().catch(() => {}));

// ───────────────────────── chrome
function buildShell() {
  clear(root);
  const navLinks = [];
  const nav = h('nav', { class: 'nav', 'aria-label': 'Main' });
  NAV.forEach((n) => {
    if (n.sec) nav.append(h('div', { class: 'nav-sec' }, n.sec));
    const a = h('a', { href: `#/${n.id}`, dataset: { id: n.id }, onClick: () => sidebar.classList.remove('open') }, h('span', { class: 'ico' }, icon(n.icon, 17)), h('span', { class: 'lbl' }, n.label), n.badge && h('span', { class: 'badge hide', dataset: { badge: n.badge } }));
    navLinks.push(a); nav.append(a);
  });
  sidebar = h('aside', { class: 'sidebar' },
    h('div', { class: 'brand' }, h('div', { class: 'brand-mark' }), h('div', h('div', { class: 'brand-name' }, state.settings.workspace?.name || 'Cult Video Ops'), h('div', { class: 'brand-sub' }, 'AI Video Hub'))),
    nav,
    h('div', { class: 'side-foot' },
      h('div', { class: 'sync-card', id: 'sync-card' }),
      h('div', { class: 'who' }, avatar({ name: state.settings.workspace?.owner_name, color: '#ffb454' }, 28), h('div', { class: 'meta' }, h('div', { class: 'n' }, state.settings.workspace?.owner_name), h('div', { class: 'e trunc' }, state.mode.googleConfigured ? 'Google account' : 'Demo workspace')))));
  crumbsEl = h('div', { class: 'crumbs' });
  bellDot = h('span', { class: 'dot hide' });
  main = h('main', { class: 'main' },
    h('header', { class: 'topbar' },
      h('button', { class: 'icon-btn menu-btn', 'aria-label': 'Menu', onClick: () => { sidebar.classList.toggle('open'); } }, icon('menu', 18)),
      crumbsEl, h('div', { class: 'grow' }),
      h('span', { class: `mode-chip ${state.mode.sheet === 'google' ? 'live' : 'demo'}`, id: 'mode-chip' }),
      h('button', { class: 'search-btn', onClick: openPalette, 'aria-label': 'Search' }, icon('search', 15), h('span', 'Search projects, jump to…'), h('span', { class: 'kbd' }, '⌘K')),
      h('a', { class: 'icon-btn', href: '#/notifications', 'aria-label': 'Notifications', 'data-tip': 'Notifications' }, icon('bell', 18), bellDot)),
    h('div', { id: 'view' }));
  root.append(h('div', { class: 'shell' }, sidebar, main));
  window.addEventListener('syncstate', paintSync);
  document.addEventListener('keydown', (e) => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); openPalette(); } });
}
function paintChrome() {
  if (!sidebar) return;
  sidebar.querySelectorAll('[data-badge]').forEach((b) => {
    const v = b.dataset.badge === 'unread' ? state.unread : pendingCount;
    b.textContent = v > 99 ? '99+' : v; b.classList.toggle('hide', !v); b.classList.toggle('soft', b.dataset.badge === 'pending');
  });
  bellDot.textContent = state.unread > 99 ? '99+' : state.unread; bellDot.classList.toggle('hide', !state.unread);
  const chip = $('#mode-chip');
  if (chip) { const live = state.mode.sheet === 'google'; chip.className = `mode-chip ${live ? 'live' : 'demo'}`; chip.replaceChildren(h('span', { class: 'live-dot', style: live ? '' : { background: 'var(--accent)' } }), live ? 'Live · Google Sheets' : 'Demo workspace'); }
  paintSync();
}
function paintSync() {
  const el = $('#sync-card'); if (!el) return;
  const s = state.settings.monitor || {};
  el.replaceChildren(
    h('div', { class: 'sync-top' }, h('span', { class: `live-dot ${state.syncing ? 'busy' : s.enabled ? '' : 'off'}` }), h('span', state.syncing ? 'Syncing sheet…' : s.enabled ? 'Monitoring live' : 'Monitoring paused')),
    h('div', { class: 'sync-sub' }, state.lastSyncAt ? `Checked ${fmt.rel(state.lastSyncAt)} · every ${s.interval_min || 5}m` : 'Not synced yet'),
    h('button', { class: 'btn sm', style: 'width:100%', onClick: async () => { const r = await syncNow('manual'); if (r) announceSync(r, true); }, disabled: state.syncing }, icon('refresh', 14, state.syncing ? 'spin' : ''), h('span', state.syncing ? 'Syncing…' : 'Sync now')));
}
function announceSync(r, manual) {
  if (r.status === 'failed') return toast('Sync failed', { type: 'err', sub: r.error });
  const bits = [];
  if (r.created) bits.push(`${r.created} new brief${r.created > 1 ? 's' : ''} imported`);
  if (r.changes) bits.push(`${r.changes} change${r.changes > 1 ? 's' : ''} detected`);
  if (r.assigned) bits.push(`${r.assigned} auto-assigned`);
  if (bits.length) toast('Sheet synced', { type: 'ok', sub: bits.join(' · ') }); else if (manual) toast('Sheet is up to date', { type: 'ok', sub: 'No new briefs or changes' });
}

// ───────────────────────── router
let renderToken = 0;
function parseHash() {
  const raw = location.hash.replace(/^#\/?/, '') || 'dashboard';
  const [path, qs] = raw.split('?');
  const [id, ...rest] = path.split('/');
  return { id: PAGES[id] ? id : 'dashboard', params: rest, query: Object.fromEntries(new URLSearchParams(qs || '')) };
}
async function route() {
  if (!main) return;
  const { id, params, query } = parseHash();
  const token = ++renderToken; _resetPageSubs();
  sidebar.querySelectorAll('.nav a').forEach((a) => a.classList.toggle('active', a.dataset.id === (id === 'sheet' ? 'integrations' : id)));
  const view = $('#view'); view.replaceChildren(h('div', { class: 'page' }, h('div', { class: 'skeleton', style: 'height:30px;width:260px;margin-bottom:22px' }), h('div', { class: 'grid', style: 'grid-template-columns:repeat(4,1fr)' }, [1, 2, 3, 4].map(() => h('div', { class: 'skeleton', style: 'height:92px;border-radius:14px' })))));
  setCrumbs([TITLES[id]]);
  try {
    const mod = await PAGES[id]();
    if (token !== renderToken) return;
    const page = h('div', { class: 'page' });
    const ctx = { root: page, params, query, route: id, setCrumbs, reload: route, go };
    await mod.default(ctx);
    if (token !== renderToken) return;
    view.replaceChildren(page); window.scrollTo(0, 0);
  } catch (e) {
    console.error(e);
    if (token === renderToken) view.replaceChildren(h('div', { class: 'page' }, h('div', { class: 'callout err' }, icon('alert', 16), h('div', h('b', 'This page failed to load'), h('div', e.message || String(e))))));
  }
}
function setCrumbs(parts) {
  crumbsEl.replaceChildren(...parts.flatMap((p, i) => [i ? h('span', { class: 'sep' }, '/') : null, typeof p === 'string' ? (i === parts.length - 1 ? h('b', p) : h('span', p)) : p]).filter(Boolean));
  document.title = `${parts.at(-1)} · Cult Video Ops`;
}

// ───────────────────────── command palette
function openPalette() {
  const pages = NAV.map((n) => ({ label: `Go to ${n.label}`, icon: n.icon, run: () => go(`#/${n.id}`), kw: n.label }));
  const actions = [
    { label: 'Sync Google Sheet now', icon: 'refresh', run: async () => { const r = await syncNow('manual'); if (r) announceSync(r, true); } },
    { label: 'Run automatic assignment', icon: 'shuffle', run: () => go('#/assignments') },
    { label: 'Add a teammate', icon: 'plus', run: () => go('#/team?add=1') },
    { label: 'Open sheet simulator', icon: 'sheet', run: () => go('#/sheet') },
  ];
  let results = [], sel = 0, token = 0;
  const list = h('div', { style: 'max-height:380px;overflow:auto;padding:6px' });
  const input = h('input', { class: 'input', placeholder: 'Search projects, or type a command…', style: 'height:44px;font-size:14.5px;border-radius:12px' });
  const draw = () => {
    list.replaceChildren(...(results.length ? results.map((r, i) => h('button', { class: `m-item ${i === sel ? 'hl' : ''}`, style: 'border:0;background:none;width:100%;text-align:left;color:inherit;border-radius:9px;padding:9px 10px;display:flex;gap:10px;align-items:center;cursor:pointer;' + (i === sel ? 'background:var(--surface-4)' : ''), onMouseenter: () => { sel = i; draw(); }, onClick: () => { m.close(); r.run(); } },
      r.icon ? icon(r.icon, 16) : icon('film', 16), h('span', { class: 'grow trunc' }, r.label), r.sub && h('span', { class: 'dim', style: 'font-size:12px' }, r.sub), r.status && statusPill(r.status))) : [h('div', { class: 'dim', style: 'padding:22px;text-align:center' }, 'No results')]));
  };
  const search = debounce(async () => {
    const q = input.value.trim(); const mine = ++token;
    const cmds = [...actions, ...pages].filter((c) => !q || `${c.label} ${c.kw || ''}`.toLowerCase().includes(q.toLowerCase())).slice(0, q ? 5 : 9);
    let projects = [];
    if (q) { try { const r = await api.get(`/api/projects${api.qs({ q, pageSize: 7, sort: 'updated', dir: 'desc' })}`); projects = r.items.map((p) => ({ label: p.name, sub: `${p.code} · ${p.assignee_name || 'Unassigned'}`, status: p.status, run: () => go(`#/projects/${p.id}`) })); } catch { /* ignore */ } }
    if (mine !== token) return; results = [...projects, ...cmds]; sel = 0; draw();
  }, 120);
  input.addEventListener('input', search);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); sel = Math.min(sel + 1, results.length - 1); draw(); } if (e.key === 'ArrowUp') { e.preventDefault(); sel = Math.max(sel - 1, 0); draw(); }
    if (e.key === 'Enter' && results[sel]) { m.close(); results[sel].run(); }
  });
  const m = modal({ title: 'Command', width: 600, body: h('div', input, h('div', { style: 'height:8px' }), list) });
  m.el.querySelector('.modal-h').style.display = 'none'; m.el.querySelector('.modal').style.marginBottom = '12vh'; m.el.style.alignItems = 'start'; m.el.style.paddingTop = '12vh';
  search(); input.focus();
}

// ───────────────────────── live events (SSE)
function connectEvents() {
  const es = new EventSource('/api/events');
  es.onmessage = async (m) => {
    const e = JSON.parse(m.data);
    if (e.type === 'sync') {
      await loadBootstrap().catch(() => {});
      // syncs started from this tab toast their own result — only announce background (scheduled / other-tab) syncs
      if (!state.localSync && Date.now() - (state.localSyncDoneAt || 0) > 4000) announceSync(e, false);
      _emitLive(e);
    } else if (e.type === 'notification') {
      state.unread += 1; paintChrome(); _emitLive(e);
    }
  };
}

// ───────────────────────── boot
async function boot() {
  let sess;
  try { sess = await api.get('/api/session'); } catch { sess = { live: false, authenticated: true }; }
  if (sess.live && !sess.authenticated) {
    root.replaceChildren(h('div', { class: 'login' }, h('div', { class: 'card' },
      h('div', { class: 'brand-mark', style: 'margin:0 auto 18px;width:44px;height:44px' }),
      h('h1', { style: 'margin:0 0 6px;font-size:22px;letter-spacing:-.02em' }, 'Cult Video Ops'),
      h('p', { class: 'muted', style: 'margin:0 0 24px' }, 'AI Video Production Project Management & Automation'),
      h('a', { class: 'btn primary', style: 'height:42px;width:100%', href: '/auth/google' }, icon('google', 16), 'Continue with Google'),
      h('p', { class: 'dim', style: 'font-size:12px;margin:16px 0 0' }, 'Connects Google Sheets (read-only) and Gmail (send-only).'))));
    return;
  }
  await loadBootstrap();
  buildShell(); paintChrome();
  window.addEventListener('hashchange', route);
  connectEvents();
  setInterval(paintSync, 30000);
  route();
}
boot().catch((e) => { root.replaceChildren(h('div', { class: 'login' }, h('div', { class: 'card' }, h('h2', 'Could not start'), h('p', { class: 'muted' }, e.message)))); console.error(e); });
void liveOn; void esc;
