// Demo workspace. History is produced by running the REAL engine against a simulated
// Google Sheet on a backdated clock — so notifications, emails, change history and
// assignment history are genuine output, not hand-written fixtures.
import { fileURLToPath } from 'node:url';
import { all, get, run, insert, update, exec, openDb } from './db.js';
import { getSettings, saveSettings, resetSettingsCache, setKV, DEFAULTS } from './settings.js';
import { clock, localDate, nowIso } from './clock.js';
import { addDays, addMonths, monthLabel, MONTH_NAMES, clone } from './util.js';
import * as S from './integrations/sheetSource.js';
import { runSync } from './engine/sync.js';
import * as P from './services/projects.js';
import { runReminders } from './services/reminders.js';
import { log } from './services/notify.js';

const TABLES = ['assignments', 'changes', 'activity', 'notifications', 'emails', 'sync_runs', 'comments', 'months', 'reminders', 'demo_sheet', 'demo_tabs', 'projects', 'team_members'];
const COLORS = ['#7aa2ff', '#3dd6c6', '#f08fc0', '#ffb454', '#9b8cff', '#58d68d'];
const tabName = (key) => { const [y, m] = key.split('-').map(Number); return `${MONTH_NAMES[m - 1].slice(0, 3)} ${y}`; };
const at = (daysAgo, h, mi = 0) => { const d = new Date(); d.setDate(d.getDate() - daysAgo); d.setHours(h, mi, 0, 0); return d; };

const TEAM = [
  { name: 'Aarav Mehta', email: 'aarav.mehta.demo@gmail.com', role: 'Senior AI Video Editor', prefs: { preferred_types: ['Performance Ad', 'Product Video'] } },
  { name: 'Diya Nair', email: 'diya.nair.demo@gmail.com', role: 'AI Video Editor · Social & UGC', prefs: { preferred_types: ['UGC-Style Ad', 'Social Reel'] } },
  { name: 'Rohan Kapoor', email: 'rohan.kapoor.demo@gmail.com', role: 'Motion & VFX Artist', prefs: { preferred_types: ['Motion Graphics', 'Explainer'] } },
  { name: 'Ishita Rao', email: 'ishita.rao.demo@gmail.com', role: 'Brand Film Editor', prefs: { preferred_types: ['Brand Film', 'Product Video'], preferred_brands: ['Cult Apparel'] } },
  { name: 'Kabir Sethi', email: 'kabir.sethi.demo@gmail.com', role: 'AI Video Editor', prefs: { preferred_types: ['AI Video Production'] } },
];

const L = (...n) => n.map((x) => `https://drive.google.com/drive/folders/${x}`).join(' ');
const YT = (x) => `https://www.youtube.com/watch?v=${x}`;
// [name, brand, type, brief, durationSec, deadlineOffsetDays, priority, links, product, assignedTo]
const OCT = [
  ['Cult Gear Earbuds Launch Teaser', 'Cult Gear', 'Product Video', 'Hero teaser for the new wireless earbuds: macro on the case opening, sweat-proof run sequence, end on price card. Punchy, bass-driven edit.', 20, -24, 'High', L('earbuds-moodboard'), 'Cult Gear Pulse Earbuds'],
  ['Cultpass Diwali Offer Film', 'Cultpass', 'Brand Film', 'Warm festive film — families training together before the festival lights come on. Offer card at the end: 3 months free on annual passes.', 45, -22, 'High', L('diwali-ref', 'diwali-vo') + ' ' + YT('diwali-ref-01'), 'Cultpass Annual'],
  ['Cult Sports Bra Range Reel', 'Cult Apparel', 'Social Reel', 'Three-colourway reel showing support level in motion: jump squats, burpees, yoga flow. Fabric macro insert on the back strap.', 18, -20, 'Medium', L('sportsbra-ref'), 'Cult Move Sports Bra'],
  ['Cult Treadmill TM-200 Hero Spot', 'Cult Treadmills', 'Performance Ad', 'Fast-cut hero for the TM-200: belt macro, incline change, heart-rate overlay window. 9:16 and 16:9 deliverables.', 30, -18, 'High', L('tm200-hero') + ' ' + YT('tm200-ref'), 'Cult TM-200 Treadmill'],
  ['Mind.fit Sleep Series Explainer', 'Mind.fit', 'Explainer', 'Three-part animated explainer on the 10-minute wind-down routine. Soft palette, calm VO, subtitles in English + Hindi.', 60, -9, 'Low', L('sleep-script'), 'Mind.fit Sleep'],
  ['Cult Kids Fitness Challenge UGC', 'Cult Kids', 'UGC-Style Ad', 'Parent-POV style clips of the 7-day kids challenge. Handheld energy, captions burned in, upbeat music.', 25, -17, 'Medium', L('kids-challenge'), 'Cult Kids Programme'],
  ['Cult Yoga Mat Product Spin', 'Cult Gear', 'Product Video', '360° product spin with grip close-up and rolled-up carry shot. Clean white cyclorama look, subtle shadow.', 15, -15, 'Low', L('yogamat-ref'), 'Cult Grip Yoga Mat 6mm'],
  ['Cult Protein Bar Taste Film', 'Cult Nutrition', 'AI Video Production', 'Texture-forward taste film — snap, melt, cocoa dust. Slow-motion hero with macro bite sequence.', 20, -14, 'Medium', L('bar-taste-ref') + ' ' + YT('choc-macro'), 'Cult Protein Bar (Choco Crunch)'],
  ['Cult Running Shoes Barefoot Reveal', 'Cult Footwear', 'Performance Ad', 'Reveal the flex sole with a ground-level tracking run. Speed ramps on foot strike, ending on the shoe turntable.', 30, -12, 'High', L('barefoot-ref'), 'Cult Barefoot Runner'],
  ['Cultpass Corporate Wellness Explainer', 'Cultpass', 'Explainer', 'Explain team plans for companies: onboarding, usage dashboard, savings. Motion graphics, flat colour style.', 75, -10, 'Medium', L('corp-wellness-deck'), 'Cultpass for Teams'],
  ['Cult Cycle Studio Class Promo', 'Cult Centres', 'Social Reel', 'Class-night energy: lights down, beat drop, riders in sync. Quick-cut promo with booking CTA.', 15, -8, 'Medium', L('cycle-promo'), 'Cult Cycle Class'],
  ['Cult Tees Everyday Range Motion Titles', 'Cult Apparel', 'Motion Graphics', 'Animated colour-swatch titles for the everyday tee range — kinetic type, 8 colourways, loopable.', 12, -6, 'Low', L('tees-titles'), 'Cult Everyday Tee'],
];
const NOV = [
  ['Cult Winterwear Campaign', 'Cult Apparel', 'AI Video Production', 'Hero film for the winterwear drop: cinematic city-dawn runs, fabric macro on thermals, ends on the Cult Winter lockup. Version 1 — storyboard shared in the folder.', 30, 8, 'High', L('winter-storyboard') + ' ' + YT('winter-ref'), 'Cult Winter Jacket / Thermals'],
  ['Cultpass Black Friday Offer Film', 'Cultpass', 'Performance Ad', 'Black Friday: flat 40% off annual Cultpass. Countdown energy, 6s bumper plus 20s main. Offer ends midnight.', 20, 0, 'High', L('bf-offer-ref'), 'Cultpass Annual'],
  ['Cult Treadmill TM-300 Hero Ad', 'Cult Treadmills', 'Performance Ad', 'TM-300 with auto-incline: showcase the deck cushioning, quiet motor, foldaway shot. Fast cuts, metric overlays.', 30, 3, 'Medium', L('tm300-hero') + ' ' + YT('tm300-ref'), 'Cult TM-300 Treadmill'],
  ['Cult Foldable Walking Pad Explainer', 'Cult Treadmills', 'Explainer', 'Show how the walking pad folds in 3 steps and slides under a sofa. Home-setting live action with graphic callouts.', 40, 9, 'Medium', L('walkingpad-ref'), 'Cult Walking Pad WP-1'],
  ['Cult Hoodies Winter Drop Reel', 'Cult Apparel', 'Social Reel', 'Four-hoodie drop reel: street walks, hood-up reveal, zip detail close-ups. Trend audio, text-on-screen hooks.', 18, 2, 'High', L('hoodie-drop'), 'Cult Fleece Hoodie'],
  ['Cult Smartwatch Features Explainer', 'Cult Gear', '', 'Walk through the 5 top features: HR, sleep, GPS, workouts, battery. Clean UI screen-recordings mixed with lifestyle B-roll.', 45, 14, 'Medium', L('watch-features'), 'Cult Watch S1'],
  ['Cult Dumbbell Set Performance Spot', 'Cult Gear', 'Performance Ad', 'Adjustable dumbbell set: switching weights in 3 seconds is the hero. Gym-floor drama, bass hits on each plate change.', 25, 6, 'Medium', L('dumbbell-ref'), 'Cult Adjustable Dumbbell 24kg'],
  ['New Year Resolution — Cultpass Annual', 'Cultpass', 'Brand Film', 'Emotional resolution film — "this year is different". Before/after montage over 12 months, ending with a full-year pass offer.', 60, 18, 'High', L('resolution-script') + ' ' + YT('nye-emotional'), 'Cultpass Annual'],
  ['Cult Tights Fabric Macro Series', 'Cult Apparel', 'Product Video', 'Series of 3 macro shots: stretch recovery, squat-proof opacity test, flatlock seams. Slow, tactile, no VO.', 15, 5, 'Medium', L('tights-macro'), 'Cult Move Tights'],
  ['Mind.fit Meditation Brand Film', 'Mind.fit', 'Brand Film', 'Quiet brand film on 5-minute mindfulness breaks at work. Soft natural light, minimal dialogue.', 60, 21, 'Low', L('mindfit-brand'), 'Mind.fit App'],
  ['Cult Kids Winter Camp UGC', 'Cult Kids', 'UGC-Style Ad', 'UGC clips of kids at the winter camp — parent testimonials, activity snippets, enrolment CTA.', 25, 8, 'Medium', L('winter-camp'), 'Cult Kids Winter Camp'],
  ['Cult Home Gym Bundle Launch', 'Cult Gear', 'AI Video Production', 'Bundle reveal: bench, dumbbells, bands, mat in a compact apartment. Time-lapse setup then workout montage.', 35, 12, 'High', L('homegym-ref') + ' ' + YT('homegym-timelapse'), 'Cult Home Gym Bundle'],
  ['Cult Yoga Studio Class Teasers', 'Cult Centres', 'Social Reel', 'Three 12s teasers for the new yoga flow classes — morning light, breath-synced cuts, booking CTA.', 12, 7, 'Low', '', 'Cult Yoga Class'],
  ['Cult Thermal Innerwear Range', 'Cult Apparel', 'Product Video', 'Thermal range product film — warmth test on a frosted window, layering demo, close on fabric tag.', 22, -2, 'Medium', L('thermal-ref'), 'Cult Thermal Innerwear'],
  ['Cult Protein Shake Recipe Reels', 'Cult Nutrition', 'UGC-Style Ad', 'Five quick recipe reels: banana-oat, mocha, peanut-butter, mango, choco-mint. Overhead kitchen shots, trending audio.', 20, 4, 'Medium', L('shake-recipes'), 'Cult Whey Protein'],
  ['Cult Football Boots Launch', 'Cult Footwear', 'Performance Ad', 'Boots launch: stud macro, curve-shot slow-mo, night-match grade. Needs sound design for the strike.', 30, -3, 'High', L('boots-ref') + ' ' + YT('boots-strike'), 'Cult Striker FG Boots'],
  ['Cultpass Gift Card Festive Film', 'Cultpass', 'Brand Film', 'TBD — will share direction once the festive theme is final', 30, null, 'High', '', 'Cultpass Gift Card'],
  ['Cult Gear Resistance Bands Demo', 'Cult Gear', 'AI Video Production', 'Demo the 4 resistance levels with a 6-move circuit. Colour-coded overlays per band, upbeat track.', 25, 10, 'Medium', L('bands-demo'), 'Cult Resistance Bands Set', 'Diya Nair'],
];
const NOV_LATE = [
  ['Cult Weekend Warriors UGC Challenge', 'Cultpass', 'UGC-Style Ad', 'Community challenge: 3 workouts in a weekend. UGC montage of members posting progress, hashtag end card.', 25, 13, 'Medium', L('warriors-ref'), 'Cultpass Community'],
  ['Cult Compression Wear Launch', 'Cult Apparel', 'Performance Ad', 'Compression range launch — recovery claims shown through athlete sequences. Fabric tech overlays and spec callouts.', 30, 9, 'High', L('compression-ref'), 'Cult Compression Range'],
  ['Cult Gear Massage Gun Demo', 'Cult Gear', 'Product Video', 'Massage gun demo: attachments, speed levels, quiet-motor sound test. Soft-light studio look.', 28, 16, 'Medium', L('massagegun-ref'), 'Cult Pulse Massage Gun'],
  ['Cult Studio Instructor Spotlight Series', 'Cult Centres', 'Social Reel', 'Six 15s spotlights on studio instructors — personality-led, behind-the-scenes cuts, music-synced captions.', 15, 20, 'Low', L('instructors-ref'), 'Cult Centres'],
  ['Cult Treadmill Maintenance Tips Explainer', 'Cult Treadmills', 'Explainer', 'Simple maintenance tips: belt lubrication, cleaning, tension. Animated overlays, friendly VO.', 50, 23, 'Low', '', 'Cult Treadmills'],
];
const DEC = [
  ['Cult New Year Sale Teaser Pack', 'Cult Apparel', 'Social Reel', 'Pack of 5 teasers counting down to the New Year sale. Bold type, glitch transitions, offer reveal on the last frame.', 15, 17, 'High', L('nysale-teasers'), 'Cult Apparel Sale'],
  ['Cult Resolution Challenge UGC Series', 'Cultpass', 'UGC-Style Ad', 'Series of creator-style clips committing to a 30-day resolution. Selfie-cam intros, progress counters, join CTA.', 25, 19, 'High', L('resolution-ugc') + ' ' + YT('resolution-ugc-ref'), 'Cultpass 30-Day Challenge', 'Diya Nair'],
  ['Cult Treadmill New Year Offer Spot', 'Cult Treadmills', 'Performance Ad', 'New Year treadmill offer — EMI-led hook, hero shots of TM-300, price card and urgency end frame. 9:16 + 1:1.', 30, 16, 'Urgent', L('tm-ny-offer') + ' ' + YT('tm-offer-ref'), 'Cult TM-300 Treadmill'],
  ['Cult Gear Smart Scale Product Film', 'Cult Gear', 'Product Video', 'Smart scale feature film: app sync, body-composition screens, minimalist bathroom set. Clean, premium product look.', 22, 24, 'Medium', L('scale-ref'), 'Cult Smart Scale'],
  ['Cult Ski & Snow Collection Lookbook', 'Cult Apparel', 'Brand Film', 'Winter-sports lookbook: snow-set, slow dolly shots, textures of shell and fleece. Moody grade, ambient score.', 50, 28, 'Medium', L('snow-lookbook') + ' ' + YT('snow-mood'), 'Cult Snow Collection'],
  ['Mind.fit Stress Reset Explainer', 'Mind.fit', 'Explainer', 'Explainer for the 3-minute stress-reset sessions: when to use them, how they work. Soft gradients and calm pacing.', 60, 22, 'Medium', L('stress-reset-script'), 'Mind.fit App'],
  ['Cult Centres Winter Fitness Camp Promo', 'Cult Centres', 'Social Reel', 'Promo for the winter fitness camp — cold-morning workouts, community shots, early-bird CTA.', 18, 26, 'Low', L('wintercamp-promo'), 'Cult Winter Camp'],
  ['Cult Kids Holiday Camp UGC', 'Cult Kids', 'UGC-Style Ad', 'Holiday-camp UGC from parents: drop-off, activity highlights, kid reactions. Natural handheld, warm grade.', 25, 25, 'Medium', L('holiday-camp'), 'Cult Kids Holiday Camp'],
  ['Cult Cycle 100-Ride Milestone Film', 'Cult Centres', 'Brand Film', 'Milestone film celebrating riders hitting 100 classes. Real member stories with a big finale in the studio.', 60, 30, 'Low', L('100ride-stories'), 'Cult Cycle', 'Ishita Rao'],
  ['Cult Nutrition Whey Launch', 'Cult Nutrition', 'Product Video', 'Whey protein launch film — tub reveal, scoop macro, shaker mix in slow motion. Label legibility critical.', 25, 18, 'High', L('whey-ref') + ' ' + YT('whey-pour'), 'Cult Whey Isolate'],
  ['Cult Warm-Up Gear Motion Titles', 'Cult Apparel', 'Motion Graphics', 'Animated title cards and lower-thirds for the warm-up gear series — kinetic type, brand yellow accents.', 12, 21, 'Medium', L('warmup-titles'), 'Cult Warm-Up Range'],
  ['Cultpass Annual Plan Explainer', 'Cultpass', 'Explainer', 'Explain annual plan benefits and compare with monthly: pricing, perks, pause policy. Motion-graphics heavy.', 55, null, 'High', L('annual-plan-deck'), 'Cultpass Annual'],
  ['Cult Footwear Winter Run Ad', 'Cult Footwear', 'Performance Ad', '', 28, 27, 'Medium', L('winter-run'), 'Cult Winter Runner'],
  ['Cult Home Workout Starter Kit', 'Cult Gear', '', 'Starter kit film for beginners: mat, bands, dumbbells, 10-minute routine with on-screen guidance.', 35, 29, 'Medium', L('starter-kit-ref'), 'Cult Starter Kit', 'Neha Joshi'],
];
const DEC_EXTRA = [
  ['Cult Valentine\'s Couples Workout Film', 'Cultpass', 'Brand Film', 'Couples training together — playful, warm, partner workouts. Offer: 2-for-1 passes.', 40, 34, 'Medium', L('valentine-ref'), 'Cultpass Duo Pass'],
  ['Cult Gear Skipping Rope Reel', 'Cult Gear', 'Social Reel', 'Fast skipping-rope tricks reel with slow-motion rope macro. Beat-synced cuts and CTA.', 15, 31, 'Low', L('rope-ref'), 'Cult Speed Rope'],
  ['Cult Hydration Bottle Product Film', 'Cult Gear', 'Product Video', 'Insulated bottle: ice test, leak-proof shake, gym-bag shot. Condensation macros with pour hero.', 20, 33, 'Medium', L('bottle-ref'), 'Cult Insulated Bottle'],
];
const H = S.DEMO_HEADERS;
const toRow = (monthKey, r) => {
  const [name, brand, type, brief, dur, off, prio, links, product, assigned] = r;
  const t = localDate(new Date());
  return { Month: monthLabel(monthKey), 'Project Name': name, 'Brand / Campaign': brand, 'Project Type': type, Brief: brief, 'Duration (sec)': String(dur), 'Delivery Date': off == null ? '' : addDays(t, off), Priority: prio, Status: '', 'Assigned To': assigned || '', 'Reference Links': links, 'Product Info': product, Notes: '' };
};
void H;

export function wipe() {
  for (const t of TABLES) run(`DELETE FROM ${t}`);
  run(`DELETE FROM sqlite_sequence`);
  run(`DELETE FROM settings WHERE key IN ('last_snapshot_hash','last_sync_at','dupes_seen')`);
  run(`DELETE FROM sessions WHERE 1=0`);
}

function ensureOwner() {
  const w = getSettings().workspace;
  insert('team_members', { name: w.owner_name, email: w.owner_email, role: 'Project Manager', enabled: 0, availability: 'available', prefs: '{}', is_owner: 1, color: '#ffb454', created_at: nowIso() });
}

export async function resetWorkspace({ demo = true } = {}) {
  clock.reset();
  const keepIntegrations = getSettings().integrations;
  wipe();
  run(`DELETE FROM settings WHERE key='app'`);
  resetSettingsCache();
  saveSettings({ integrations: demo ? { ...clone(DEFAULTS.integrations) } : keepIntegrations, email: demo ? { mode: 'demo' } : {} });
  if (demo) await seedDemo(); else ensureOwner();
}

const ago = (d, h, m) => at(d, h, m);
export async function seedDemo() {
  const t = localDate(new Date());
  const curKey = t.slice(0, 7), prevKey = addMonths(curKey, -1), nextKey = addMonths(curKey, 1);
  saveSettings({ monitor: { autosync_on_sheet_edit: true } });
  ensureOwner();
  TEAM.forEach((m, i) => insert('team_members', { name: m.name, email: m.email, role: m.role, enabled: 1, availability: 'available', prefs: JSON.stringify(m.prefs), is_owner: 0, color: COLORS[i], created_at: ago(40, 9, 0).toISOString() }));
  const byName = (n) => get('SELECT id FROM team_members WHERE name=?', n).id;
  const pid = (name) => get('SELECT id FROM projects WHERE name=?', name)?.id;
  const sheetRow = (tab, name) => all('SELECT * FROM demo_sheet WHERE tab=?', tab).find((r) => JSON.parse(r.data)['Project Name'] === name)?.row_number;
  const edit = (tab, name, header, value) => S.demoSetCell(tab, sheetRow(tab, name), header, value);
  const prevTab = tabName(prevKey), curTab = tabName(curKey);

  // 1) previous month's briefs arrive ---------------------------------------------------------
  clock.set(ago(38, 10, 15));
  for (const r of OCT) S.demoAddRow(prevTab, toRow(prevKey, r));
  await runSync({ trigger: 'schedule' });
  // work progresses (quietly), finishing around each deadline
  for (const r of OCT) { clock.set(ago(34, 11, 0)); await P.setStatus(pid(r[0]), 'In Progress', { actor: 'teammate', quiet: true }); }
  const done = OCT.filter((r) => !['Mind.fit Sleep Series Explainer', 'Cult Tees Everyday Range Motion Titles'].includes(r[0]));
  for (const r of done) { clock.set(addDays(t, r[5] - 1) + 'T14:20:00'); await P.setStatus(pid(r[0]), 'Review', { actor: 'teammate', quiet: true }); clock.set(addDays(t, r[5]) + 'T11:10:00'); await P.setStatus(pid(r[0]), 'Completed', { actor: 'you', quiet: true }); }
  clock.set(ago(9, 16, 0)); await P.setStatus(pid('Mind.fit Sleep Series Explainer'), 'Review', { actor: 'teammate', quiet: true });

  // 2) this month's briefs ---------------------------------------------------------------------
  clock.set(ago(12, 9, 40));
  for (const r of NOV) S.demoAddRow(curTab, toRow(curKey, r));
  await runSync({ trigger: 'schedule' });
  const novStatus = {
    'Cult Winterwear Campaign': 'In Progress', 'Cultpass Black Friday Offer Film': 'In Progress', 'Cult Treadmill TM-300 Hero Ad': 'Review', 'Cult Hoodies Winter Drop Reel': 'In Progress',
    'Cult Tights Fabric Macro Series': 'Completed', 'Cult Kids Winter Camp UGC': 'Completed', 'Cult Thermal Innerwear Range': 'Review', 'Cult Football Boots Launch': 'Changes Required',
    'Cult Protein Shake Recipe Reels': 'In Progress', 'Cult Gear Resistance Bands Demo': 'In Progress', 'Mind.fit Meditation Brand Film': 'On Hold', 'Cult Dumbbell Set Performance Spot': 'In Progress',
  };
  let k = 0;
  for (const [name, st] of Object.entries(novStatus)) {
    const days = 11 - (k++ % 6);
    clock.set(ago(days, 10 + (k % 5), 20)); if (['Review', 'Completed', 'Changes Required'].includes(st)) await P.setStatus(pid(name), 'In Progress', { actor: 'teammate', quiet: true });
    clock.set(ago(Math.max(days - 3, 2), 14, 5 + k)); await P.setStatus(pid(name), st, { actor: k % 3 ? 'teammate' : 'you', quiet: true });
  }

  // 3) PM takes control ------------------------------------------------------------------------
  clock.set(ago(8, 10, 5));
  await P.assignProject(pid('Cult Home Gym Bundle Launch'), byName('Ishita Rao'), { mode: 'manual', actor: 'you', reason: 'Brand-film experience — moving to Ishita' });
  clock.set(ago(5, 15, 30));
  await P.assignProject(pid('New Year Resolution — Cultpass Annual'), get('SELECT id FROM team_members WHERE is_owner=1').id, { mode: 'self', actor: 'you', reason: 'I will edit this one personally' });
  clock.set(ago(4, 12, 10));
  await P.assignProject(pid('Cultpass Gift Card Festive Film'), null, { mode: 'locked', actor: 'you', reason: 'Waiting on final festive theme — hold from automation' });
  await P.setStatus(pid('Cultpass Gift Card Festive Film'), 'On Hold', { actor: 'you', quiet: true });
  await P.setStatus(pid('Cultpass Gift Card Festive Film'), 'Pending Assignment', { actor: 'you', quiet: true });

  // 4) mid-month additions are detected --------------------------------------------------------
  clock.set(ago(4, 17, 25));
  for (const r of NOV_LATE) S.demoAddRow(curTab, toRow(curKey, r));
  await runSync({ trigger: 'schedule' });

  // 5) the sheet keeps changing — change detection builds the audit trail ----------------------
  clock.set(ago(9, 11, 5));
  edit(curTab, 'Cult Treadmill TM-300 Hero Ad', 'Priority', 'High');
  edit(curTab, 'Cult Dumbbell Set Performance Spot', 'Duration (sec)', '45');
  await runSync({ trigger: 'schedule' });
  clock.set(ago(6, 14, 40));
  edit(curTab, 'Cult Hoodies Winter Drop Reel', 'Reference Links', L('hoodie-drop') + ' ' + L('hoodie-streetwear-refs'));
  edit(curTab, 'Cult Thermal Innerwear Range', 'Delivery Date', addDays(t, -2));
  edit(curTab, 'Cult Thermal Innerwear Range', 'Notes', 'Client wants the warmth test re-shot');
  await runSync({ trigger: 'schedule' });
  clock.set(ago(3, 10, 15));
  edit(curTab, 'Cultpass Black Friday Offer Film', 'Brief', 'Black Friday: flat 40% off annual Cultpass. Countdown energy, 6s bumper plus 20s main. Offer ends midnight. v2: add a 15s cutdown for Stories.');
  edit(curTab, 'Cultpass Black Friday Offer Film', 'Priority', 'Urgent');
  await runSync({ trigger: 'schedule' });
  clock.set(ago(2, 16, 50));
  edit(curTab, 'New Year Resolution — Cultpass Annual', 'Assigned To', 'Aarav Mehta'); // PM locked this one: must be ignored
  edit(curTab, 'Cult Smartwatch Features Explainer', 'Project Type', 'Explainer');
  await runSync({ trigger: 'schedule' });
  clock.set(ago(1, 17, 20));
  edit(curTab, 'Cult Winterwear Campaign', 'Delivery Date', addDays(t, 11));
  edit(curTab, 'Cult Winterwear Campaign', 'Brief', NOV[0][3].replace('Version 1', 'Version 2') + ' Added: hero pack-shot on closing frame.');
  edit(curTab, 'Cult Winterwear Campaign', 'Product Info', 'Cult Winter Jacket / Thermals / Beanie');
  await runSync({ trigger: 'schedule' });
  // the original winterwear deadline in the sheet was +8 days: reflect it in history
  const w = pid('Cult Winterwear Campaign');
  run(`UPDATE changes SET old_value=? WHERE project_id=? AND field='deadline'`, 'December ' + Number(addDays(t, 8).slice(8)) + ', ' + addDays(t, 8).slice(0, 4), w);

  // 6) a couple of comments ---------------------------------------------------------------------
  const cm = (d, h, m, name, author, body) => { clock.set(ago(d, h, m)); insert('comments', { project_id: pid(name), author, body, created_at: nowIso() }); log('comment', body, { actor: author, projectId: pid(name) }); };
  cm(7, 13, 10, 'Cult Treadmill TM-300 Hero Ad', 'Aarav Mehta', 'First cut is ready for review — kept the incline hero at 0:12. Metric overlays are placeholder until finals arrive.');
  cm(6, 18, 40, 'Cult Treadmill TM-300 Hero Ad', 'Production Lead', 'Looks sharp. Tighten the intro by 2s and swap the end card to the TM-300 price lockup.');
  cm(5, 11, 25, 'Cult Football Boots Launch', 'Production Lead', 'Client feedback: strike sound needs more punch, and grade the night match cooler.');
  cm(3, 15, 0, 'Cultpass Black Friday Offer Film', 'Rohan Kapoor', 'Main 20s locked. Working on the 6s bumper and the new 15s Stories cutdown now.');

  // 7) today: Kabir is out, monitor is live, reminders fire ----------------------------------------
  clock.reset();
  update('team_members', byName('Kabir Sethi'), { leave_until: addDays(t, 6) });
  clock.set(new Date(Date.now() - 3 * 60000));
  await runSync({ trigger: 'schedule' });
  clock.reset();
  await runReminders();
  // anything older than a day has been "seen"
  run(`UPDATE notifications SET read=1 WHERE created_at < ?`, new Date(Date.now() - 30 * 3600000).toISOString());
  void nextKey;
}

/** Demo button: "A new month's briefs land in the sheet". */
export function addNextMonthBatch() {
  const t = localDate(new Date());
  const nextKey = addMonths(t.slice(0, 7), 1);
  const tab = tabName(nextKey);
  const existing = all('SELECT row_number FROM demo_sheet WHERE tab=?', tab).length;
  let rows;
  if (!existing) rows = DEC; else {
    const have = new Set(all('SELECT data FROM demo_sheet WHERE tab=?', tab).map((r) => JSON.parse(r.data)['Project Name']));
    rows = DEC_EXTRA.filter((r) => !have.has(r[0])).slice(0, 3);
  }
  rows.forEach((r) => S.demoAddRow(tab, toRow(nextKey, r)));
  return { tab, month: monthLabel(nextKey), added: rows.length };
}

// CLI: node server/seed.js --reset
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  openDb();
  await resetWorkspace({ demo: true });
  console.log('Demo workspace seeded:', get('SELECT COUNT(*) n FROM projects').n, 'projects');
}
void exec;
