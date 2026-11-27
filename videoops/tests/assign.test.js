import test from 'node:test';
import assert from 'node:assert/strict';
import { planAssignments, balanceScore } from '../server/engine/assign.js';

const mk = (n, extra = {}) => Array.from({ length: n }, (_, i) => ({ id: i + 1, name: `M${i + 1}`, enabled: true, availability: 'available', leave_until: null, max_active: null, prefs: {}, is_owner: false, ...extra }));
const projs = (n, extra = {}) => Array.from({ length: n }, (_, i) => ({ id: 100 + i, priority: 'Medium', deadline: `2026-12-${String((i % 28) + 1).padStart(2, '0')}`, type: 'Performance Ad', brand: 'Cult Gear', ...extra }));
const counts = (plan) => plan.assignments.reduce((a, x) => ((a[x.memberId] = (a[x.memberId] || 0) + 1), a), {});

test('4 teammates + 20 projects => 5 each', () => {
  const plan = planAssignments({ projects: projs(20), members: mk(4) });
  assert.deepEqual(Object.values(counts(plan)), [5, 5, 5, 5]);
  assert.equal(plan.unassigned.length, 0);
});

test('balance_total levels the team: lowest-load teammate takes more of the batch', () => {
  const loads = { 1: { count: 6 }, 2: { count: 2 }, 3: { count: 4 }, 4: { count: 3 } };
  const plan = planAssignments({ projects: projs(3), members: mk(4), loads });
  assert.equal(plan.loadsAfter[1].added, 0);
  assert.deepEqual([2, 3, 4].map((id) => plan.loadsAfter[id].after), [4, 4, 4]);
});

test('non-divisible batch (equal_batch): remainder goes to the least-loaded teammates', () => {
  const loads = { 1: { count: 6 }, 2: { count: 2 }, 3: { count: 4 }, 4: { count: 3 } };
  const plan = planAssignments({ projects: projs(6), members: mk(4), loads, options: { strategy: 'equal_batch' } });
  const c = counts(plan);
  assert.deepEqual([c[1], c[2], c[3], c[4]], [1, 2, 1, 2]);
});

test('non-divisible batch with equal loads: 22 projects over 4 => 6,6,5,5', () => {
  const plan = planAssignments({ projects: projs(22), members: mk(4) });
  assert.deepEqual(Object.values(counts(plan)).sort(), [5, 5, 6, 6]);
});

test('uneven loads are levelled by a batch (balance_total)', () => {
  const loads = { 1: { count: 8 }, 2: { count: 2 }, 3: { count: 2 }, 4: { count: 2 } };
  const plan = planAssignments({ projects: projs(6), members: mk(4), loads });
  const after = Object.values(plan.loadsAfter).map((l) => l.after);
  assert.ok(Math.max(...after) - Math.min(...after) <= 6);
  assert.equal(plan.loadsAfter[1].added, 0);
  assert.equal(plan.loadsAfter[2].added + plan.loadsAfter[3].added + plan.loadsAfter[4].added, 6);
});

test('equal_batch gives everyone the same share regardless of existing load', () => {
  const loads = { 1: { count: 8 }, 2: { count: 0 }, 3: { count: 0 }, 4: { count: 0 } };
  const plan = planAssignments({ projects: projs(8), members: mk(4), loads, options: { strategy: 'equal_batch' } });
  assert.deepEqual(Object.values(counts(plan)), [2, 2, 2, 2]);
});

test('unavailable, on-leave, disabled and owner are never assigned', () => {
  const members = mk(5);
  members[0].availability = 'unavailable'; members[1].leave_until = '2026-12-10'; members[2].enabled = false; members[4].is_owner = true; members[4].enabled = false; // owner not taking projects
  const plan = planAssignments({ projects: projs(6), members, options: { today: '2026-12-01' } });
  assert.deepEqual(Object.keys(counts(plan)), ['4']);
  assert.match(plan.skippedMembers[2], /leave/);
});

test('leave that has ended no longer blocks', () => {
  const members = mk(2); members[0].leave_until = '2026-11-01';
  const plan = planAssignments({ projects: projs(4), members, options: { today: '2026-12-01' } });
  assert.deepEqual(Object.values(counts(plan)), [2, 2]);
});

test('excluded types/brands and capacity are hard constraints', () => {
  const members = mk(3);
  members[0].prefs = { excluded_types: ['Performance Ad'] };
  members[1].max_active = 2;
  const plan = planAssignments({ projects: projs(6), members, loads: { 2: { count: 1 } } });
  const c = counts(plan);
  assert.equal(c[1], undefined);
  assert.equal(c[2], 1);
  assert.equal(c[3], 5);
});

test('nobody eligible => reported as unassigned, never throws', () => {
  const plan = planAssignments({ projects: projs(2), members: mk(2, { enabled: false }) });
  assert.equal(plan.assignments.length, 0);
  assert.equal(plan.unassigned.length, 2);
});

test('preferences break ties but do not break balance', () => {
  const members = mk(2);
  members[1].prefs = { preferred_types: ['Performance Ad'] };
  const plan = planAssignments({ projects: projs(4), members });
  assert.equal(plan.assignments[0].memberId, 2); // tie -> preference wins
  assert.deepEqual(Object.values(counts(plan)), [2, 2]);
});

test('limited availability takes roughly half the load', () => {
  const members = mk(2); members[1].availability = 'limited';
  const plan = planAssignments({ projects: projs(9), members });
  const c = counts(plan);
  assert.equal(c[1], 6); assert.equal(c[2], 3);
});

test('urgent projects are placed first, with the least-loaded teammate', () => {
  const ps = [...projs(3), { id: 999, priority: 'Urgent', deadline: '2026-12-02', type: 'x', brand: 'y' }];
  const plan = planAssignments({ projects: ps, members: mk(3), loads: { 1: { count: 5 }, 2: { count: 1 }, 3: { count: 3 } } });
  assert.equal(plan.assignments[0].projectId, 999);
  assert.equal(plan.assignments[0].memberId, 2);
});

test('deterministic: same input => same output', () => {
  const a = planAssignments({ projects: projs(10), members: mk(3) });
  const b = planAssignments({ projects: projs(10), members: mk(3) });
  assert.deepEqual(a.assignments, b.assignments);
});

test('owner takes projects like anyone else when enabled', () => {
  const members = mk(3); members[2].is_owner = true;
  const plan = planAssignments({ projects: projs(6), members });
  assert.deepEqual(Object.values(counts(plan)), [2, 2, 2]);
});

test('weights (videos/GIFs) balance effort, not project count', () => {
  const ps = [3, 1, 1, 1, 1, 1].map((w, i) => ({ id: 200 + i, priority: 'Medium', deadline: `2026-12-0${i + 1}`, type: 'x', brand: 'y', weight: w }));
  const plan = planAssignments({ projects: ps, members: mk(2) });
  const after = Object.values(plan.loadsAfter).map((l) => l.weightAfter);
  assert.deepEqual(after.sort(), [4, 4]);          // 3+1 vs 1+1+1+1
  assert.deepEqual(Object.values(counts(plan)).sort(), [2, 4]); // project counts differ on purpose
});

test('balanceScore', () => {
  assert.equal(balanceScore([4, 4, 4, 4]), 100);
  assert.ok(balanceScore([1, 9]) < 70);
});
