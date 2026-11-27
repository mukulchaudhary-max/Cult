# Architecture

```
┌────────────────────────────── Browser (no build step, ES modules) ──────────────────────────────┐
│  app.js shell + hash router · core.js UI kit · charts.js · pages/*.js        ◄── SSE /api/events │
└───────────────────────────────────────────────┬──────────────────────────────────────────────────┘
                                                │ JSON  (/api/*)
┌───────────────────────────────────────────────▼──────────────────────────────────────────────────┐
│ Express (server/app.js)  auth (Google OAuth, sessions) · REST · SSE · static                      │
│                                                                                                   │
│  engine/               services/                       integrations/                              │
│   mapper.js  parse     projects.js  assign/status      google.js    OAuth · Sheets · Gmail (fetch)│
│   sync.js    pipeline  notify.js    in-app + owner mail sheetSource.js  demo | google provider    │
│   assign.js  PURE      mailer.js    demo | gmail        (+ demo sheet editing for the simulator)  │
│                        emailTemplates.js · reminders.js · stats.js                                │
│                                                                                                   │
│  scheduler (index.js): every 15 s → sync if due · reminders every 30 min                          │
└───────────────────────────────────────────────┬──────────────────────────────────────────────────┘
                                                │ node:sqlite (WAL)
                      projects · team_members · assignments · changes · activity · notifications ·
                      emails · sync_runs · comments · months · reminders · settings · sessions
```

## The sync pipeline (`engine/sync.js`)

1. **Fetch** a snapshot of every tab from the active provider (demo sheet or Google). A content hash of the snapshot short-circuits unchanged sheets.
2. **Parse** (`mapper.js`): header aliases → fields (incl. typo-tolerant `Asset Requierment`, composite brief from Angle/Concept/Messaging/Imagery); **asset filter** (`S/V/C/G` codes with counts; only the configured codes are imported, the rest counted as skipped); Live vs Revised dates; dates (ISO, DD/MM/YYYY, "Dec 8", Sheets serials), durations, priorities, statuses; month from column → tab → deadline; unknown columns kept as extras; **missing-info flags** (no deadline, missing/unclear brief, no links, no type).
3. **Reconcile** — never duplicates:
   - match by explicit `Project ID`, else by fingerprint `month|name`;
   - **rename detection**: an unmatched row at the same tab + row as a project whose old name vanished updates that project;
   - repeated rows in one sheet → first wins, the rest reported as duplicates;
   - rows that disappear are **flagged `removed_from_sheet`**, never deleted, and restore if they return.
4. **Change detection**: new values are diffed against the project's *last-synced sheet snapshot* (not against app values), so edits made inside the app are never clobbered, and only genuine sheet edits are logged. Each change stores field label, previous value, new value, time, source, and whether it was applied (e.g. an `Assigned To` edit on a manually-assigned project is logged as *ignored*).
5. **Announce**: one owner email for new briefs (grouped by month, with flagged items); one email per changed project (digest above a threshold); in-app notifications honour per-event preferences.
6. **Assignment workflow** (always runs, so anything still pending is picked up): sheet-named teammates first, then `planAssignments()` for the rest → assignment emails, history, confirmations; unassignable projects raise `assign_failed`.
7. Everything is written to `sync_runs` + `activity`.

## Assignment (`engine/assign.js`)

Pure function: `(projects, members, loads, options) → {assignments[{reason}], unassigned[], loadsAfter, skippedMembers}`.
Deterministic; urgent/earliest-deadline projects are placed first; ties → preference → lower batch share → least recently assigned → id.
Because it is pure, the **Assignments** page can show a faithful *dry-run* (with the reason for each pick) before anything is applied.

## Data integrity & security

- Stable identity: `external_key` (unique) + `fingerprint`; re-syncing is idempotent (tested).
- Manual override precedence: `locked` / `manual` / `self` assignments are not changed by the sheet unless the setting allows it.
- Google tokens are sealed with AES-256-GCM (key derived from `SESSION_SECRET`); the browser never sees them. Sessions are HttpOnly SameSite=Lax cookies; mutating requests must be JSON (cross-site form posts are rejected); OAuth uses a `state` cookie.
- Least-privilege scopes: `spreadsheets.readonly`, `gmail.send`.
- Errors never break the loop: failed syncs are logged, a notification + email is raised once per distinct error, and the monitor keeps running.

## Demo mode

Provider swap, not a mock: `sheetSource.js` returns the same snapshot shape from a SQLite-backed "demo sheet" (editable in the
simulator) or from Google. `mailer.js` records every email either way; in demo mode it stores them as `simulated`
instead of calling Gmail. The seed script replays five weeks of history through the real engine on a backdated clock.

## Extending

- New sheet column → add aliases in `mapper.js` (or just add the column: extras are tracked automatically).
- New notification type → `constants.js` (`NOTIFY_TYPES`); it appears in preferences automatically.
- Write-back (e.g. push `Assigned To` into the sheet) → add `spreadsheets` scope and an `updateValues` call in `assignProject`.
