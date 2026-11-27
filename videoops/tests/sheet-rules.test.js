// Rules specific to the real "December'26 Asks 1P & Perf" sheet: asset codes (S/V/C/G), Owner column,
// Live vs Revised dates, hyperlink cells, and the video/GIF-only filter.
import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { openDb, all, get, insert } from '../server/db.js';
import { resetSettingsCache, saveSettings } from '../server/settings.js';
import * as S from '../server/integrations/sheetSource.js';
import { runSync, resolveMembers } from '../server/engine/sync.js';
import { parseSnapshot, parseAssets, parseDate } from '../server/engine/mapper.js';
import { gridToTab } from '../server/integrations/google.js';
import * as P from '../server/services/projects.js';
import { nowIso } from '../server/clock.js';

const FIX = JSON.parse(fs.readFileSync(new URL('../server/fixtures/december-asks.json', import.meta.url), 'utf8'));
const TEAM = ['Shwetank', 'Enbarasan E', 'Gagan Solanki', 'Antony T J'];
const mem = (name, extra = {}) => insert('team_members', { name, email: `${name.split(' ')[0].toLowerCase()}@curefit.com`, role: 'Editor', enabled: 1, availability: 'available', prefs: '{}', is_owner: 0, created_at: nowIso(), ...extra });
const proj = (n) => P.hydrate(get('SELECT * FROM projects WHERE name=?', n));
const loadSheet = (filter) => { S.setDemoHeaders(FIX.headers); S.ensureDemoTab(FIX.tab, FIX.gid); FIX.rows.filter((r) => !filter || filter(r)).forEach((r) => S.demoPutRow(FIX.tab, r.rowNumber, r.values)); };
const H = (f) => FIX.headers.find((h) => h.trim().toLowerCase().startsWith(f));

beforeEach(() => {
  openDb(':memory:'); resetSettingsCache(); saveSettings({});
  insert('team_members', { name: 'Mukul Chaudhary', email: 'mukul.chaudhary@curefit.com', role: 'PM', enabled: 1, availability: 'available', prefs: '{}', is_owner: 1, created_at: nowIso() });
  TEAM.forEach((n) => mem(n));
});

test('asset codes parse with counts; bare letters count as 1; words do not match', () => {
  assert.deepEqual(parseAssets('1S, 2V, 1C, 1G'), { S: 1, V: 2, C: 1, G: 1 });
  assert.deepEqual(parseAssets('2S, 3G'), { S: 2, G: 3 });
  assert.equal(parseAssets('Product URLs'), null);
  assert.equal(parseAssets(''), null);
});

test('real sheet: only video/GIF asks are imported — legend rows and blanks are ignored', async () => {
  loadSheet();
  const r = await runSync();
  assert.equal(r.status, 'success');
  assert.equal(r.created, 49);                       // rows 2-50
  assert.equal(get('SELECT COUNT(*) n FROM projects').n, 49);
  assert.equal(get(`SELECT COUNT(*) n FROM projects WHERE name IN ('Thematic','Core RTB','Lo-Fi Content')`).n, 0);
  const t = proj('Tights'); assert.equal(t.assets, '6S, 2V, 2C'); assert.equal(t.deliverables, 2);
  assert.equal(proj('Pillows').deliverables, 5);      // 1V + 4G
  assert.equal(proj('Pull Up Bar').deliverables, 3);  // GIF-only ask is ours
  assert.equal(t.brand, 'Apparel'); assert.equal(t.type, 'Creative Concepts'); assert.equal(t.month, '2026-12');
  assert.match(t.brief, /^Angle: .*\n\nConcept \/ Thematic: .*\n\nMessaging: .*\n\nImagery: /s);
});

test('static/carousel-only rows are skipped and counted; changing the filter re-processes the sheet', async () => {
  loadSheet();
  S.demoAddRow(FIX.tab, { [H('requirements')]: 'Banner refresh', [H('category')]: 'Apparel', [H('live date')]: '20/12/26', [H('asset')]: '4S, 2C' });
  S.demoAddRow(FIX.tab, { [H('requirements')]: 'No asset given', [H('category')]: 'Apparel', [H('live date')]: '21/12/26' });
  const r = await runSync();
  assert.equal(r.skipped, 2); assert.equal(proj('Banner refresh'), null); assert.equal(proj('No asset given'), null);
  // team now also takes carousels -> the same sheet yields more projects without any new sheet edit
  saveSettings({ assets: { import_codes: ['V', 'G', 'C'] } });
  const r2 = await runSync();
  assert.equal(r2.created, 1); assert.ok(proj('Banner refresh'));
  // ...and narrowing the filter drops (flags) projects that no longer qualify instead of deleting them
  saveSettings({ assets: { import_codes: ['G'] } });
  const r3 = await runSync();
  assert.ok(r3.removed > 40); assert.equal(proj('Pull Up Bar').removed_from_sheet, false);
});

test('Owner column: one or many names, any wording; first is primary, others are co-owners', () => {
  const members = P.allMembers();
  const res = (s) => resolveMembers(s, members);
  assert.deepEqual(res('Antony T J').matched.map((m) => m.name), ['Antony T J']);
  assert.deepEqual(res('Enbarasan').matched.map((m) => m.name), ['Enbarasan E']);                       // first name only
  assert.deepEqual(res('Mukul Chaudhary\nShwetank').matched.map((m) => m.name), ['Mukul Chaudhary', 'Shwetank']);
  assert.deepEqual(res('Antony T J Enbarasan E').matched.map((m) => m.name), ['Antony T J', 'Enbarasan E']);
  const odd = res('Enbarasan E Shwetank Adarsh Pandit');
  assert.deepEqual(odd.matched.map((m) => m.name), ['Enbarasan E', 'Shwetank']); assert.equal(odd.leftover, 'adarsh pandit');
  assert.equal(res('Nobody Here').matched.length, 0);
  assert.equal(res('').matched.length, 0);
});

test('real sheet: Owner cells are respected, co-owners recorded, unknown co-owner flagged', async () => {
  loadSheet();
  await runSync();
  assert.equal(P.getMember(proj('WW Jackets (Women)').assignee_id).name, 'Shwetank');
  assert.equal(P.getMember(proj('Trackpants & Joggers (Men)').assignee_id).name, 'Antony T J');
  const tights = proj('Tights');
  assert.equal(P.getMember(tights.assignee_id).name, 'Mukul Chaudhary'); assert.equal(tights.assign_mode, 'sheet');
  assert.deepEqual(tights.collaborators.map((id) => P.getMember(id).name), ['Shwetank']);
  assert.ok(proj('WW Jackets (Plus)').flags.some((f) => f.code === 'unknown_coowner'));
  // projects with no Owner are auto-assigned
  assert.equal(proj('Athleisure (Men)').assign_mode, 'auto');
  assert.ok(all('SELECT assignee_id FROM projects').every((p) => p.assignee_id));
});

test('dates: Revised wins over Live; bare day and ordinals resolve against the live month', () => {
  assert.equal(parseDate('14th', 2026, 12), '2026-12-14');
  assert.equal(parseDate('4th Dec', 2026), '2026-12-04');
  assert.equal(parseDate('30/12/26'), '2026-12-30');
  const { records } = parseSnapshot({ tabs: [{ name: "December'26 Asks", headers: FIX.headers, rows: FIX.rows.filter((r) => [5, 18, 24].includes(r.rowNumber)).map((r) => ({ rowNumber: r.rowNumber, values: r.values })) }] }, { assetCodes: ['V', 'G'] });
  const by = Object.fromEntries(records.map((r) => [r.name, r]));
  assert.equal(by['Trackpants & Joggers (Men)'].deadline, '2026-12-04');   // live 10/12, revised 4th Dec
  assert.equal(by['FW'].deadline, '2026-12-14');                           // live 10/12, revised "14th"
  assert.equal(by['Pillows'].deadline, '2026-12-17');                      // live 8/12, revised "17th"
  assert.equal(by['FW'].extra['Live Date'], '10/12/26');                   // both dates stay visible
});

test('revised-date change is one clean change entry, not noise', async () => {
  loadSheet();
  await runSync();
  S.demoSetCell(FIX.tab, FIX.rows.find((r) => r.values[H('requirements')] === 'FW NPD').rowNumber, H('revised'), '18th Dec');
  await runSync();
  const ch = all(`SELECT label, old_value, new_value FROM changes WHERE source='sheet'`);
  assert.deepEqual(ch.find((c) => c.label === 'Delivery date'), { label: 'Delivery date', old_value: 'December 24, 2026', new_value: 'December 18, 2026' });
  assert.ok(!ch.some((c) => c.label === 'Live Date'));
});

test('asset requirement changes are tracked and deliverables update', async () => {
  loadSheet();
  await runSync();
  const row = FIX.rows.find((r) => r.values[H('requirements')] === 'Tights').rowNumber;
  S.demoSetCell(FIX.tab, row, H('asset'), '6S, 3V, 2C');
  await runSync();
  assert.equal(proj('Tights').deliverables, 3);
  assert.deepEqual(all(`SELECT old_value, new_value FROM changes WHERE label='Asset requirement'`), [{ old_value: '6S, 2V, 2C', new_value: '6S, 3V, 2C' }]);
});

test('workload is balanced by videos/GIFs to make, not just project count', async () => {
  loadSheet((r) => r.rowNumber >= 2 && r.rowNumber <= 50 && !r.values[H('owner')].trim());
  await runSync();
  const loads = P.memberLoads();
  const d = Object.values(loads).map((l) => l.deliverables);
  assert.equal(d.length, 5);                                  // the PM takes projects too
  assert.ok(Math.max(...d) - Math.min(...d) <= 3, `deliverable spread too wide: ${d}`);
  // project-count mode: counts are tight instead
  saveSettings({ assign: { weight_mode: 'projects' } });
});

test('owner can opt out of auto-assignment', async () => {
  loadSheet((r) => r.rowNumber >= 2 && r.rowNumber <= 12 && !r.values[H('owner')].trim());
  const boss = get('SELECT id FROM team_members WHERE is_owner=1').id;
  P.allMembers(); const { update } = await import('../server/db.js'); update('team_members', boss, { enabled: 0 });
  await runSync();
  assert.equal(get('SELECT COUNT(*) n FROM projects WHERE assignee_id=?', boss).n, 0);
});

test('Google grid data: hidden hyperlinks are surfaced, header row detected, trailing blank columns dropped', () => {
  const cell = (t, link) => ({ formattedValue: t, ...(link ? { hyperlink: link } : {}) });
  const tab = gridToTab({ title: 'Dec', sheetId: 7 }, [
    { values: [cell('Requirements '), cell('URLs'), cell('Asset Requierment '), {}] },
    { values: [cell('Tights'), cell('Product URLs', 'https://www.cult.fit/p/tights'), cell('2S, 2V')] },
    { values: [cell('Yoga Mat'), { formattedValue: 'See links', textFormatRuns: [{ format: { link: { uri: 'https://a.example/1' } } }, { format: { link: { uri: 'https://a.example/2' } } }] }, cell('1V')] },
    {},
  ]);
  assert.deepEqual(tab.headers, ['Requirements', 'URLs', 'Asset Requierment']);
  assert.equal(tab.rows[0].values.URLs, 'Product URLs https://www.cult.fit/p/tights');
  assert.equal(tab.rows[1].values.URLs, 'See links https://a.example/1 https://a.example/2');
  assert.equal(tab.rows[0].rowNumber, 2);
  const { records } = parseSnapshot({ tabs: [tab] }, { assetCodes: ['V', 'G'] });
  assert.deepEqual(records[0].links, ['https://www.cult.fit/p/tights']);
});
