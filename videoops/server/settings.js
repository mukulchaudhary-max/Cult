import { get, run } from './db.js';
import { deepMerge, clone, jparse } from './util.js';
import { NOTIFY_TYPES } from './constants.js';

const DEFAULT_ASSIGNMENT_BODY = `Hi {{teammate_name}},

A new video production project has been assigned to you.

Project Details:
- Project Name: {{project_name}}
- Project Type: {{project_type}}
- Deadline: {{deadline}}
- Priority: {{priority}}
- Brief: {{brief}}
- Reference Links: {{reference_links}}
- Google Sheet: {{sheet_link}}

Please review the brief and begin working on the project.
You can access your assigned projects through the Project Management Dashboard: {{dashboard_link}}

Thanks,
{{owner_name}}`;

export const DEFAULTS = {
  workspace: { name: 'Cult Video Ops', owner_name: 'Production Lead', owner_email: 'production.lead@gmail.com' },
  monitor: { enabled: true, interval_min: 5, auto_detect: true, detect_changes: true, autosync_on_sheet_edit: true },
  assign: {
    enabled: true,
    strategy: 'balance_total', // balance_total | equal_batch
    weight_by_priority: false,
    preference_tolerance: 0,
    skip_unavailable: true,
    respect_sheet_assignment: true,
    count_on_hold: false,
    default_max_active: null,
  },
  change_detection: {
    ignore_whitespace: true,
    email_digest_threshold: 5,
    fields: {
      name: true, brand: true, type: true, brief: true, duration: true, deadline: true, priority: true,
      status: true, assignee: true, links: true, product: true, month: true, extra: true,
    },
  },
  email: {
    mode: 'demo', // demo | gmail
    from_name: 'Cult Video Ops',
    notify_assignee: true,
    notify_previous_assignee: true,
    assignment_subject: 'New Video Project Assigned – {{project_name}}',
    assignment_body: DEFAULT_ASSIGNMENT_BODY,
  },
  reminders: { enabled: true, days_before: 2, email_assignee: true, overdue_alerts: true },
  overrides: { sheet_can_override_manual: false, notify_previous_on_manual: true },
  notify: Object.fromEntries(Object.entries(NOTIFY_TYPES).map(([k, v]) => [k, { app: v.app, email: v.email }])),
  integrations: { sheet_mode: 'demo', spreadsheet_id: '', spreadsheet_url: '', sheet_title: '' },
};

let cache = null;
export function getSettings() {
  if (cache) return cache;
  const row = get(`SELECT value FROM settings WHERE key='app'`);
  cache = deepMerge(clone(DEFAULTS), jparse(row?.value, {}));
  return cache;
}
export function saveSettings(patch) {
  const next = deepMerge(getSettings(), patch);
  run(`INSERT INTO settings(key,value) VALUES('app',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value`, JSON.stringify(next));
  cache = next;
  return next;
}
export function resetSettingsCache() { cache = null; }
export function getKV(key, fallback = null) { return jparse(get(`SELECT value FROM settings WHERE key=?`, key)?.value, fallback); }
export function setKV(key, value) {
  run(`INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value`, key, JSON.stringify(value));
}
