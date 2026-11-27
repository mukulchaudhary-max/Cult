import { h, api, act, icon, fmt, state, toast, go, syncNow, confirmDialog, segmented, clear, liveOn, refreshBootstrap, statusPill, debounce } from '../core.js';

const FIELD_NAMES = { revised: 'Revised date', assets: 'Asset requirement (S/V/C/G)', 'brief:angle': 'Brief · Angle', 'brief:concept': 'Brief · Concept', 'brief:messaging': 'Brief · Messaging', 'brief:imagery': 'Brief · Imagery', id: 'Project ID', month: 'Month', name: 'Project name', brand: 'Brand / campaign', type: 'Project type', brief: 'Brief', duration: 'Duration', deadline: 'Delivery date', priority: 'Priority', status: 'Status', assignee: 'Assigned to', links: 'Reference links', product: 'Product info' };
const colLetter = (i) => String.fromCharCode(65 + i);

function toastSync(r) {
  if (!r) return;
  if (r.status === 'failed') return toast('Sync failed', { type: 'err', sub: r.error });
  const bits = [];
  if (r.created) bits.push(`${r.created} new brief${r.created > 1 ? 's' : ''} imported`);
  if (r.changes) bits.push(`${r.changes} change${r.changes > 1 ? 's' : ''} detected`);
  if (r.assigned) bits.push(`${r.assigned} auto-assigned`);
  if (r.flagged) bits.push(`${r.flagged} flagged`);
  if (r.emails) bits.push(`${r.emails} email${r.emails > 1 ? 's' : ''} sent`);
  toast(bits.length ? 'Automation ran' : 'Sheet is up to date', { type: 'ok', sub: bits.join(' · ') || 'No new briefs or changes' });
}

export default async function render(ctx) {
  const { root } = ctx;
  const info = await api.get('/api/integrations');
  const demo = info.sheet.mode === 'demo';
  const view = h('div');
  root.append(h('div', { class: 'page-h' }, h('div', h('h1', 'Integrations'), h('div', { class: 'sub' }, 'Connect Google Sheets for brief monitoring and Gmail for notifications. Until you connect your own account the platform runs on a built-in demo sheet so everything can be tried safely.'))), view);

  // ───────────────────────── Demo director (scripted presentation scenarios)
  let sim = null, simTab = ctx.query.tab || null;
  const dirResult = h('div', { class: 'dir-result hide' });
  const runScenario = async (btn, fn) => {
    btn.disabled = true;
    try { await fn(); } catch (e) { toast(e.message, { type: 'err' }); } finally { btn.disabled = false; }
  };
  const syncAnd = async () => { const r = await syncNow('simulator'); toastSync(r); await refreshBootstrap(); await loadSim(); showResult(r); return r; };
  const showResult = (r) => {
    if (!r || r.status === 'failed') return;
    dirResult.classList.remove('hide');
    dirResult.replaceChildren(icon('zap', 15), h('div', h('b', 'Automation result'), h('div', { class: 'muted' }, [`${r.created} created`, `${r.updated} updated`, `${r.changes} field changes`, `${r.assigned} assigned`, `${r.flagged} flagged`, `${r.skipped || 0} ignored (no video/GIF)`, `${r.emails} emails`].join(' · '))),
      h('div', { class: 'row gap-6 end' }, r.created ? h('a', { class: 'btn sm', href: '#/assignments' }, 'See assignments') : null, r.changes ? h('a', { class: 'btn sm', href: '#/changes' }, 'See change log') : null, h('a', { class: 'btn sm', href: '#/notifications' }, 'Notifications'), h('a', { class: 'btn sm primary', href: '#/dashboard' }, 'Dashboard')));
  };
  const FH = () => sim.fieldHeaders; // field -> this sheet's column header
  const rowByName = (name) => { for (const t of sim.tabs) { const r = t.rows.find((x) => String(x.values[FH().name]).trim() === name); if (r) return [t, r]; } return []; };
  const setCell = (name, field, value) => { const [t, r] = rowByName(name); if (!r) throw new Error(`“${name}” is not in the sheet — use Reset demo`); return api.patch('/api/demo/sheet/cell', { tab: t.name, row: r.rowNumber, header: FH()[field], value }); };
  const scenarios = [
    ['1', 'inbox', 'New asks are added to the sheet', 'Adds the next 15 real asks (treadmills, walkpads, massage chairs…) to the sheet. They are detected, imported, shared out by video/GIF workload, and every editor is emailed.', async () => { const a = await api.post('/api/demo/sheet/add-month'); toast(`${a.added} rows added to “${a.tab}”`, { type: 'info' }); await syncAnd(); }],
    ['2', 'edit', 'A revised date changes', 'Sets a new “Revised Dates” on Canoas black Treadmill. The effective deadline moves, the change is detected, logged and emailed to you.', async () => { await setCell('Canoas black Treadmill', 'revised', '10th Dec'); await syncAnd(); }],
    ['3', 'flag', 'Mixed asks arrive: static-only + incomplete video', 'A statics/carousel-only ask (ignored — not video/GIF) and a video ask with no date or brief (flagged for you, still auto-assigned).', async () => {
      const tab = sim.tabs.at(-1).name; const n = sim.tabs.reduce((a, t) => a + t.rows.length, 0);
      await api.post('/api/demo/sheet/row', { tab, data: { [FH().name]: 'Cult Store Banner Refresh', [FH().brand]: 'Apparel', [FH().assets]: '4S, 2C', [FH().deadline]: '20/12/26', [FH().type]: 'Batch Produce' } });
      await api.post('/api/demo/sheet/row', { tab, data: { [FH().name]: `Pre-Launch Teaser #${n}`, [FH().brand]: 'Accesories', [FH().assets]: '1V', [FH().type]: 'Creative Concepts' } }); await syncAnd(); }],
    ['4', 'users', 'A project is renamed in the sheet', 'Renames “Barefoot” in place — the same project updates, no duplicate is created.', async () => { await setCell('Barefoot', 'name', 'Barefoot Runner (Launch)'); await syncAnd(); }],
  ];
  const director = h('section', { class: 'card director' },
    h('div', { class: 'a-head' }, h('div', { class: 'a-ico accent' }, icon('play', 18)), h('div', { class: 'grow' }, h('h3', 'Demo director'), h('div', { class: 'dim', style: 'font-size:12.5px' }, 'Each button edits the simulated copy of your Google Sheet exactly like a teammate would — then the monitor picks it up and the whole workflow runs.')),
      h('button', { class: 'btn sm danger', onClick: async () => { if (await confirmDialog({ title: 'Reset demo data?', message: 'Rebuilds the demo workspace from scratch (projects, history, notifications). Your settings stay.', confirmLabel: 'Reset demo', danger: true })) { await act(() => api.post('/api/demo/reset'), 'Demo workspace reset'); await refreshBootstrap(); dirResult.classList.add('hide'); await loadSim(); } } }, icon('refresh', 13), 'Reset demo')),
    h('div', { class: 'dir-grid' }, scenarios.map(([n, ico, t, d, fn]) => { const b = h('button', { class: 'scn' }, h('span', { class: 'scn-n mono' }, n), h('div', h('div', { class: 'scn-t' }, t), h('div', { class: 'scn-d' }, d)), icon('arrow', 15)); b.addEventListener('click', () => runScenario(b, fn)); return b; })),
    dirResult);

  // ───────────────────────── connection cards
  const profile = info.profile;
  const googleCard = h('div', { class: 'card conn' },
    h('div', { class: 'conn-h' }, h('div', { class: 'conn-ico' }, icon('google', 20)), h('div', { class: 'grow' }, h('h3', 'Google account'), h('div', { class: 'dim' }, 'OAuth 2.0 · least-privilege scopes')), info.connected ? h('span', { class: 'pill', style: { '--c': 'var(--green)' } }, 'Connected') : info.googleConfigured ? h('span', { class: 'pill', style: { '--c': 'var(--amber)' } }, 'Not connected') : h('span', { class: 'pill', style: { '--c': 'var(--accent)' } }, 'Demo mode')),
    info.connected ? h('div', { class: 'col gap-8' }, h('div', { class: 'row gap-8' }, h('b', profile?.name || ''), h('span', { class: 'mono dim' }, profile?.email || '')), h('div', h('button', { class: 'btn sm danger', onClick: async () => { if (await confirmDialog({ title: 'Disconnect Google?', message: 'Monitoring and email delivery will switch back to demo mode.', confirmLabel: 'Disconnect', danger: true })) { await act(() => api.post('/api/integrations/disconnect'), 'Disconnected'); await refreshBootstrap(); go('#/integrations'); ctx.reload(); } } }, icon('logout', 13), 'Disconnect')))
      : info.googleConfigured ? h('div', h('p', { class: 'muted', style: 'margin:0 0 12px' }, 'Grant read-only access to your Sheet and send-only access to Gmail.'), h('a', { class: 'btn primary', href: '/auth/google' }, icon('google', 15), 'Sign in with Google'))
      : h('div', h('p', { class: 'muted', style: 'margin:0 0 12px' }, 'No Google credentials are configured on this server, so the app is running on the built-in demo sheet and simulated email. Add OAuth credentials to go live.'), h('a', { class: 'btn sm', href: '#guide', onClick: (e) => { e.preventDefault(); document.getElementById('guide').open = true; document.getElementById('guide').scrollIntoView({ behavior: 'smooth' }); } }, icon('info', 14), 'How to go live')));

  const sheetInput = h('input', { class: 'input', placeholder: 'https://docs.google.com/spreadsheets/d/…', value: info.sheet.url || '', disabled: !info.connected });
  const sheetCard = h('div', { class: 'card conn' },
    h('div', { class: 'conn-h' }, h('div', { class: 'conn-ico' }, icon('sheet', 20)), h('div', { class: 'grow' }, h('h3', 'Google Sheet'), h('div', { class: 'dim' }, 'Monthly requirements & briefs')), h('span', { class: 'pill', style: { '--c': demo ? 'var(--accent)' : 'var(--green)' } }, demo ? 'Demo sheet' : 'Live')),
    demo ? h('div', { class: 'col gap-8' }, h('div', h('b', 'Demo'), h('span', { class: 'dim' }, " — simulated copy of “December'26 Asks 1P & Perf”")), h('div', { class: 'dim' }, 'Edit it below in the Sheet Simulator to see detection live.'))
      : h('div', { class: 'col gap-8' }, h('div', h('b', info.sheet.title)), h('a', { class: 'btn sm', href: info.sheet.url, target: '_blank', rel: 'noopener' }, icon('ext', 13), 'Open sheet')),
    h('div', { class: 'row gap-8 mt-12' }, sheetInput, h('button', { class: 'btn', disabled: !info.connected, onClick: async (e) => { e.currentTarget.disabled = true; const r = await act(() => api.post('/api/integrations/sheet', { mode: 'google', url: sheetInput.value }), 'Sheet connected'); await refreshBootstrap(); if (r) ctx.reload(); else e.currentTarget.disabled = false; } }, 'Connect')),
    !info.connected && h('div', { class: 'dim mt-8', style: 'font-size:12px' }, 'Sign in with Google first to connect a sheet.'),
    !demo && h('div', { class: 'mt-8' }, h('button', { class: 'btn sm ghost', onClick: async () => { await act(() => api.post('/api/integrations/sheet', { mode: 'demo' }), 'Switched to demo sheet'); await refreshBootstrap(); ctx.reload(); } }, 'Use demo sheet instead')));

  const gmailCard = h('div', { class: 'card conn' },
    h('div', { class: 'conn-h' }, h('div', { class: 'conn-ico' }, icon('mail', 20)), h('div', { class: 'grow' }, h('h3', 'Gmail'), h('div', { class: 'dim' }, 'Assignment & alert emails')), h('span', { class: 'pill', style: { '--c': info.email.mode === 'gmail' ? 'var(--green)' : 'var(--accent)' } }, info.email.mode === 'gmail' ? 'Sending live' : 'Simulated')),
    h('div', { class: 'col gap-12' },
      h('div', { class: 'row gap-12' }, segmented([['demo', 'Simulate'], ['gmail', 'Send via Gmail']], info.email.mode, async (v) => { const r = await act(() => api.post('/api/integrations/email', { mode: v }), v === 'gmail' ? 'Emails will now be delivered through Gmail' : 'Email simulation on'); if (!r) { ctx.reload(); return; } await refreshBootstrap(); }), info.email.from && h('span', { class: 'mono dim', style: 'font-size:12px' }, `from ${info.email.from}`)),
      h('div', { class: 'dim' }, info.email.mode === 'gmail' ? 'Real emails are sent from your connected Gmail account.' : 'Simulated mode records every email in the Email Outbox without sending — perfect for demos and testing templates.'),
      h('div', { class: 'row gap-8' }, h('button', { class: 'btn sm', onClick: async () => { const r = await act(() => api.post('/api/integrations/email/test')); if (r) toast(r.ok ? (r.simulated ? 'Test email recorded in outbox' : 'Test email sent') : 'Send failed', { type: r.ok ? 'ok' : 'err', sub: r.error }); } }, icon('send', 13), 'Send test email'), h('a', { class: 'btn sm ghost', href: '#/notifications?tab=emails' }, 'Open outbox'))));

  // ───────────────────────── column mapping preview
  const mapBox = h('div', { class: 'card' }, h('div', { class: 'card-h' }, h('h3', 'Column mapping'), h('span', { class: 'sub' }, 'How the sheet’s columns are understood — header names can be worded any way and in any order')), h('div', { class: 'card-b', id: 'map-body' }, h('div', { class: 'skeleton', style: 'height:60px' })));
  async function loadMap() {
    const box = mapBox.querySelector('#map-body');
    try {
      const p = await api.post('/api/integrations/sheet/preview');
      box.replaceChildren(...[
        h('div', { class: 'row wrap gap-16 mb-16' }, ...[['Asks imported', p.records], [`Videos & GIFs to make`, p.deliverables], [`Ignored (no ${(p.assetCodes || []).join('/')})`, (p.skipped?.filtered || 0) + (p.skipped?.noAsset || 0)], ['Flagged (missing info)', p.flagged]].map(([l, v]) => h('div', h('div', { class: 'eyebrow' }, l), h('div', { style: 'font-size:20px;font-weight:650;margin-top:6px' }, v)))),
        ...p.columns.slice(0, 1).map((c) => h('div', { class: 'map-grid' }, Object.entries(c.mapping).map(([hd, f]) => h('div', { class: `map-chip ${f ? 'ok' : ''}` }, h('span', { class: 'mono' }, hd), icon('arrow', 11), f ? h('b', FIELD_NAMES[f]) : h('span', { class: 'dim' }, 'tracked as extra column'))))),
        p.issues.length ? h('div', { class: 'callout warn mt-12' }, icon('alert', 15), h('div', p.issues.slice(0, 3).map((i) => h('div', i.message)))) : null,
        h('div', { class: 'dim mt-12', style: 'font-size:12px' }, `Asset filter: only rows with ${(p.assetCodes || []).join(' or ')} in the asset column are imported (change in Automation Settings). Owner column = existing assignment (several names: the first is primary, the rest are co-owners). Deadline = Revised date when set, else Live date. `, 'Project identity: a “Project ID” column is used when present; otherwise projects are matched on month + name, with rename detection by tab and row so edits never create duplicates.')].filter(Boolean));
    } catch (e) { box.replaceChildren(h('div', { class: 'callout err' }, icon('alert', 15), e.message)); }
  }

  // ───────────────────────── sheet simulator
  const simBox = h('section', { class: 'card sim', id: 'sim' });
  let pendingSync;
  const autoSync = debounce(async () => { const r = await syncNow('simulator'); toastSync(r); await refreshBootstrap(); await loadSim(); }, 1400);
  async function loadSim() {
    if (!demo) return;
    sim = await api.get('/api/demo/sheet');
    simTab = sim.tabs.find((t) => t.name === simTab)?.name || sim.tabs.at(-1)?.name; drawSim();
  }
  function drawSim() {
    if (!sim) return;
    const tab = sim.tabs.find((t) => t.name === simTab);
    const headers = sim.headers;
    const table = h('table', { class: 'sheet' }, h('thead', h('tr', h('th', { class: 'corner' }), headers.map((_, i) => h('th', { class: 'col-l' }, colLetter(i))))),
      h('tbody', h('tr', { class: 'hdr' }, h('td', { class: 'rn' }, '1'), headers.map((hd) => h('td', hd))),
        (tab?.rows || []).map((r) => {
          const tr = h('tr', { dataset: { row: r.rowNumber }, class: ctx.query.row && simTab === ctx.query.tab && +ctx.query.row === r.rowNumber ? 'flash' : '' },
            h('td', { class: 'rn' }, r.rowNumber, h('button', { class: 'rm', 'aria-label': 'Delete row', onClick: async () => { if (await confirmDialog({ title: 'Delete this row?', message: `Row ${r.rowNumber} will be removed from the sheet. The project stays in the dashboard, flagged as “removed from sheet”.`, confirmLabel: 'Delete row', danger: true })) { await api.del(`/api/demo/sheet/row?tab=${encodeURIComponent(tab.name)}&row=${r.rowNumber}`); await loadSim(); autoSync(); } } }, icon('x', 11))),
            headers.map((hd) => { const val = r.values[hd] ?? ''; const td = h('td', { contentEditable: 'true', spellcheck: false, dataset: { h: hd, k: hd.replace(/\W+/g, '') }, class: hd === sim.fieldHeaders.name ? 'w-name' : /brief:/.test(Object.entries(sim.fieldHeaders).find(([, v]) => v === hd)?.[0] || '') || hd === sim.fieldHeaders.brief ? 'w-brief' : hd === sim.fieldHeaders.links ? 'w-links' : '' }, val);
              td.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); td.blur(); } if (e.key === 'Escape') { td.textContent = val; td.blur(); } });
              td.addEventListener('blur', async () => { const nv = td.textContent.trim(); if (nv === String(val).trim()) return; r.values[hd] = nv; const res = await act(() => api.patch('/api/demo/sheet/cell', { tab: tab.name, row: r.rowNumber, header: hd, value: nv })); if (res) { td.classList.add('edited'); toast('Cell saved to sheet', { type: 'info', sub: res.autosync ? 'Monitor will detect it in a moment…' : 'Click “Sync now” to detect' }); if (res.autosync) autoSync(); } });
              return td; }));
          return tr; })));
    simBox.replaceChildren(
      h('div', { class: 'a-head' }, h('div', { class: 'a-ico' }, icon('sheet', 18)), h('div', { class: 'grow' }, h('h3', 'Sheet simulator'), h('div', { class: 'dim', style: 'font-size:12.5px' }, 'A stand-in for your Google Sheet. Click any cell to edit — press Enter to save. Edits are picked up by the monitor exactly like real sheet edits.')),
        h('div', { class: 'row gap-8' }, h('button', { class: 'btn sm', onClick: async () => { const t = simTab; const n = tab?.rows.length || 0; await api.post('/api/demo/sheet/row', { tab: t, data: { [sim.fieldHeaders.name]: `New ask ${n + 1}`, [sim.fieldHeaders.assets]: '1V' } }); await loadSim(); toast('Row added', { type: 'info', sub: 'Fill in the details, then sync' }); } }, icon('plus', 13), 'Add row'),
          h('button', { class: 'btn sm primary', onClick: async (e) => { const b = e.currentTarget; b.disabled = true; toastSync(await syncNow('manual')); await refreshBootstrap(); await loadSim(); b.disabled = false; } }, icon('refresh', 13), 'Sync now'))),
      h('div', { class: 'sheet-wrap' }, table),
      h('div', { class: 'sheet-tabs' }, sim.tabs.map((t) => h('button', { class: t.name === simTab ? 'on' : '', onClick: () => { simTab = t.name; drawSim(); } }, t.name, h('span', { class: 'dim' }, ` ${t.rows.length}`))), h('span', { class: 'end dim', style: 'font-size:11.5px;padding:0 10px' }, 'Tip: a new tab named e.g. “Jan 2027” becomes a new month workspace')));
    if (ctx.query.row) { const tr = simBox.querySelector(`tr[data-row="${ctx.query.row}"]`); setTimeout(() => tr?.scrollIntoView({ block: 'center', behavior: 'smooth' }), 80); }
  }

  const guide = h('details', { class: 'card guide', id: 'guide' }, h('summary', icon('zap', 16), h('b', 'Going live with real Google Sheets & Gmail'), icon('down', 14)),
    h('div', { class: 'guide-b' }, h('ol', { class: 'col gap-8', style: 'margin:0;padding-left:20px' },
      h('li', 'In ', h('b', 'Google Cloud Console'), ' create a project, enable the ', h('b', 'Google Sheets API'), ' and ', h('b', 'Gmail API'), ', and create an ', h('b', 'OAuth client ID (Web application)'), '.'),
      h('li', 'Add this Authorized redirect URI: ', h('code', { class: 'mono' }, info.redirectUri)),
      h('li', 'Start the server with ', h('code', { class: 'mono' }, 'GOOGLE_CLIENT_ID'), ', ', h('code', { class: 'mono' }, 'GOOGLE_CLIENT_SECRET'), ', ', h('code', { class: 'mono' }, 'APP_URL'), ', ', h('code', { class: 'mono' }, 'SESSION_SECRET'), ' (and optionally ', h('code', { class: 'mono' }, 'ALLOWED_EMAILS'), ') set — see README.'),
      h('li', 'Sign in with Google here, paste your Sheet URL, and switch Gmail to “Send via Gmail”.'),
      h('li', 'In Settings, click “Clear demo data” so only your real projects remain.'))));

  view.append(...(demo ? [director] : []), h('div', { class: 'conn-grid' }, googleCard, sheetCard, gmailCard), h('div', { class: 'mt-16' }, mapBox), ...(demo ? [h('div', { class: 'mt-16' }, simBox)] : []), h('div', { class: 'mt-16' }, guide));
  liveOn('sync', () => { loadSim(); loadMap(); });
  await Promise.all([loadMap(), loadSim()]);
  if (ctx.route === 'sheet') setTimeout(() => simBox.scrollIntoView({ behavior: 'smooth', block: 'start' }), 120);
  void statusPill; void clear; void fmt; void pendingSync;
}
