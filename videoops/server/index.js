import { openDb, get } from './db.js';
import { createApp } from './app.js';
import { getSettings, getKV } from './settings.js';
import { runSync } from './engine/sync.js';
import { runReminders } from './services/reminders.js';
import { resetWorkspace } from './seed.js';
import { googleConfigured } from './integrations/google.js';

const PORT = +process.env.PORT || 3000;
openDb();
if (!get('SELECT COUNT(*) n FROM team_members').n) {
  console.log('First run — seeding demo workspace…');
  await resetWorkspace({ demo: process.env.SEED_DEMO !== '0' });
}

const app = createApp();
const server = app.listen(PORT, () => {
  console.log(`\n  Cult Video Ops  →  http://localhost:${PORT}`);
  console.log(`  Mode: ${googleConfigured() ? 'Google OAuth enabled' : 'demo (no Google credentials set)'}\n`);
});

// ---- monitoring loop: checks every 15s whether a sheet sync / reminder run is due ----------------
let lastReminder = 0, busy = false;
async function tick() {
  if (busy) return; busy = true;
  try {
    const s = getSettings();
    if (s.monitor.enabled) {
      const last = getKV('last_sync_at');
      const due = !last || Date.now() - new Date(last).getTime() >= s.monitor.interval_min * 60000;
      const configured = s.integrations.sheet_mode === 'demo' || s.integrations.spreadsheet_id;
      if (due && configured) await runSync({ trigger: 'schedule' });
    }
    if (Date.now() - lastReminder > 30 * 60000) { lastReminder = Date.now(); await runReminders(); }
  } catch (e) { console.error('[monitor]', e); } finally { busy = false; }
}
const timer = setInterval(tick, 15000);
tick();
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { clearInterval(timer); server.close(() => process.exit(0)); });
