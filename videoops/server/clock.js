// Injectable clock. Production uses the real time; the seeder and tests can pin it
// so backdated history looks real.
let fixed = null;
export const clock = {
  now: () => (fixed ? new Date(fixed) : new Date()),
  set: (d) => { fixed = new Date(d).getTime(); },
  reset: () => { fixed = null; },
};
export const nowIso = () => clock.now().toISOString();
export function localDate(d = clock.now()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
export const today = () => localDate(clock.now());
