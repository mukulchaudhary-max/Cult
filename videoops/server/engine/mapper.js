// Turns raw Google Sheet rows (any column order / header wording) into normalised project
// records, plus the "missing information" flags the automation raises.
import { slug, MONTH_NAMES, monthKeyOf, pad, strFromDate } from '../util.js';
import { PRIORITIES } from '../constants.js';

export const FIELD_ALIASES = {
  id: ['project id', 'id', 'brief id', 'ref id', 'reference id', 'project code'],
  month: ['month', 'requirement month', 'brief month', 'delivery month'],
  revised: ['revised dates', 'revised date', 'revised deadline', 'internal deadline', 'revised delivery', 'revised'],
  assets: ['asset requirement', 'asset requierment', 'asset requirements', 'asset req', 'assets', 'asset', 'deliverables'],
  name: ['project name', 'project', 'name', 'title', 'video name', 'video title', 'project title'],
  brand: ['brand', 'brand campaign', 'brand / campaign', 'brand/campaign', 'campaign', 'client', 'brand or campaign', 'category'],
  type: ['project type', 'type', 'video type', 'format', 'deliverable', 'content type', 'creative type'],
  brief: ['brief', 'requirement', 'requirements', 'description', 'project brief', 'details', 'video brief', 'script brief'],
  duration: ['duration', 'video duration', 'length', 'video length', 'duration sec', 'duration s', 'runtime'],
  deadline: ['delivery date', 'deadline', 'due date', 'delivery', 'due', 'delivery deadline', 'due on', 'live date', 'go live date', 'launch date'],
  priority: ['priority', 'urgency'],
  status: ['status', 'project status', 'stage'],
  assignee: ['assigned to', 'assignee', 'owner', 'editor', 'assigned', 'teammate', 'assigned editor', 'assigned to editor'],
  links: ['reference links', 'reference link', 'references', 'reference', 'ref links', 'links', 'link', 'reference url', 'inspiration', 'urls', 'url'],
  product: ['product', 'product info', 'product information', 'product details', 'sku', 'product name'],
};
export const BRIEF_PARTS = [['angle', 'Angle'], ['concept', 'Concept / Thematic'], ['messaging', 'Messaging'], ['imagery', 'Imagery']];
const PART_ALIASES = { angle: ['angle'], concept: ['concepts thematic', 'concept thematic', 'concepts', 'concept', 'thematic'], messaging: ['messaging', 'message'], imagery: ['imagery', 'visuals', 'visual direction'] };
const aliasIndex = {};
for (const [field, list] of Object.entries(FIELD_ALIASES)) for (const a of list) aliasIndex[slug(a)] = field;

export function mapHeaders(headers) {
  const mapping = {}; // header -> field | null(extra)
  const used = new Set();
  for (const h of headers) {
    let f = aliasIndex[slug(h)];
    if (!f && /^asset req/.test(slug(h))) f = 'assets'; // tolerate typos: "Asset Requierment"
    if (f && !used.has(f)) { mapping[h] = f; used.add(f); } else mapping[h] = null;
  }
  // "Requirements" is a brief column in most sheets but the project name in some: if nothing else is a name, promote it.
  if (!used.has('name')) {
    const h = headers.find((x) => mapping[x] === 'brief' && ['requirement', 'requirements'].includes(slug(x)));
    if (h) { mapping[h] = 'name'; used.delete('brief'); used.add('name'); }
  }
  // no plain brief column? assemble the brief from Angle / Concept / Messaging / Imagery columns
  if (!used.has('brief')) {
    for (const [part] of BRIEF_PARTS) {
      const h = headers.find((x) => !mapping[x] && PART_ALIASES[part].includes(slug(x)));
      if (h) mapping[h] = `brief:${part}`;
    }
  }
  return mapping;
}

const MONTH_ABBR = MONTH_NAMES.map((m) => m.slice(0, 3).toLowerCase());
function monthIndexFromWord(w) {
  const i = MONTH_ABBR.indexOf(String(w).toLowerCase().slice(0, 3));
  return i >= 0 && MONTH_NAMES[i].toLowerCase().startsWith(String(w).toLowerCase().slice(0, 3)) ? i + 1 : 0;
}

/** Parse many human date shapes → YYYY-MM-DD (or null). `refYear` fills in a missing year. */
export function parseDate(raw, refYear, refMonth) {
  if (raw == null) return null;
  if (typeof raw === 'number' && raw > 20000 && raw < 80000) { // Sheets serial date
    return strFromDate(new Date(Date.UTC(1899, 11, 30) + raw * 86400000));
  }
  let s = String(raw).trim();
  if (!s) return null;
  let m;
  if ((m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/))) return `${m[1]}-${pad(m[2])}-${pad(m[3])}`;
  if ((m = s.match(/^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{2,4})$/))) { // DD/MM/YYYY (India)
    const y = m[3].length === 2 ? 2000 + +m[3] : +m[3];
    if (+m[2] > 12 && +m[1] <= 12) return `${y}-${pad(m[1])}-${pad(m[2])}`;
    return `${y}-${pad(m[2])}-${pad(m[1])}`;
  }
  s = s.replace(/(\d)(st|nd|rd|th)\b/gi, '$1').replace(/,/g, ' ').replace(/\s+/g, ' ');
  if (refMonth && (m = s.match(/^(\d{1,2})$/)) && +m[1] >= 1 && +m[1] <= 31) return `${refYear}-${pad(refMonth)}-${pad(m[1])}`; // bare day ("14th")
  if ((m = s.match(/^(\d{1,2}) ([A-Za-z]+)(?: (\d{4}))?$/)) && monthIndexFromWord(m[2])) return `${m[3] || refYear}-${pad(monthIndexFromWord(m[2]))}-${pad(m[1])}`;
  if ((m = s.match(/^([A-Za-z]+) (\d{1,2})(?: (\d{4}))?$/)) && monthIndexFromWord(m[1])) return `${m[3] || refYear}-${pad(monthIndexFromWord(m[1]))}-${pad(m[2])}`;
  return null;
}

export function parseMonth(raw, refYear) {
  if (raw == null || String(raw).trim() === '') return null;
  const s = String(raw).trim();
  let m;
  if ((m = s.match(/^(\d{4})-(\d{1,2})$/))) return monthKeyOf(+m[1], +m[2]);
  if ((m = s.match(/^(\d{1,2})[/\-](\d{4})$/))) return monthKeyOf(+m[2], +m[1]);
  if ((m = s.match(/^([A-Za-z]+)[\s\-']*(\d{2,4})?$/)) && monthIndexFromWord(m[1])) {
    let y = m[2] ? +m[2] : refYear;
    if (m[2] && m[2].length === 2) y = 2000 + y;
    return monthKeyOf(y, monthIndexFromWord(m[1]));
  }
  const emb = s.match(/([A-Za-z]{3,9})[\s\-']*((?:20)?\d{2})\b/);
  if (emb && monthIndexFromWord(emb[1]) && MONTH_NAMES.some((n) => n.toLowerCase().startsWith(emb[1].toLowerCase().slice(0, 3)))) return monthKeyOf(emb[2].length === 2 ? 2000 + +emb[2] : +emb[2], monthIndexFromWord(emb[1]));
  const d = parseDate(s, refYear);
  return d ? d.slice(0, 7) : null;
}

export function parseDuration(raw) {
  if (raw == null || String(raw).trim() === '') return null;
  const s = String(raw).trim().toLowerCase();
  let m;
  if ((m = s.match(/^(\d+):(\d{2})$/))) return +m[1] * 60 + +m[2];
  if ((m = s.match(/^(\d+(?:\.\d+)?)\s*(m|min|mins|minute|minutes)\b/))) return Math.round(+m[1] * 60);
  if ((m = s.match(/^(\d+(?:\.\d+)?)\s*(s|sec|secs|second|seconds)?$/))) return Math.round(+m[1]);
  return null;
}

export function parsePriority(raw) {
  const s = String(raw ?? '').trim().toLowerCase();
  if (!s) return null;
  if (/^(p0|urgent|critical|asap|highest)/.test(s)) return 'Urgent';
  if (/^(p1|high)/.test(s)) return 'High';
  if (/^(p2|med|normal|moderate)/.test(s)) return 'Medium';
  if (/^(p3|low)/.test(s)) return 'Low';
  return PRIORITIES.find((p) => p.toLowerCase() === s) || null;
}

export function parseStatus(raw) {
  const s = String(raw ?? '').trim().toLowerCase();
  if (!s) return null;
  if (/^(new|brief received|received)/.test(s)) return 'New Brief Received';
  if (/^(pending|unassigned|to be assigned|tbd)/.test(s)) return 'Pending Assignment';
  if (/^(assigned)/.test(s)) return 'Assigned';
  if (/^(wip|in progress|in-progress|editing|started|ongoing)/.test(s)) return 'In Progress';
  if (/review/.test(s)) return 'Review';
  if (/(change|revision|rework|revise|feedback)/.test(s)) return 'Changes Required';
  if (/^(done|delivered|complete|approved|closed|published|live)/.test(s)) return 'Completed';
  if (/hold|paused|blocked/.test(s)) return 'On Hold';
  return null;
}

/** "2S, 1V, 1C, 4G" -> {S:2,V:1,C:1,G:4} (null when nothing recognisable). A bare letter counts as 1. */
export function parseAssets(raw) {
  const out = {};
  for (const m of String(raw || '').toUpperCase().matchAll(/(?<![A-Z0-9])(\d+)?\s*([SVCG])(?![A-Z])/g)) out[m[2]] = (out[m[2]] || 0) + (m[1] ? +m[1] : 1);
  return Object.keys(out).length ? out : null;
}
export const ASSET_LABEL = { S: 'Static', V: 'Video', C: 'Carousel', G: 'GIF' };

export function parseLinks(raw) {
  if (!raw) return [];
  return [...new Set(String(raw).split(/[\s,;]+/).map((t) => t.trim()).filter((t) => /^https?:\/\//i.test(t)))];
}

const UNCLEAR = /(\btbd\b|\btba\b|to be (decided|confirmed|shared)|\?{1,}|\bnot sure\b|\bwill share\b|\bsome video\b|\bsomething\b)/i;

export function computeFlags(rec) {
  const flags = [];
  if (!rec.deadline) flags.push({ code: 'no_deadline', label: 'No deadline' });
  if (!rec.brief) flags.push({ code: 'no_brief', label: 'Missing brief' });
  else if (rec.brief.length < 25 || (rec.brief.length < 140 && UNCLEAR.test(rec.brief))) flags.push({ code: 'unclear_brief', label: 'Unclear requirement' });
  if (!rec.links.length && !rec.linksText) flags.push({ code: 'no_links', label: 'No reference link' });
  if (!rec.type) flags.push({ code: 'no_type', label: 'Missing project type' });
  return flags;
}

export function fingerprintOf(rec) {
  return `${rec.month || ''}|${slug(rec.name)}`;
}

/**
 * snapshot: { tabs:[{name,gid,headers:[],rows:[{rowNumber, values:{header:string}}]}] }
 * returns { records, issues, columns }
 */
/**
 * snapshot: { tabs:[{name,gid,headers:[],rows:[{rowNumber, values:{header:string}}]}] }
 * options.assetCodes: e.g. ['V','G'] -> import only rows whose Asset Requirement contains one of these
 *   (only applies when the sheet has an asset column; null/empty = import everything)
 * returns { records, issues, columns, skipped:{filtered,noAsset,rows[]} }
 */
export function parseSnapshot(snapshot, { now = new Date(), assetCodes = null } = {}) {
  const records = [], issues = [], columns = [];
  const skipped = { filtered: 0, noAsset: 0, ignored: 0, rows: [] };
  const nowYear = now.getFullYear();
  for (const tab of snapshot.tabs) {
    const mapping = mapHeaders(tab.headers);
    columns.push({ tab: tab.name, mapping, recognized: Object.entries(mapping).filter(([, f]) => f).length, extras: Object.entries(mapping).filter(([, f]) => !f).map(([h]) => h), assetFilter: !!(assetCodes?.length && Object.values(mapping).includes('assets')) });
    const byField = {};
    for (const [h, f] of Object.entries(mapping)) if (f) byField[f] = h;
    const filterOn = !!(assetCodes?.length && byField.assets);
    for (const row of tab.rows) {
      const v = row.values;
      const cell = (f) => { const h = byField[f]; const x = h ? v[h] : undefined; return x == null ? '' : String(x).trim(); };
      if (!Object.values(v).some((x) => String(x ?? '').trim())) continue;

      // ---- asset filter: this team only takes the asset types in `assetCodes` (e.g. Video + GIF)
      const assetsRaw = cell('assets');
      const counts = parseAssets(assetsRaw);
      let deliverables = null;
      if (byField.assets) deliverables = counts ? Object.entries(counts).filter(([k]) => !filterOn || assetCodes.includes(k)).reduce((a, [, n]) => a + n, 0) : 0;
      if (filterOn) {
        const wanted = counts && assetCodes.some((c) => counts[c] > 0);
        if (!wanted) {
          const looksLikeBrief = cell('name') && (cell('deadline') || cell('revised'));
          if (counts) { skipped.filtered++; skipped.rows.push({ tab: tab.name, row: row.rowNumber, name: cell('name'), reason: `No ${assetCodes.join('/')} in “${assetsRaw}”` }); }
          else if (looksLikeBrief) { skipped.noAsset++; skipped.rows.push({ tab: tab.name, row: row.rowNumber, name: cell('name'), reason: 'No asset requirement' }); }
          else skipped.ignored++;
          continue;
        }
      }

      const name = cell('name').replace(/\s+/g, ' ');
      if (!name) { issues.push({ tab: tab.name, row: row.rowNumber, code: 'no_name', message: `Row ${row.rowNumber} in "${tab.name}" has content but no project name — skipped` }); continue; }
      const tabMonth = parseMonth(tab.name, nowYear);
      const refYear = (parseMonth(cell('month'), nowYear) || tabMonth || monthKeyOf(nowYear, 1)).slice(0, 4);
      const live = parseDate(raw(v, byField.deadline), +refYear);
      const revisedRaw = cell('revised');
      const revised = revisedRaw ? parseDate(revisedRaw, live ? +live.slice(0, 4) : +refYear, live ? +live.slice(5, 7) : null) : null;
      const deadline = revised || live;
      const month = parseMonth(cell('month'), +refYear) || tabMonth || (deadline ? deadline.slice(0, 7) : null);

      const extra = {};
      for (const [h, f] of Object.entries(mapping)) if (!f) { const x = String(v[h] ?? '').trim(); if (x) extra[h] = x; }
      // both dates stay visible & change-tracked even though one wins as "the deadline"
      if (byField.deadline && cell('deadline')) extra[byField.deadline.trim()] = cell('deadline');
      if (byField.revised && revisedRaw) extra[byField.revised.trim()] = revisedRaw;

      let brief = cell('brief');
      if (!brief) {
        const parts = BRIEF_PARTS.map(([k, label]) => [label, cell(`brief:${k}`)]).filter(([, t]) => t);
        brief = parts.map(([label, t]) => `${label}: ${t.replace(/\s*\n\s*/g, ' · ')}`).join('\n\n');
      }
      const linksCell = cell('links');
      const rec = {
        id: cell('id') || null, tab: tab.name, gid: tab.gid ?? null, row: row.rowNumber,
        month, name, brand: cell('brand'), type: cell('type'), brief,
        duration: parseDuration(cell('duration')), deadline, liveDate: live, revisedDate: revised, priority: parsePriority(cell('priority')),
        status: parseStatus(cell('status')), statusRaw: cell('status'), assignee_raw: cell('assignee'),
        links: parseLinks(linksCell), linksText: linksCell, product: cell('product'), extra,
        rawDeadline: cell('deadline'), liveKey: byField.deadline ? byField.deadline.trim() : null, assets: assetsRaw, assetCounts: counts, deliverables,
      };
      rec.flags = computeFlags(rec);
      if (cell('deadline') && !live) rec.flags.push({ code: 'bad_deadline', label: `Unreadable date "${cell('deadline')}"` });
      else if (revisedRaw && !revised) rec.flags.push({ code: 'bad_deadline', label: `Unreadable revised date "${revisedRaw}"` });
      records.push(rec);
    }
  }
  return { records, issues, columns, skipped };
}
function raw(v, header) { return header ? v[header] : undefined; }
