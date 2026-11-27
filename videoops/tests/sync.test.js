import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { openDb, all, get, insert } from '../server/db.js';
import { resetSettingsCache, saveSettings } from '../server/settings.js';
import * as S from '../server/integrations/sheetSource.js';
import { runSync } from '../server/engine/sync.js';
import * as P from '../server/services/projects.js';
import { nowIso } from '../server/clock.js';

const row = (name, extra = {}) => ({ Month: 'December 2026', 'Project Name': name, 'Brand / Campaign': 'Cult Gear', 'Project Type': 'Product Video', Brief: `Detailed brief for ${name} with enough words`, 'Duration (sec)': '30', 'Delivery Date': '2026-12-20', Priority: 'Medium', Status: '', 'Assigned To': '', 'Reference Links': 'https://example.com/ref', 'Product Info': 'SKU', Notes: '', ...extra });
const member = (name, extra = {}) => insert('team_members', { name, email: `${name.split(' ')[0].toLowerCase()}@gmail.com`, role: 'Editor', enabled: 1, availability: 'available', prefs: '{}', is_owner: 0, created_at: nowIso(), ...extra });
const names = () => all('SELECT name FROM projects ORDER BY id').map((r) => r.name);
const proj = (name) => P.hydrate(get('SELECT * FROM projects WHERE name=?', name));

beforeEach(() => {
  openDb(':memory:'); resetSettingsCache(); saveSettings({});
  insert('team_members', { name: 'Boss', email: 'boss@gmail.com', role: 'PM', enabled: 0, availability: 'available', prefs: '{}', is_owner: 1, created_at: nowIso() });
  member('Aarav Mehta'); member('Diya Nair'); member('Rohan Kapoor'); member('Ishita Rao');
});

test('imports new briefs, detects the month, assigns equally and emails everyone', async () => {
  for (let i = 1; i <= 8; i++) S.demoAddRow('Dec 2026', row(`Project ${i}`));
  const r = await runSync();
  assert.equal(r.status, 'success'); assert.equal(r.created, 8); assert.equal(r.assigned, 8);
  const per = all('SELECT assignee_id, COUNT(*) n FROM projects GROUP BY assignee_id').map((x) => x.n);
  assert.deepEqual(per, [2, 2, 2, 2]);
  assert.equal(get(`SELECT COUNT(*) n FROM emails WHERE kind='assignment'`).n, 8);
  assert.equal(get(`SELECT COUNT(*) n FROM emails WHERE kind='owner_new_briefs'`).n, 1);
  assert.equal(get('SELECT label FROM months').label, 'December 2026');
  assert.ok(all('SELECT status FROM projects').every((p) => p.status === 'Assigned'));
});

test('repeated syncs never duplicate projects', async () => {
  S.demoAddRow('Dec 2026', row('A')); S.demoAddRow('Dec 2026', row('B'));
  await runSync(); const r2 = await runSync(); const r3 = await runSync();
  assert.deepEqual(names(), ['A', 'B']); assert.equal(r2.created, 0); assert.equal(r3.created, 0);
  assert.equal(get('SELECT COUNT(*) n FROM assignments').n, 2);
});

test('change detection: records old/new, updates the same project, emails the owner', async () => {
  S.demoAddRow('Dec 2026', row('Winter')); await runSync();
  S.demoSetCell('Dec 2026', 2, 'Delivery Date', '2026-12-23'); S.demoSetCell('Dec 2026', 2, 'Brief', 'Version 2 of the brief, with new hero shot'); S.demoSetCell('Dec 2026', 2, 'Priority', 'High');
  const r = await runSync();
  assert.equal(r.updated, 1); assert.equal(r.changes, 3);
  const ch = all(`SELECT label, old_value, new_value, source FROM changes ORDER BY id`);
  assert.deepEqual(ch.find((c) => c.label === 'Delivery date'), { label: 'Delivery date', old_value: 'December 20, 2026', new_value: 'December 23, 2026', source: 'sheet' });
  assert.equal(proj('Winter').deadline, '2026-12-23'); assert.equal(proj('Winter').priority, 'High');
  assert.equal(names().length, 1);
  const mail = get(`SELECT * FROM emails WHERE kind='owner_sheet_change'`);
  assert.match(mail.subject, /Project Update Detected – Winter/); assert.match(mail.text, /Previous delivery date: December 20, 2026/); assert.match(mail.text, /Updated delivery date: December 23, 2026/);
});

test('renaming a project in the sheet updates it instead of duplicating', async () => {
  S.demoAddRow('Dec 2026', row('Old Name')); await runSync();
  const id = proj('Old Name').id;
  S.demoSetCell('Dec 2026', 2, 'Project Name', 'Brand New Name');
  await runSync();
  assert.deepEqual(names(), ['Brand New Name']); assert.equal(proj('Brand New Name').id, id);
  assert.equal(get(`SELECT old_value FROM changes WHERE field='name'`).old_value, 'Old Name');
});

test('duplicate rows in the sheet are ignored and reported', async () => {
  S.demoAddRow('Dec 2026', row('Same')); S.demoAddRow('Dec 2026', row('same '));
  const r = await runSync();
  assert.equal(r.created, 1); assert.equal(r.duplicates, 1);
});

test('assignee named in the sheet is respected; unknown names are flagged and auto-assigned', async () => {
  S.demoAddRow('Dec 2026', row('Pre', { 'Assigned To': 'rohan' })); S.demoAddRow('Dec 2026', row('Ghost', { 'Assigned To': 'Nobody Here' }));
  await runSync();
  assert.equal(P.getMember(proj('Pre').assignee_id).name, 'Rohan Kapoor'); assert.equal(proj('Pre').assign_mode, 'sheet');
  assert.ok(proj('Ghost').assignee_id); assert.equal(proj('Ghost').assign_mode, 'auto');
  assert.ok(proj('Ghost').flags.some((f) => f.code === 'unknown_assignee'));
});

test('missing info is flagged but never blocks assignment', async () => {
  S.demoAddRow('Dec 2026', row('Thin', { 'Delivery Date': '', Brief: '', 'Reference Links': '', 'Project Type': '' }));
  const r = await runSync();
  assert.equal(r.flagged, 1); assert.ok(proj('Thin').assignee_id);
  assert.deepEqual(proj('Thin').flags.map((f) => f.code).sort(), ['no_brief', 'no_deadline', 'no_links', 'no_type']);
  assert.ok(get(`SELECT 1 x FROM notifications WHERE type='missing_info'`));
});

test('manual reassignment: history, workload moves, both teammates emailed; sheet cannot override it', async () => {
  S.demoAddRow('Dec 2026', row('X')); await runSync();
  const p = proj('X'); const from = p.assignee_id;
  const to = all('SELECT id FROM team_members WHERE is_owner=0 AND id!=?', from)[0].id;
  const r = await P.assignProject(p.id, to, { mode: 'manual', actor: 'you' });
  assert.equal(r.emails, 2);
  assert.equal(proj('X').assignee_id, to); assert.equal(proj('X').assign_mode, 'manual');
  const hist = all('SELECT from_member_id, to_member_id, mode FROM assignments WHERE project_id=? ORDER BY id', p.id);
  assert.equal(hist.length, 2); assert.equal(hist[1].from_member_id, from); assert.equal(hist[1].to_member_id, to);
  assert.equal(get(`SELECT COUNT(*) n FROM emails WHERE kind='reassigned_to'`).n, 1); assert.equal(get(`SELECT COUNT(*) n FROM emails WHERE kind='reassigned_from'`).n, 1);
  assert.equal(P.memberLoads()[from]?.count ?? 0, 0); assert.equal(P.memberLoads()[to].count, 1);
  // the sheet now names someone else — must be ignored (manual lock)
  S.demoSetCell('Dec 2026', 2, 'Assigned To', 'Rohan Kapoor'); await runSync();
  assert.equal(proj('X').assignee_id, to);
  assert.equal(get(`SELECT applied FROM changes WHERE field='assignee'`).applied, 0);
});

test('"Do not auto-assign" and "Assigned to me" are respected by the automation', async () => {
  S.demoAddRow('Dec 2026', row('Mine')); S.demoAddRow('Dec 2026', row('Held')); S.demoAddRow('Dec 2026', row('Normal')); await runSync();
  const boss = get('SELECT id FROM team_members WHERE is_owner=1').id;
  await P.assignProject(proj('Mine').id, boss, { actor: 'you' });
  await P.assignProject(proj('Held').id, null, { mode: 'locked', actor: 'you' });
  const r = await runSync(); // re-runs assignment workflow
  assert.equal(r.assigned, 0);
  assert.equal(proj('Mine').assign_mode, 'self'); assert.equal(proj('Held').assignee_id, null); assert.equal(proj('Held').assign_mode, 'locked');
  assert.equal(get(`SELECT COUNT(*) n FROM emails WHERE to_addr='boss@gmail.com'`).n, 0);
});

test('unavailable teammates get nothing; if everyone is out, projects are reported not lost', async () => {
  all('SELECT id FROM team_members WHERE is_owner=0').forEach((m) => P.allMembers() && insert('settings', { key: `x${m.id}`, value: '1' }));
  for (const m of all('SELECT id FROM team_members WHERE is_owner=0')) { const { update } = await import('../server/db.js'); update('team_members', m.id, { availability: 'unavailable' }); }
  S.demoAddRow('Dec 2026', row('Stuck'));
  await runSync();
  assert.equal(proj('Stuck').assignee_id, null); assert.equal(proj('Stuck').status, 'Pending Assignment');
  assert.ok(get(`SELECT 1 x FROM notifications WHERE type='assign_failed'`));
  // teammate returns -> next sync picks it up
  const { update } = await import('../server/db.js');
  update('team_members', all('SELECT id FROM team_members WHERE is_owner=0')[0].id, { availability: 'available' });
  await runSync();
  assert.ok(proj('Stuck').assignee_id);
});

test('rows removed from the sheet are flagged, not deleted; they restore when they return', async () => {
  S.demoAddRow('Dec 2026', row('Gone')); S.demoAddRow('Dec 2026', row('Stays')); await runSync();
  S.demoDeleteRow('Dec 2026', 2);
  const r = await runSync();
  assert.equal(r.removed, 1); assert.equal(proj('Gone').removed_from_sheet, true); assert.equal(names().length, 2);
});

test('an unchanged sheet short-circuits and still logs the run', async () => {
  S.demoAddRow('Dec 2026', row('A')); await runSync();
  const r = await runSync();
  assert.equal(r.status, 'success'); assert.equal(r.detail.note, 'Sheet unchanged since last sync');
  assert.equal(get('SELECT COUNT(*) n FROM sync_runs').n, 2);
});

test('sync failures are logged and surfaced, never thrown', async () => {
  saveSettings({ integrations: { sheet_mode: 'google', spreadsheet_id: '' } });
  const r = await runSync();
  assert.equal(r.status, 'failed'); assert.match(r.error, /No Google Sheet connected/);
  assert.ok(get(`SELECT 1 x FROM notifications WHERE type='sync_error'`));
});

test('status changes made in the app are not overwritten by a sync; sheet status changes are applied', async () => {
  S.demoAddRow('Dec 2026', row('S')); await runSync();
  await P.setStatus(proj('S').id, 'In Progress', { actor: 'you' });
  S.demoSetCell('Dec 2026', 2, 'Notes', 'irrelevant edit'); await runSync();
  assert.equal(proj('S').status, 'In Progress');
  S.demoSetCell('Dec 2026', 2, 'Status', 'Delivered'); await runSync();
  assert.equal(proj('S').status, 'Completed');
});
