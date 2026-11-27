import crypto from 'node:crypto';

export const pad = (n) => String(n).padStart(2, '0');
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export const MONTH_NAMES = MONTHS;

export function dateFromStr(s) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}
export function strFromDate(dt) {
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
}
export function addDays(s, n) {
  const dt = dateFromStr(s);
  dt.setUTCDate(dt.getUTCDate() + n);
  return strFromDate(dt);
}
export function daysBetween(a, b) {
  return Math.round((dateFromStr(b) - dateFromStr(a)) / 86400000);
}
export function fmtDate(s) {
  if (!s) return '—';
  const dt = dateFromStr(s);
  return `${MONTHS[dt.getUTCMonth()]} ${dt.getUTCDate()}, ${dt.getUTCFullYear()}`;
}
export function monthLabel(key) {
  if (!key) return 'Unscheduled';
  const [y, m] = key.split('-').map(Number);
  return `${MONTHS[m - 1]} ${y}`;
}
export function monthKeyOf(y, m) { return `${y}-${pad(m)}`; }
export function addMonths(key, n) {
  const [y, m] = key.split('-').map(Number);
  const t = y * 12 + (m - 1) + n;
  return monthKeyOf(Math.floor(t / 12), (t % 12) + 1);
}
export function fmtDuration(sec) {
  if (!sec) return '—';
  if (sec < 60) return `${sec}s`;
  const m = Math.floor(sec / 60), s = sec % 60;
  return s ? `${m}m ${s}s` : `${m}m`;
}
export const slug = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
export const sha = (s) => crypto.createHash('sha1').update(String(s)).digest('hex');
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const jparse = (s, fallback = null) => { try { return s == null ? fallback : JSON.parse(s); } catch { return fallback; } };
export const clone = (o) => JSON.parse(JSON.stringify(o));
export function deepMerge(base, over) {
  if (Array.isArray(base) || typeof base !== 'object' || base === null) return over === undefined ? base : over;
  const out = { ...base };
  for (const k of Object.keys(over || {})) {
    out[k] = (base[k] && typeof base[k] === 'object' && !Array.isArray(base[k]) && over[k] && typeof over[k] === 'object')
      ? deepMerge(base[k], over[k]) : over[k];
  }
  return out;
}
export const firstName = (n) => String(n || '').trim().split(/\s+/)[0] || '';
export const initials = (n) => String(n || '?').trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase()).join('');

export const httpError = (message, status = 400) => Object.assign(new Error(message), { status });
