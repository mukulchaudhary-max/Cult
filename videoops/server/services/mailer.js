// All outgoing mail goes through here and is recorded in the `emails` table.
// demo mode  -> recorded as "simulated" (viewable in Notifications → Email Outbox)
// gmail mode -> sent through the Gmail API with the connected account.
import { insert, update } from '../db.js';
import { getSettings, getKV } from '../settings.js';
import { nowIso } from '../clock.js';
import { gmailSend, loadTokens } from '../integrations/google.js';

export async function sendEmail({ to, toName, subject, html, text, kind, projectId = null }) {
  const s = getSettings();
  if (!to) return { ok: false, error: 'No recipient address' };
  const id = insert('emails', { to_addr: to, to_name: toName || null, subject, html, text, kind, status: 'queued', project_id: projectId, created_at: nowIso() });
  if (s.email.mode !== 'gmail') { update('emails', id, { status: 'simulated' }); return { ok: true, id, simulated: true }; }
  try {
    const from = loadTokens() ? getKV('google_profile')?.email : null;
    if (!from) throw new Error('Gmail is not connected');
    const providerId = await gmailSend({ to, toName, from, fromName: s.email.from_name, subject, html, text });
    update('emails', id, { status: 'sent', provider_id: providerId });
    return { ok: true, id, providerId };
  } catch (e) {
    update('emails', id, { status: 'failed', error: String(e.message || e) });
    return { ok: false, id, error: String(e.message || e) };
  }
}
