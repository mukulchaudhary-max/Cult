// Pure assignment planner — no I/O, fully unit-testable.
//
// Goal: spread a batch of unassigned projects fairly across the teammates who can take them.
//  * strategy "balance_total": always give the next project to whoever has the lowest total
//    workload (existing + already given in this batch). Equal loads => equal split; uneven
//    loads => the batch levels the team out.
//  * strategy "equal_batch": everyone gets the same number from THIS batch (remainder goes to
//    the people with the lowest existing workload), regardless of existing load.
// Availability, leave dates, capacity caps, and per-person type/brand restrictions are hard
// constraints. Type/brand preferences are soft tie-breakers.
import { PRIORITY_RANK, PRIORITY_WEIGHT } from '../constants.js';

const FACTOR = { available: 1, limited: 0.5, unavailable: 0 };

export function eligibility(member, project, { today, skipUnavailable = true, defaultMaxActive = null }, load) {
  if (member.is_owner) return { ok: false, reason: 'Owner — only assigned manually' };
  if (!member.enabled) return { ok: false, reason: 'Auto-assignment disabled' };
  if (skipUnavailable) {
    if (member.availability === 'unavailable') return { ok: false, reason: 'Marked unavailable' };
    if (member.leave_until && today && member.leave_until >= today) return { ok: false, reason: `On leave until ${member.leave_until}` };
  }
  const prefs = member.prefs || {};
  if (project) {
    if (project.type && (prefs.excluded_types || []).some((t) => t.toLowerCase() === project.type.toLowerCase())) return { ok: false, reason: `Excludes ${project.type}` };
    if (project.brand && (prefs.excluded_brands || []).some((b) => b.toLowerCase() === project.brand.toLowerCase())) return { ok: false, reason: `Excludes ${project.brand}` };
  }
  const cap = member.max_active ?? defaultMaxActive;
  if (cap != null && load != null && load >= cap) return { ok: false, reason: `At capacity (${cap} active)` };
  return { ok: true };
}

function prefMatch(member, project) {
  const p = member.prefs || {};
  const t = (project.type || '').toLowerCase(), b = (project.brand || '').toLowerCase();
  return (p.preferred_types || []).some((x) => x.toLowerCase() === t) || (p.preferred_brands || []).some((x) => x.toLowerCase() === b);
}

/**
 * @param projects [{id,priority,deadline,type,brand}]
 * @param members  [{id,name,enabled,availability,leave_until,max_active,prefs,last_assigned_at,is_owner}]
 * @param loads    {memberId: {count, weighted}} existing workload
 */
export function planAssignments({ projects, members, loads = {}, options = {} }) {
  const opts = { strategy: 'balance_total', weightByPriority: false, preferenceTolerance: 0, skipUnavailable: true, defaultMaxActive: null, today: null, ...options };
  const state = new Map();
  for (const m of members) {
    const l = loads[m.id] || { count: 0, weighted: 0 };
    state.set(m.id, { m, count: l.count || 0, weighted: l.weighted ?? l.count ?? 0, batch: 0, batchWeighted: 0, factor: FACTOR[m.availability] ?? 1 });
  }
  const weight = (p) => (opts.weightByPriority ? PRIORITY_WEIGHT[p.priority] || 1 : 1);
  const ordered = [...projects].sort((a, b) =>
    (PRIORITY_RANK[b.priority] || 2) - (PRIORITY_RANK[a.priority] || 2)
    || (a.deadline || '9999').localeCompare(b.deadline || '9999') || a.id - b.id);

  const assignments = [], unassigned = [];
  const skippedMembers = new Map(); // memberId -> reason (for explainability)
  for (const m of members) {
    const e = eligibility(m, null, { ...opts, today: opts.today }, null);
    if (!e.ok && !m.is_owner) skippedMembers.set(m.id, e.reason);
  }

  for (const p of ordered) {
    const cands = [];
    for (const s of state.values()) {
      const e = eligibility(s.m, p, opts, s.count + s.batch);
      if (e.ok && s.factor > 0) cands.push(s);
    }
    if (!cands.length) {
      unassigned.push({ projectId: p.id, reason: members.some((m) => !m.is_owner && m.enabled) ? 'No available teammate matches this project (availability, leave, capacity or restrictions)' : 'No teammates are enabled for auto-assignment' });
      continue;
    }
    const score = (s) => (s.weighted + s.batchWeighted) / s.factor;
    const key = opts.strategy === 'equal_batch'
      ? (s) => [s.batch / s.factor, score(s)]
      : (s) => [score(s), s.batch];
    cands.sort((a, b) => {
      const ka = key(a), kb = key(b);
      for (let i = 0; i < ka.length; i++) if (Math.abs(ka[i] - kb[i]) > 1e-9) return ka[i] - kb[i];
      return 0;
    });
    const best = cands[0];
    const bestKey = key(best);
    const near = cands.filter((s) => {
      const k = key(s);
      return k[0] - bestKey[0] <= 1e-9 + (opts.preferenceTolerance || 0) / s.factor;
    });
    // soft preference, then older last-assigned, then id: deterministic tie-breaks
    const cmpKey = (a, b) => { const ka = key(a), kb = key(b); for (let i = 0; i < ka.length; i++) if (Math.abs(ka[i] - kb[i]) > 1e-9) return ka[i] - kb[i]; return 0; };
    // when the preference tolerance is 0, `near` only holds exact ties, so preference is purely a tie-break
    const pick = near.sort((a, b) =>
      (prefMatch(b.m, p) - prefMatch(a.m, p))
      || cmpKey(a, b) || (a.batch - b.batch)
      || (a.m.last_assigned_at || '').localeCompare(b.m.last_assigned_at || '')
      || a.m.id - b.m.id)[0];

    const workloadBefore = pick.count + pick.batch;
    const matched = prefMatch(pick.m, p);
    pick.batch += 1;
    pick.batchWeighted += weight(p);
    const others = cands.length - 1;
    const reasonBits = [];
    reasonBits.push(opts.strategy === 'equal_batch'
      ? `Fair share of this batch (${pick.batch} so far)`
      : `Lowest workload (${workloadBefore} active) among ${cands.length} available teammate${cands.length > 1 ? 's' : ''}`);
    if (matched) reasonBits.push(`matches preference for ${p.type || p.brand}`);
    if (pick.factor < 1) reasonBits.push('limited availability weighting');
    assignments.push({ projectId: p.id, memberId: pick.m.id, reason: reasonBits.join(' · '), workloadBefore, considered: cands.length, others });
  }

  const loadsAfter = {};
  for (const s of state.values()) loadsAfter[s.m.id] = { before: s.count, added: s.batch, after: s.count + s.batch };
  return { assignments, unassigned, loadsAfter, skippedMembers: Object.fromEntries(skippedMembers) };
}

// Balance score 0-100: 100 = perfectly even across available teammates.
export function balanceScore(counts) {
  const v = counts.filter((n) => Number.isFinite(n));
  if (v.length < 2) return 100;
  const max = Math.max(...v), min = Math.min(...v);
  const avg = v.reduce((a, b) => a + b, 0) / v.length;
  if (avg === 0) return 100;
  const spread = (max - min) / Math.max(avg, 1);
  return Math.max(0, Math.round(100 - spread * 40));
}
