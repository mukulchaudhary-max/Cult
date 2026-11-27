import { insert, get } from '../db.js';
import { getSettings } from '../settings.js';
import { nowIso } from '../clock.js';
import { sendEmail } from './mailer.js';
import { bus } from '../bus.js';

export function log(kind, message, { actor = 'system', projectId = null, meta = null } = {}) {
  return insert('activity', { ts: nowIso(), kind, actor, project_id: projectId, message, meta: meta ? JSON.stringify(meta) : null });
}

/** Create an in-app notification (respecting prefs) and optionally email the owner. */
export async function notify(type, { title, body = '', severity = 'info', projectId = null, meta = null, email = null, force = false }) {
  const prefs = getSettings().notify[type] || { app: true, email: false };
  let id = null;
  if (prefs.app || force) id = insert('notifications', { type, severity, title, body, project_id: projectId, meta: meta ? JSON.stringify(meta) : null, read: 0, created_at: nowIso() });
  if (id) bus.emit('event', { type: 'notification', id, ntype: type, title, severity });
  let emailed = false;
  if (email && (prefs.email || force)) {
    const owner = getSettings().workspace;
    const r = await sendEmail({ to: owner.owner_email, toName: owner.owner_name, kind: `owner_${type}`, projectId, ...email });
    emailed = r.ok;
  }
  return { id, emailed };
}

export const unreadCount = () => get('SELECT COUNT(*) n FROM notifications WHERE read=0').n;
