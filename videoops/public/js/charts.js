/* Hand-rolled SVG charts — tiny, themed, accessible. All return DOM nodes. */
import { h } from './core.js';
const NS = 'http://www.w3.org/2000/svg';
export const svg = (tag, attrs = {}, ...kids) => { const e = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v); kids.flat().forEach((c) => c != null && e.append(c)); return e; };
const tipHtml = (label, value, extra) => `<b>${label}</b> <span class="m">${value}${extra ? ' · ' + extra : ''}</span>`; // sanitised by the tooltip renderer in core.js

/** donut({data:[{key,n,color}], size, thickness, center:{value,label}}) */
export function donut({ data, size = 168, thickness = 18, center, onClick }) {
  const total = data.reduce((a, d) => a + d.n, 0) || 1;
  const r = (size - thickness) / 2, c = size / 2, circ = 2 * Math.PI * r, gap = data.filter((d) => d.n > 0).length > 1 ? 3 : 0;
  const root = h('div', { style: { position: 'relative', width: `${size}px`, height: `${size}px`, flex: 'none' } });
  const s = svg('svg', { width: size, height: size, viewBox: `0 0 ${size} ${size}`, role: 'img' });
  s.append(svg('circle', { cx: c, cy: c, r, fill: 'none', stroke: 'var(--surface-3)', 'stroke-width': thickness }));
  let off = 0;
  for (const d of data) {
    if (!d.n) continue;
    const len = (d.n / total) * circ;
    const arc = svg('circle', { cx: c, cy: c, r, fill: 'none', stroke: d.color, 'stroke-width': thickness, 'stroke-dasharray': `${Math.max(len - gap, 0.5)} ${circ}`, 'stroke-dashoffset': -off, transform: `rotate(-90 ${c} ${c})`, 'stroke-linecap': 'butt', style: 'transition:opacity .15s;cursor:' + (onClick ? 'pointer' : 'default') });
    arc.dataset.tip = tipHtml(d.key, d.n, `${Math.round((d.n / total) * 100)}%`);
    arc.addEventListener('mouseenter', () => { for (const o of s.querySelectorAll('circle[data-tip]')) o.style.opacity = o === arc ? 1 : .35; });
    arc.addEventListener('mouseleave', () => { for (const o of s.querySelectorAll('circle[data-tip]')) o.style.opacity = 1; });
    if (onClick) arc.addEventListener('click', () => onClick(d));
    s.append(arc); off += len;
  }
  root.append(s);
  if (center) root.append(h('div', { style: { position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', textAlign: 'center', pointerEvents: 'none' } }, h('div', h('div', { style: { fontSize: `${size / 5.2}px`, fontWeight: 650, letterSpacing: '-.03em', lineHeight: 1 } }, center.value), h('div', { class: 'dim', style: { fontSize: '11.5px', marginTop: '4px' } }, center.label))));
  return root;
}

/** ring({value:0-100,size,color,label}) — progress ring */
export function ring({ value, size = 64, thickness = 7, color = 'var(--accent)', label }) {
  const r = (size - thickness) / 2, c = size / 2, circ = 2 * Math.PI * r;
  const s = svg('svg', { width: size, height: size, viewBox: `0 0 ${size} ${size}` },
    svg('circle', { cx: c, cy: c, r, fill: 'none', stroke: 'var(--surface-3)', 'stroke-width': thickness }),
    svg('circle', { cx: c, cy: c, r, fill: 'none', stroke: color, 'stroke-width': thickness, 'stroke-linecap': 'round', 'stroke-dasharray': `${(Math.min(value, 100) / 100) * circ} ${circ}`, transform: `rotate(-90 ${c} ${c})`, style: 'transition:stroke-dasharray .8s cubic-bezier(.2,.8,.2,1)' }));
  return h('div', { style: { position: 'relative', width: `${size}px`, height: `${size}px`, flex: 'none' } }, s, h('div', { style: { position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', fontWeight: 650, fontSize: `${size / 4}px`, letterSpacing: '-.02em' } }, label ?? `${Math.round(value)}%`));
}

/** columns({data:[{key,label,series:[{n,color,name}]}], height}) — stacked vertical columns */
export function columns({ data, height = 170, onClick }) {
  const max = Math.max(1, ...data.map((d) => d.series.reduce((a, s) => a + s.n, 0)));
  const wrap = h('div', { style: { display: 'flex', alignItems: 'flex-end', gap: '14px', height: `${height}px`, padding: '4px 4px 0' } });
  for (const d of data) {
    const total = d.series.reduce((a, s) => a + s.n, 0);
    const col = h('div', { style: { flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', height: '100%', justifyContent: 'flex-end', minWidth: 0, cursor: onClick ? 'pointer' : 'default' }, onClick: onClick && (() => onClick(d)) });
    const stack = h('div', { style: { width: '100%', maxWidth: '64px', display: 'flex', flexDirection: 'column-reverse', gap: '2px', height: `${(total / max) * (height - 46)}px`, minHeight: total ? '4px' : '0' } });
    for (const s of d.series) if (s.n) stack.append(h('div', { dataset: { tip: tipHtml(`${d.label} · ${s.name}`, s.n) }, style: { background: s.color, flex: s.n, borderRadius: '4px', minHeight: '3px' } }));
    col.append(h('div', { class: 'num mono muted', style: { fontSize: '11.5px' } }, total), stack, h('div', { class: 'dim trunc', style: { fontSize: '11.5px', maxWidth: '100%' } }, d.label));
    wrap.append(col);
  }
  return wrap;
}

/** hbars({rows:[{label,sub,avatar,segments:[{n,color,name}],value}], max}) — stacked horizontal bars */
export function hbars({ rows, max, labelWidth = 150, onClick }) {
  const m = max || Math.max(1, ...rows.map((r) => r.segments.reduce((a, s) => a + s.n, 0)));
  return h('div', { class: 'col gap-12' }, rows.map((r) => {
    const tot = r.segments.reduce((a, s) => a + s.n, 0);
    return h('div', { class: 'row gap-12', style: { cursor: onClick ? 'pointer' : 'default' }, onClick: onClick && (() => onClick(r)) },
      h('div', { class: 'row gap-8', style: { width: `${labelWidth}px`, flex: 'none', minWidth: 0 } }, r.avatar, h('div', { style: { minWidth: 0, lineHeight: 1.25 } }, h('div', { class: 'trunc', style: { fontWeight: 550, fontSize: '12.5px' } }, r.label), r.sub && h('div', { class: 'dim trunc', style: { fontSize: '11px' } }, r.sub))),
      h('div', { class: 'grow', style: { display: 'flex', gap: '2px', height: '10px' } }, r.segments.filter((s) => s.n).map((s) => h('div', { dataset: { tip: tipHtml(`${r.label} · ${s.name}`, s.n) }, style: { width: `${(s.n / m) * 100}%`, background: s.color, borderRadius: '3px', minWidth: '4px', transition: 'width .5s' } }))),
      h('div', { class: 'mono muted num', style: { width: '26px', textAlign: 'right', fontSize: '12px' } }, r.value ?? tot));
  }));
}

/** barList({rows:[{label,n,color}]}) — simple labelled bars */
export function barList({ rows, labelWidth = 96, onClick }) {
  const max = Math.max(1, ...rows.map((r) => r.n));
  return h('div', { class: 'col gap-12' }, rows.map((r) => h('div', { class: 'bar-row', style: { '--lw': `${labelWidth}px`, cursor: onClick ? 'pointer' : 'default' }, onClick: onClick && (() => onClick(r)) },
    h('span', { class: 'trunc' }, r.label), h('div', { class: 'track' }, h('i', { style: { '--c': r.color, width: `${(r.n / max) * 100}%` } })), h('span', { class: 'v' }, r.n))));
}

/** spark({values, color, w, h}) tiny line */
export function spark({ values, color = 'var(--accent)', w = 90, h: ht = 28 }) {
  const max = Math.max(1, ...values), pts = values.map((v, i) => [(i / Math.max(values.length - 1, 1)) * (w - 4) + 2, ht - 3 - (v / max) * (ht - 6)]);
  return svg('svg', { width: w, height: ht, viewBox: `0 0 ${w} ${ht}` }, svg('polyline', { points: pts.map((p) => p.join(',')).join(' '), fill: 'none', stroke: color, 'stroke-width': 1.8, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }), svg('circle', { cx: pts.at(-1)[0], cy: pts.at(-1)[1], r: 2.4, fill: color }));
}
