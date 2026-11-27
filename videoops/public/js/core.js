/* ──────────────────────────────────────────────────────────────────────────────
   core.js — shared helpers & UI kit for every page.
   h()           hyperscript element builder
   api           fetch wrapper (JSON). Throws Error(message) on failure.
   state         global app state (settings, team, statuses…) refreshed by app.js
   icon()        inline SVG icons        fmt        formatters
   statusPill / priorityTag / avatar / chip components
   menu / pickStatus / pickAssignee / modal / confirmDialog / drawer / toast
   go() / liveOn()  navigation + live (SSE) events scoped to the current page
   ────────────────────────────────────────────────────────────────────────────── */

export const state = { settings: {}, team: [], statuses: [], priorities: [], types: [], notifyTypes: {}, months: [], today: '', unread: 0, mode: {}, lastSyncAt: null, syncing: false };

// ───────────────────────── DOM
export function h(tag, props, ...kids) {
  const el = typeof tag === 'string' ? document.createElement(tag) : tag;
  if (props != null && (typeof props !== 'object' || props instanceof Node || Array.isArray(props))) { kids.unshift(props); props = null; }
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style') { if (typeof v === 'string') el.style.cssText = v; else for (const [sk, sv] of Object.entries(v)) sk.startsWith('--') ? el.style.setProperty(sk, sv) : (el.style[sk] = sv); }
    else if (k === 'html') el.innerHTML = v;
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else if (k in el && k !== 'list' && typeof v !== 'string' || ['value', 'checked', 'disabled', 'selected', 'placeholder', 'type', 'href', 'target', 'rel', 'title', 'id', 'for', 'name', 'rows', 'min', 'max', 'step', 'colSpan', 'draggable'].includes(k)) { try { el[k] = v; } catch { el.setAttribute(k, v); } }
    else el.setAttribute(k, v === true ? '' : v);
  }
  const add = (c) => { if (c == null || c === false || c === true) return; if (Array.isArray(c)) c.forEach(add); else el.append(c instanceof Node ? c : document.createTextNode(String(c))); };
  kids.forEach(add);
  return el;
}
export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];
export const clear = (el) => { el.replaceChildren(); return el; };
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const debounce = (fn, ms = 250) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };

// ───────────────────────── API
async function req(method, url, body) {
  const r = await fetch(url, { method, headers: body !== undefined ? { 'Content-Type': 'application/json' } : {}, body: body !== undefined ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => ({}));
  if (r.status === 401) { location.reload(); throw new Error('Signed out'); }
  if (!r.ok) throw Object.assign(new Error(j.error || `Request failed (${r.status})`), { status: r.status });
  return j;
}
export const api = {
  get: (u) => req('GET', u), post: (u, b = {}) => req('POST', u, b), put: (u, b = {}) => req('PUT', u, b), patch: (u, b = {}) => req('PATCH', u, b), del: (u) => req('DELETE', u),
  qs: (o) => { const p = new URLSearchParams(); for (const [k, v] of Object.entries(o)) if (v !== '' && v != null && v !== false) p.set(k, v); const s = p.toString(); return s ? `?${s}` : ''; },
};
/** Run an async action; toast the error if it fails, the success message if given. Returns result or undefined. */
export async function act(fn, ok) { try { const r = await fn(); if (ok) toast(ok, { type: 'ok' }); return r; } catch (e) { toast(e.message || 'Something went wrong', { type: 'err' }); return undefined; } }

// ───────────────────────── Icons (stroke, 24px grid)
const P = {
  dashboard: '<rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/>',
  projects: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
  film: '<rect x="3" y="3" width="18" height="18" rx="2.5"/><path d="M7 3v18M17 3v18M3 8h4M3 12h4M3 16h4M17 8h4M17 12h4M17 16h4"/>',
  calendar: '<rect x="3" y="4.5" width="18" height="16.5" rx="2.5"/><path d="M8 2.5v4M16 2.5v4M3 10h18"/>',
  users: '<path d="M16 20v-1.5a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4V20"/><circle cx="9.5" cy="8" r="3.5"/><path d="M21 20v-1.5a4 4 0 0 0-3-3.87M16 4.13a3.5 3.5 0 0 1 0 6.75"/>',
  shuffle: '<path d="M16 3h5v5M4 20 21 3M21 16v5h-5M15 15l6 6M4 4l5 5"/>',
  bell: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.94 1.94 0 0 0 3.4 0"/>',
  history: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5M12 7v5l3 2"/>',
  zap: '<path d="M13 2 3 14h9l-1 8 10-12h-9z"/>',
  plug: '<path d="M12 22v-5M9 8V2M15 8V2M18 8v4a6 6 0 0 1-12 0V8z"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>',
  plus: '<path d="M12 5v14M5 12h14"/>', check: '<path d="M20 6 9 17l-5-5"/>', x: '<path d="M18 6 6 18M6 6l12 12"/>',
  down: '<path d="m6 9 6 6 6-6"/>', up: '<path d="m18 15-6-6-6 6"/>', right: '<path d="m9 18 6-6-6-6"/>', left: '<path d="m15 18-6-6 6-6"/>', arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="2.5"/><path d="m3 7 9 6 9-6"/>',
  sheet: '<rect x="3" y="3" width="18" height="18" rx="2.5"/><path d="M3 9h18M3 15h18M9 3v18"/>',
  refresh: '<path d="M21 12a9 9 0 0 0-15.5-6.2L3 8M3 3v5h5M3 12a9 9 0 0 0 15.5 6.2L21 16M21 21v-5h-5"/>',
  alert: '<path d="m10.3 3.9-8.2 14a2 2 0 0 0 1.7 3h16.4a2 2 0 0 0 1.7-3l-8.2-14a2 2 0 0 0-3.4 0zM12 9v4M12 17h.01"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>', link: '<path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/>',
  ext: '<path d="M15 3h6v6M10 14 21 3M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>',
  filter: '<path d="M22 3H2l8 9.5V19l4 2v-8.5z"/>', more: '<circle cx="5" cy="12" r="1.2"/><circle cx="12" cy="12" r="1.2"/><circle cx="19" cy="12" r="1.2"/>',
  edit: '<path d="M12 20h9M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z"/>', trash: '<path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21v-1a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v1"/>', send: '<path d="m22 2-11 11M22 2l-7 20-4-9-9-4z"/>',
  play: '<path d="m7 4 13 8-13 8z"/>', pause: '<rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/>',
  sparkles: '<path d="m12 3 1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9zM19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z"/>',
  shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/>', inbox: '<path d="M22 12h-6l-2 3h-4l-2-3H2M5.5 5.1 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.5-6.9A2 2 0 0 0 16.7 4H7.3a2 2 0 0 0-1.8 1.1z"/>',
  download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/>', copy: '<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
  flag: '<path d="M4 22V4M4 4h13l-2 4 2 4H4"/>', message: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>', lock: '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  eye: '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>', info: '<circle cx="12" cy="12" r="9"/><path d="M12 16v-4M12 8h.01"/>',
  layers: '<path d="m12 2 10 5-10 5L2 7zM2 17l10 5 10-5M2 12l10 5 10-5"/>', target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
  trend: '<path d="m22 7-8.5 8.5-5-5L2 17M16 7h6v6"/>', gauge: '<path d="m12 14 4-4M3.3 17a10 10 0 1 1 17.4 0"/>', cmd: '<path d="M15 6a3 3 0 1 1 3 3h-3zM15 6v12M9 6a3 3 0 1 0-3 3h3zM9 6v12M9 18a3 3 0 1 1-3-3h3zM15 18a3 3 0 1 0 3-3h-3z"/>',
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>', grip: '<circle cx="9" cy="6" r="1.2"/><circle cx="15" cy="6" r="1.2"/><circle cx="9" cy="12" r="1.2"/><circle cx="15" cy="12" r="1.2"/><circle cx="9" cy="18" r="1.2"/><circle cx="15" cy="18" r="1.2"/>',
  pin: '<path d="M12 22s7-6.5 7-12a7 7 0 0 0-14 0c0 5.5 7 12 7 12z"/><circle cx="12" cy="10" r="2.5"/>', logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>',
  google: '<path d="M21.8 12.2c0-.7-.1-1.3-.2-1.9H12v3.6h5.5a4.7 4.7 0 0 1-2 3.1v2.6h3.3c1.9-1.8 3-4.4 3-7.4z" fill="currentColor" stroke="none"/><path d="M12 22c2.7 0 5-.9 6.7-2.4l-3.3-2.6c-.9.6-2 1-3.4 1-2.6 0-4.8-1.8-5.600-4.100H3v2.600A10 10 0 0 0 12 22z" fill="currentColor" stroke="none" opacity=".75"/><path d="M6.400 13.900a6 6 0 0 1 0-3.800V7.500H3a10 10 0 0 0 0 9z" fill="currentColor" stroke="none" opacity=".55"/><path d="M12 6c1.500 0 2.800.5 3.800 1.500l2.900-2.900A10 10 0 0 0 3 7.500l3.400 2.600C7.200 7.800 9.400 6 12 6z" fill="currentColor" stroke="none" opacity=".9"/>',
};
export function icon(name, size = 16, cls = '') {
  const s = document.createElement('span');
  s.className = `ico ${cls}`.trim(); s.style.cssText = `display:inline-grid;width:${size}px;height:${size}px;flex:none`;
  s.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[name] || P.info}</svg>`;
  return s;
}

// ───────────────────────── Formatters
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONL = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const dparts = (s) => String(s).slice(0, 10).split('-').map(Number);
export const fmt = {
  date: (s, withYear) => { if (!s) return '—'; const [y, m, d] = dparts(s); return `${MON[m - 1]} ${d}${withYear || y !== +state.today.slice(0, 4) ? `, ${y}` : ''}`; },
  dateLong: (s) => { if (!s) return '—'; const [y, m, d] = dparts(s); return `${MONL[m - 1]} ${d}, ${y}`; },
  dow: (s) => ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][new Date(`${s}T00:00:00Z`).getUTCDay()],
  monthLabel: (k) => { if (!k) return 'Unscheduled'; const [y, m] = k.split('-').map(Number); return `${MONL[m - 1]} ${y}`; },
  monthShort: (k) => { if (!k) return '—'; const [y, m] = k.split('-').map(Number); return `${MON[m - 1]} ${String(y).slice(2)}`; },
  time: (iso) => new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true }),
  timeLong: (iso) => new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true }),
  hm: (iso) => new Date(iso).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true }),
  rel: (iso) => {
    if (!iso) return '—'; const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
    if (s < 45) return 'just now'; if (s < 3600) return `${Math.round(s / 60)}m ago`; if (s < 86400) return `${Math.round(s / 3600)}h ago`;
    if (s < 86400 * 7) return `${Math.round(s / 86400)}d ago`; return fmt.date(iso.slice(0, 10));
  },
  dur: (sec) => { if (!sec) return '—'; if (sec < 60) return `${sec}s`; const m = Math.floor(sec / 60), s = sec % 60; return s ? `${m}m ${s}s` : `${m}m`; },
  due: (p) => { // → {text, tone}
    if (p.status === 'Completed') return { text: p.deadline ? fmt.date(p.deadline) : '—', tone: 'done' };
    if (p.days_to_deadline == null) return { text: 'No deadline', tone: 'warn' };
    const d = p.days_to_deadline;
    if (d < 0 && p.status !== 'On Hold') return { text: `${-d}d overdue`, tone: 'bad' };
    if (d === 0) return { text: 'Due today', tone: 'warn' }; if (d === 1) return { text: 'Tomorrow', tone: 'warn' };
    if (d <= 3) return { text: `in ${d} days`, tone: 'soon' };
    return { text: fmt.date(p.deadline), tone: 'ok' };
  },
  pct: (n) => `${Math.round(n)}%`,
  hours: (min) => (min >= 120 ? `${Math.round(min / 60)}h` : `${min}m`),
  plural: (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`,
};

// ───────────────────────── Small components
export const STATUS_COLORS = { 'New Brief Received': 'var(--s-new)', 'Pending Assignment': 'var(--s-pending)', Assigned: 'var(--s-assigned)', 'In Progress': 'var(--s-progress)', Review: 'var(--s-review)', 'Changes Required': 'var(--s-changes)', Completed: 'var(--s-done)', 'On Hold': 'var(--s-hold)' };
export const PRIO_COLORS = { Low: 'var(--gray)', Medium: 'var(--blue)', High: 'var(--amber)', Urgent: 'var(--coral)' };
export const MODE_COLORS = { auto: 'var(--teal)', sheet: 'var(--blue)', manual: 'var(--violet)', self: 'var(--accent)', locked: 'var(--gray)' };
export const statusPill = (status, { onClick } = {}) => h('span', { class: `pill ${onClick ? 'btnlike' : ''}`, style: { '--c': STATUS_COLORS[status] || 'var(--gray)' }, onClick }, status, onClick ? icon('down', 11) : null);
export function priorityTag(p) {
  const n = { Low: 1, Medium: 2, High: 3, Urgent: 4 }[p] || 2;
  return h('span', { class: 'prio', style: { '--c': PRIO_COLORS[p] } }, h('i', [1, 2, 3, 4].map((i) => h('b', { class: i <= n ? 'on' : '', style: { height: `${3 + i * 2}px` } }))), p);
}
export const initials = (n) => String(n || '?').replace(/\(.*?\)/g, '').trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase()).join('');
export function avatar(who, size = 24, opts = {}) {
  const name = typeof who === 'string' ? who : who?.name; const color = typeof who === 'string' ? opts.color : who?.color || who?.assignee_color;
  return h('span', { class: `avatar ${opts.off ? 'off' : ''}`, style: { '--s': `${size}px`, '--c': color || 'var(--gray)' }, title: name || '' }, name ? initials(name) : '?');
}
export const memberById = (id) => state.team.find((m) => m.id === id);
export function assigneeChip(p) {
  if (!p.assignee_id) return h('span', { class: 'row gap-8 dim' }, h('span', { class: 'avatar', style: { '--s': '24px', '--c': 'var(--surface-4)', color: 'var(--text-3)' } }, icon('user', 12)), p.assign_mode === 'locked' ? 'Do not auto-assign' : 'Unassigned');
  return h('span', { class: 'who-chip' }, avatar({ name: p.assignee_name, color: p.assignee_color }, 24), h('span', { class: 'trunc' }, p.assignee_name));
}
export const modeTag = (mode, label) => h('span', { class: 'tag c', style: { '--c': MODE_COLORS[mode] || 'var(--gray)' } }, label);
export const skeleton = (h_ = 16, w = '100%', r = 8) => h('div', { class: 'skeleton', style: { height: `${h_}px`, width: w, borderRadius: `${r}px` } });
export const empty = (ico, title, sub, action) => h('div', { class: 'empty' }, h('div', { class: 'ico' }, icon(ico, 20)), h('h4', title), sub && h('div', sub), action && h('div', { class: 'mt-12' }, action));
export const field = (label, control, hint) => h('div', { class: 'field' }, label && h('label', label), control, hint && h('div', { class: 'hint' }, hint));
export function toggle({ checked = false, onChange, label } = {}) {
  const input = h('input', { type: 'checkbox', checked, 'aria-label': label || 'toggle', onChange: (e) => onChange && onChange(e.target.checked, e) });
  return h('label', { class: 'toggle' }, input, h('i'));
}
export function segmented(options, value, onChange) {
  const wrap = h('div', { class: 'seg' });
  const draw = (v) => { clear(wrap); options.forEach((o) => { const [val, lab] = Array.isArray(o) ? o : [o, o]; wrap.append(h('button', { class: val === v ? 'on' : '', onClick: () => { draw(val); onChange(val); } }, lab)); }); };
  draw(value); return wrap;
}
export function select(options, value, onChange, cls = '') {
  const el = h('select', { class: `select ${cls}`, onChange: (e) => onChange(e.target.value) }, options.map((o) => { const [v, l] = Array.isArray(o) ? o : [o, o]; return h('option', { value: v, selected: String(v) === String(value) }, l); }));
  return el;
}
export const linkEl = (href, children, cls = '') => h('a', { href, class: cls }, children);
export function sheetLinkBtn(p, cls = 'btn sm') { return h('a', { class: cls, href: p.sheet_link, target: p.sheet_link.startsWith('http') && !p.sheet_link.includes('localhost') ? '_blank' : undefined, rel: 'noopener' }, icon('sheet', 14), 'Open in Sheet', icon('ext', 12)); }

// ───────────────────────── Tooltips: any element with data-tip="…" gets one
// tooltips may contain a few formatting tags; everything else (e.g. text that came from a sheet) is escaped
const safeTip = (s) => esc(s).replace(/&lt;(\/?)(b|span)(?: class=&quot;m&quot;)?&gt;/g, (m, c, t) => `<${c}${t}${!c && t === 'span' && m.includes('class') ? ' class="m"' : ''}>`).replace(/&lt;br&gt;/g, '<br>');
let tipEl;
document.addEventListener('mouseover', (e) => {
  const t = e.target.closest?.('[data-tip]'); if (!t) return;
  tipEl?.remove(); tipEl = h('div', { class: 'tip', html: safeTip(t.dataset.tip) }); document.body.append(tipEl);
  const r = t.getBoundingClientRect(), tr = tipEl.getBoundingClientRect();
  tipEl.style.left = `${Math.max(8, Math.min(innerWidth - tr.width - 8, r.left + r.width / 2 - tr.width / 2))}px`;
  tipEl.style.top = `${r.top - tr.height - 8 < 8 ? r.bottom + 8 : r.top - tr.height - 8}px`;
});
document.addEventListener('mouseout', (e) => { if (e.target.closest?.('[data-tip]')) { tipEl?.remove(); tipEl = null; } });
document.addEventListener('scroll', () => { tipEl?.remove(); tipEl = null; }, true);

// ───────────────────────── Overlays
let toastHost;
export function toast(msg, { type = 'info', sub, ms = 3800 } = {}) {
  toastHost ||= document.body.appendChild(h('div', { class: 'toasts' }));
  const el = h('div', { class: `toast ${type}` }, icon(type === 'ok' ? 'check' : type === 'err' ? 'alert' : 'sparkles', 16), h('div', h('div', msg), sub && h('div', { class: 'sub' }, sub)));
  toastHost.append(el);
  setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 220); }, ms);
}
export function modal({ title, body, actions, width = 560, onClose } = {}) {
  const close = () => { ov.remove(); document.removeEventListener('keydown', onKey); onClose && onClose(); };
  const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); close(); } };
  const ov = h('div', { class: 'overlay', onMousedown: (e) => { if (e.target === ov) close(); } },
    h('div', { class: 'modal', style: { '--w': `${width}px` }, role: 'dialog', 'aria-modal': 'true' },
      h('div', { class: 'modal-h' }, h('h2', title), h('button', { class: 'btn ghost sm x icon-btn', onClick: close, 'aria-label': 'Close' }, icon('x', 16))),
      h('div', { class: 'modal-b' }, body),
      actions && h('div', { class: 'modal-f' }, typeof actions === 'function' ? actions(close) : actions)));
  document.body.append(ov); document.addEventListener('keydown', onKey);
  setTimeout(() => ov.querySelector('input:not([type=checkbox]),textarea,select')?.focus(), 30);
  return { close, el: ov };
}
export function confirmDialog({ title, message, confirmLabel = 'Confirm', danger = false }) {
  return new Promise((res) => {
    let done = false; const fin = (v) => { if (!done) { done = true; res(v); } };
    modal({ title, width: 440, body: h('div', { class: 'muted' }, message), onClose: () => fin(false), actions: (close) => [h('button', { class: 'btn', onClick: () => { fin(false); close(); } }, 'Cancel'), h('button', { class: `btn ${danger ? 'danger' : 'primary'}`, onClick: () => { fin(true); close(); } }, confirmLabel)] });
  });
}
export function drawer({ content, width = 560, onClose }) {
  const close = () => { wrap.remove(); document.removeEventListener('keydown', onKey); onClose && onClose(); };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  const wrap = h('div', { class: 'drawer-wrap', onMousedown: (e) => { if (e.target === wrap) close(); } }, h('aside', { class: 'drawer', style: { '--w': `${width}px` } }, content(close)));
  document.body.append(wrap); document.addEventListener('keydown', onKey); return { close };
}

/** Popover menu anchored to an element. items: [{label, sub, icon, avatar, dot, checked, disabled, section, divider, onClick|value}] */
export function menu(anchor, items, { search = false, placeholder = 'Search…', width } = {}) {
  document.querySelectorAll('.menu').forEach((m) => m._close?.());
  let hl = -1, list;
  const box = h('div', { class: 'menu', style: width ? { width: `${width}px` } : {} });
  const close = () => { box.remove(); document.removeEventListener('mousedown', onDown, true); document.removeEventListener('keydown', onKey, true); window.removeEventListener('resize', close); };
  box._close = close;
  const onDown = (e) => { if (!box.contains(e.target) && !anchor.contains(e.target)) close(); };
  const visible = () => [...box.querySelectorAll('.m-item:not(.off)')];
  const onKey = (e) => {
    if (e.key === 'Escape') { e.stopPropagation(); close(); return; }
    const v = visible(); if (!v.length) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); hl = (hl + (e.key === 'ArrowDown' ? 1 : -1) + v.length) % v.length; v.forEach((n, i) => n.classList.toggle('hl', i === hl)); v[hl].scrollIntoView({ block: 'nearest' }); }
    if (e.key === 'Enter' && hl >= 0) { e.preventDefault(); v[hl].click(); }
  };
  const draw = (q = '') => {
    list && list.remove(); list = h('div');
    for (const it of items) {
      if (it.divider) { list.append(h('div', { class: 'm-div' })); continue; }
      if (it.section) { list.append(h('div', { class: 'm-sec' }, it.section)); continue; }
      if (q && !String(it.label).toLowerCase().includes(q.toLowerCase())) continue;
      list.append(h('button', { class: `m-item ${it.disabled ? 'off' : ''}`, onClick: () => { if (it.disabled) return; close(); it.onClick && it.onClick(it); } },
        it.avatar, it.dot && h('i', { style: { width: '8px', height: '8px', borderRadius: '50%', background: it.dot, flex: 'none' } }), it.icon && icon(it.icon, 15),
        h('span', { class: 'trunc' }, it.label), it.sub && h('span', { class: 'sub' }, it.sub), it.checked && h('span', { class: 'chk' }, icon('check', 14))));
    }
    hl = -1; box.append(list);
  };
  if (search) { box.append(h('div', { class: 'm-search' }, h('input', { class: 'input sm', placeholder, onInput: (e) => draw(e.target.value) }))); }
  draw(); document.body.append(box);
  const r = anchor.getBoundingClientRect(), mr = box.getBoundingClientRect();
  let left = Math.min(r.left, innerWidth - mr.width - 10), top = r.bottom + 6;
  if (top + mr.height > innerHeight - 10) top = Math.max(10, r.top - mr.height - 6);
  box.style.left = `${Math.max(10, left)}px`; box.style.top = `${top}px`;
  setTimeout(() => { document.addEventListener('mousedown', onDown, true); document.addEventListener('keydown', onKey, true); window.addEventListener('resize', close); box.querySelector('input')?.focus(); }, 0);
  return { close };
}

export function pickStatus(anchor, current, onPick) {
  menu(anchor, state.statuses.map((s) => ({ label: s, dot: STATUS_COLORS[s], checked: s === current, onClick: () => s !== current && onPick(s) })));
}
/** Quick-assign popover. Calls the API and then onDone(updatedProject). */
export function pickAssignee(anchor, p, onDone) {
  const members = state.team.filter((m) => !m.is_owner);
  const me = state.team.find((m) => m.is_owner);
  const items = [{ section: 'Teammates' }, ...members.map((m) => {
    const out = !m.enabled || m.availability === 'unavailable' || (m.leave_until && m.leave_until >= state.today);
    return { label: m.name, avatar: avatar(m, 22, { off: out }), checked: p.assignee_id === m.id, sub: out ? (m.leave_until && m.leave_until >= state.today ? 'on leave' : 'unavailable') : (m.active != null ? `${m.active} active` : ''), onClick: () => assign(p, { assignee_id: m.id }, onDone) };
  }), { divider: true }, { section: 'Control' },
  me && { label: 'Assign to me', icon: 'user', checked: p.assignee_id === me.id, onClick: () => assign(p, { assignee_id: me.id }, onDone) },
  { label: 'Release to auto-assign', icon: 'shuffle', onClick: () => assign(p, { assignee_id: null, mode: 'auto' }, onDone) },
  { label: 'Do not auto-assign', icon: 'lock', checked: p.assign_mode === 'locked' && !p.assignee_id, onClick: () => assign(p, { assignee_id: null, mode: 'locked' }, onDone) }].filter(Boolean);
  menu(anchor, items, { search: true, placeholder: 'Assign to…', width: 270 });
}
export async function assign(p, body, onDone) {
  const r = await act(() => api.post(`/api/projects/${p.id}/assign`, body));
  if (!r) return;
  const np = r.project;
  const msg = r.result === 'noop' ? 'No change' : np.assignee_name ? `Assigned to ${np.assignee_name}` : np.assign_mode === 'locked' ? 'Excluded from auto-assignment' : 'Unassigned';
  toast(msg, { type: 'ok', sub: r.result !== 'noop' && body.assignee_id && !np.is_owner_assigned ? 'Teammate emailed · history recorded' : undefined });
  refreshBootstrap(); onDone && onDone(np, r);
}

// ───────────────────────── Navigation + page-scoped live events
export const go = (hash) => { if (location.hash === hash) window.dispatchEvent(new HashChangeEvent('hashchange')); else location.hash = hash; };
let pageSubs = [];
export function liveOn(type, fn) { pageSubs.push([type, fn]); }
export function _resetPageSubs() { pageSubs = []; }
export function _emitLive(e) { pageSubs.forEach(([t, fn]) => { if (t === e.type || t === '*') fn(e); }); }
let bootstrapHook = () => {};
export const _setBootstrapHook = (f) => { bootstrapHook = f; };
export const refreshBootstrap = () => bootstrapHook();

// sync trigger shared by dashboard + sidebar
export async function syncNow(trigger = 'manual') {
  if (state.syncing) return;
  state.syncing = true; state.localSync = true; window.dispatchEvent(new Event('syncstate'));
  try { const r = await api.post('/api/sync/run', { trigger }); return r; }
  catch (e) { toast(e.message, { type: 'err' }); } finally { state.syncing = false; state.localSyncDoneAt = Date.now(); state.localSync = false; window.dispatchEvent(new Event('syncstate')); }
}
