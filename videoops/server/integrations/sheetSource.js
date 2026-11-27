// A "sheet source" returns a snapshot of the brief spreadsheet. Two providers:
//  - demo:   a simulated sheet kept in SQLite (editable from Integrations → Sheet Simulator)
//  - google: the real spreadsheet through the Sheets API
import { all, get, run, tx } from '../db.js';
import { getSettings } from '../settings.js';
import { jparse } from '../util.js';
import { getKV, setKV } from '../settings.js';
import { fetchSheetSnapshot } from './google.js';

export const DEMO_SPREADSHEET_ID = 'demo-cult-video-briefs';
export const DEMO_HEADERS = ['Month', 'Project Name', 'Brand / Campaign', 'Project Type', 'Brief', 'Duration (sec)', 'Delivery Date', 'Priority', 'Status', 'Assigned To', 'Reference Links', 'Product Info', 'Notes'];

/** Column headers of the simulated sheet (set by the seed from a real sheet's header row; generic default otherwise). */
export const demoHeaders = () => getKV('demo_headers') || DEMO_HEADERS;
export const setDemoHeaders = (h) => setKV('demo_headers', h);
export const demoTitle = () => getKV('demo_title') || 'Cult — Monthly Video Briefs (Demo Sheet)';

export function demoSnapshot() {
  const tabs = all('SELECT * FROM demo_tabs ORDER BY position');
  const headers = demoHeaders();
  return {
    title: demoTitle(), spreadsheetId: DEMO_SPREADSHEET_ID,
    tabs: tabs.map((t) => ({
      name: t.name, gid: t.gid, headers,
      rows: all('SELECT * FROM demo_sheet WHERE tab=? ORDER BY row_number', t.name).map((r) => ({ rowNumber: r.row_number, values: { ...Object.fromEntries(headers.map((h) => [h, ''])), ...jparse(r.data, {}) } })),
    })),
  };
}

export async function fetchSnapshot() {
  const s = getSettings().integrations;
  if (s.sheet_mode === 'google') {
    if (!s.spreadsheet_id) throw new Error('No Google Sheet connected. Add the spreadsheet URL in Integrations.');
    return fetchSheetSnapshot(s.spreadsheet_id);
  }
  return demoSnapshot();
}

export function sheetLink(project) {
  const s = getSettings().integrations;
  if (s.sheet_mode === 'google' && s.spreadsheet_id) {
    const range = project.sheet_row ? `&range=A${project.sheet_row}` : '';
    return `https://docs.google.com/spreadsheets/d/${s.spreadsheet_id}/edit#gid=${project.sheet_gid || 0}${range}`;
  }
  return `${process.env.APP_URL || 'http://localhost:3000'}/#/sheet?tab=${encodeURIComponent(project.sheet_tab || '')}&row=${project.sheet_row || ''}`;
}

// ---- demo-sheet editing helpers (used by the simulator UI) ----------------------------------
export function ensureDemoTab(name, gid) {
  if (get('SELECT 1 x FROM demo_tabs WHERE name=?', name)) return;
  const pos = (get('SELECT MAX(position) p FROM demo_tabs')?.p ?? -1) + 1;
  run('INSERT INTO demo_tabs(name,gid,position) VALUES(?,?,?)', name, gid || String(1000 + pos), pos);
}
/** Put a row at an explicit row number (used to replay a real sheet exactly). */
export function demoPutRow(tab, row, data) {
  ensureDemoTab(tab);
  run('INSERT OR REPLACE INTO demo_sheet(tab,row_number,data) VALUES(?,?,?)', tab, row, JSON.stringify(data));
}
export function demoAddRow(tab, data) {
  ensureDemoTab(tab);
  const next = Math.max((get('SELECT MAX(row_number) n FROM demo_sheet WHERE tab=?', tab)?.n ?? 1), 1) + 1;
  run('INSERT INTO demo_sheet(tab,row_number,data) VALUES(?,?,?)', tab, next, JSON.stringify(data));
  return next;
}
export function demoSetCell(tab, row, header, value) {
  const r = get('SELECT data FROM demo_sheet WHERE tab=? AND row_number=?', tab, row);
  if (!r) throw new Error('Row not found');
  const d = jparse(r.data, {});
  d[header] = value;
  run('UPDATE demo_sheet SET data=? WHERE tab=? AND row_number=?', JSON.stringify(d), tab, row);
}
export function demoDeleteRow(tab, row) { run('DELETE FROM demo_sheet WHERE tab=? AND row_number=?', tab, row); }
export function demoClear() { tx(() => { run('DELETE FROM demo_sheet'); run('DELETE FROM demo_tabs'); }); }
