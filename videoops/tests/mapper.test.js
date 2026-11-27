import test from 'node:test';
import assert from 'node:assert/strict';
import { mapHeaders, parseDate, parseDuration, parseMonth, parsePriority, parseStatus, parseSnapshot } from '../server/engine/mapper.js';

test('header aliases map regardless of wording or order', () => {
  const m = mapHeaders(['Title', 'Due Date', 'Editor', 'Requirement', 'Brand/Campaign', 'Random Col']);
  assert.equal(m['Title'], 'name'); assert.equal(m['Due Date'], 'deadline'); assert.equal(m['Editor'], 'assignee');
  assert.equal(m['Requirement'], 'brief'); assert.equal(m['Brand/Campaign'], 'brand'); assert.equal(m['Random Col'], null);
});

test('date parsing handles common sheet formats', () => {
  assert.equal(parseDate('2026-12-08'), '2026-12-08');
  assert.equal(parseDate('08/12/2026'), '2026-12-08');   // DD/MM (India)
  assert.equal(parseDate('25/12/2026'), '2026-12-25');
  assert.equal(parseDate('December 8, 2026'), '2026-12-08');
  assert.equal(parseDate('8th Dec 2026'), '2026-12-08');
  assert.equal(parseDate('Dec 8', 2026), '2026-12-08');
  assert.equal(parseDate(46387), '2026-12-31'); // Sheets serial
  assert.equal(parseDate('soon'), null);
});

test('month, duration, priority, status parsing', () => {
  assert.equal(parseMonth('December 2026'), '2026-12'); assert.equal(parseMonth('Dec-26'), '2026-12'); assert.equal(parseMonth('2026-12'), '2026-12');
  assert.equal(parseMonth('Dec', 2026), '2026-12'); assert.equal(parseMonth(''), null);
  assert.equal(parseDuration('30'), 30); assert.equal(parseDuration('45s'), 45); assert.equal(parseDuration('1:30'), 90); assert.equal(parseDuration('2 min'), 120); assert.equal(parseDuration('n/a'), null);
  assert.equal(parsePriority('P0'), 'Urgent'); assert.equal(parsePriority('high'), 'High'); assert.equal(parsePriority('med'), 'Medium'); assert.equal(parsePriority(''), null);
  assert.equal(parseStatus('WIP'), 'In Progress'); assert.equal(parseStatus('Delivered'), 'Completed'); assert.equal(parseStatus('in review'), 'Review'); assert.equal(parseStatus('revision'), 'Changes Required');
});

test('snapshot parsing: month from tab, flags for missing info, extras kept, blank rows skipped', () => {
  const snap = { tabs: [{ name: 'Dec 2026', gid: '1', headers: ['Project Name', 'Brief', 'Delivery Date', 'Project Type', 'Reference Links', 'Region'], rows: [
    { rowNumber: 2, values: { 'Project Name': 'A', Brief: 'A proper brief describing the video in detail', 'Delivery Date': '2026-12-08', 'Project Type': 'Explainer', 'Reference Links': 'https://x.com/a, https://y.com/b', Region: 'IN' } },
    { rowNumber: 3, values: { 'Project Name': 'B', Brief: 'TBD', 'Delivery Date': '', 'Project Type': '', 'Reference Links': '', Region: '' } },
    { rowNumber: 4, values: { 'Project Name': '', Brief: '', 'Delivery Date': '', 'Project Type': '', 'Reference Links': '', Region: '' } },
    { rowNumber: 5, values: { 'Project Name': '', Brief: 'orphan text', 'Delivery Date': '', 'Project Type': '', 'Reference Links': '', Region: '' } },
  ] }] };
  const { records, issues } = parseSnapshot(snap);
  assert.equal(records.length, 2); assert.equal(issues.length, 1);
  assert.equal(records[0].month, '2026-12'); assert.deepEqual(records[0].links.length, 2); assert.equal(records[0].extra.Region, 'IN'); assert.equal(records[0].flags.length, 0);
  assert.deepEqual(records[1].flags.map((f) => f.code).sort(), ['no_deadline', 'no_links', 'no_type', 'unclear_brief']);
});
