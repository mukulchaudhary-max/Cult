// Minimal Google client (OAuth2 + Sheets v4 + Gmail v1) over fetch — no SDK dependency.
// Needs GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET / GOOGLE_REDIRECT_URI (see README).
import crypto from 'node:crypto';
import { getKV, setKV } from '../settings.js';

export const SCOPES = [
  'openid', 'email', 'profile',
  'https://www.googleapis.com/auth/spreadsheets.readonly',
  'https://www.googleapis.com/auth/gmail.send',
];
export const googleConfigured = () => !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
export const redirectUri = () => process.env.GOOGLE_REDIRECT_URI || `${process.env.APP_URL || 'http://localhost:3000'}/auth/google/callback`;

// ---- token vault (AES-256-GCM, key derived from SESSION_SECRET) ----------------------------
function key() { return crypto.createHash('sha256').update(process.env.SESSION_SECRET || 'dev-only-secret-change-me').digest(); }
export function seal(obj) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', key(), iv);
  const enc = Buffer.concat([c.update(JSON.stringify(obj), 'utf8'), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), enc]).toString('base64');
}
export function unseal(s) {
  const b = Buffer.from(s, 'base64');
  const d = crypto.createDecipheriv('aes-256-gcm', key(), b.subarray(0, 12));
  d.setAuthTag(b.subarray(12, 28));
  return JSON.parse(Buffer.concat([d.update(b.subarray(28)), d.final()]).toString('utf8'));
}
export const saveTokens = (t) => setKV('google_tokens', { sealed: seal(t) });
export function loadTokens() { const r = getKV('google_tokens'); try { return r ? unseal(r.sealed) : null; } catch { return null; } }
export const clearTokens = () => setKV('google_tokens', null);

// ---- OAuth ---------------------------------------------------------------------------------
export function authUrl(state) {
  const p = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID, redirect_uri: redirectUri(), response_type: 'code',
    scope: SCOPES.join(' '), access_type: 'offline', prompt: 'consent', state, include_granted_scopes: 'true',
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${p}`;
}
async function tokenRequest(body) {
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: process.env.GOOGLE_CLIENT_ID, client_secret: process.env.GOOGLE_CLIENT_SECRET, ...body }),
  });
  const j = await r.json();
  if (!r.ok) throw new Error(`Google token error: ${j.error_description || j.error || r.status}`);
  return j;
}
export async function exchangeCode(code) {
  const j = await tokenRequest({ code, grant_type: 'authorization_code', redirect_uri: redirectUri() });
  const tokens = { access_token: j.access_token, refresh_token: j.refresh_token, expires_at: Date.now() + (j.expires_in - 60) * 1000 };
  const me = await (await fetch('https://openidconnect.googleapis.com/v1/userinfo', { headers: { Authorization: `Bearer ${j.access_token}` } })).json();
  return { tokens, profile: { email: me.email, name: me.name, picture: me.picture } };
}
export async function accessToken() {
  const t = loadTokens();
  if (!t) throw new Error('Google account not connected. Sign in with Google on the Integrations page.');
  if (t.expires_at > Date.now()) return t.access_token;
  if (!t.refresh_token) throw new Error('Google session expired — please reconnect your account.');
  const j = await tokenRequest({ refresh_token: t.refresh_token, grant_type: 'refresh_token' });
  const next = { ...t, access_token: j.access_token, expires_at: Date.now() + (j.expires_in - 60) * 1000 };
  saveTokens(next);
  return next.access_token;
}
async function api(url, opts = {}) {
  const token = await accessToken();
  const r = await fetch(url, { ...opts, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(opts.headers || {}) } });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`Google API ${r.status}: ${j.error?.message || 'request failed'}`);
  return j;
}

// ---- Sheets --------------------------------------------------------------------------------
export function parseSpreadsheetId(input) {
  const s = String(input || '').trim();
  const m = s.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
  if (m) return m[1];
  return /^[a-zA-Z0-9_-]{20,}$/.test(s) ? s : null;
}
/** Pure: one tab of Sheets "grid data" -> {name,gid,headers,rows}. Hidden hyperlinks ("Product URLs" -> https://…) are appended to the cell text. */
export function gridToTab(props, rowData = []) {
  const grid = rowData.map((r) => (r.values || []).map((c) => {
    const text = c?.formattedValue ?? '';
    const urls = new Set();
    if (c?.hyperlink) urls.add(c.hyperlink);
    for (const run of c?.textFormatRuns || []) if (run.format?.link?.uri) urls.add(run.format.link.uri);
    const missing = [...urls].filter((u) => !text.includes(u));
    return missing.length ? [text, ...missing].filter(Boolean).join(' ') : text;
  }));
  // header row = first row with at least 2 non-empty cells
  const hi = grid.findIndex((r) => r.filter((c) => String(c).trim()).length >= 2);
  if (hi < 0) return { name: props.title, gid: String(props.sheetId), headers: [], rows: [] };
  const headers = grid[hi].map((h, j) => String(h || '').trim() || `Column ${j + 1}`);
  // a trailing run of blank header cells (sheet formatted wider than its data) is not a column
  while (headers.length && /^Column \d+$/.test(headers.at(-1))) headers.pop();
  return {
    name: props.title, gid: String(props.sheetId), headers,
    rows: grid.slice(hi + 1).map((r, k) => ({ rowNumber: hi + k + 2, values: Object.fromEntries(headers.map((h, j) => [h, r[j] ?? ''])) })),
  };
}
export async function fetchSheetSnapshot(spreadsheetId) {
  const fields = 'properties.title,sheets(properties(sheetId,title),data(rowData(values(formattedValue,hyperlink,textFormatRuns(format(link(uri)))))))';
  const j = await api(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?includeGridData=true&fields=${encodeURIComponent(fields)}`);
  return { title: j.properties.title, spreadsheetId, tabs: j.sheets.map((s) => gridToTab(s.properties, s.data?.[0]?.rowData || [])) };
}

// ---- Gmail ---------------------------------------------------------------------------------
const b64url = (b) => Buffer.from(b).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const encHeader = (s) => (/^[\x20-\x7e]*$/.test(s) ? s : `=?UTF-8?B?${Buffer.from(s).toString('base64')}?=`);
export function buildMime({ to, toName, from, fromName, subject, html, text }) {
  const boundary = `b_${crypto.randomBytes(8).toString('hex')}`;
  const addr = (e, n) => (n ? `${encHeader(n)} <${e}>` : e);
  return [
    `From: ${addr(from, fromName)}`, `To: ${addr(to, toName)}`, `Subject: ${encHeader(subject)}`, 'MIME-Version: 1.0',
    `Content-Type: multipart/alternative; boundary="${boundary}"`, '',
    `--${boundary}`, 'Content-Type: text/plain; charset="UTF-8"', 'Content-Transfer-Encoding: base64', '', Buffer.from(text).toString('base64'),
    `--${boundary}`, 'Content-Type: text/html; charset="UTF-8"', 'Content-Transfer-Encoding: base64', '', Buffer.from(html).toString('base64'),
    `--${boundary}--`, '',
  ].join('\r\n');
}
export async function gmailSend(msg) {
  const raw = b64url(buildMime(msg));
  const j = await api('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', { method: 'POST', body: JSON.stringify({ raw }) });
  return j.id;
}
