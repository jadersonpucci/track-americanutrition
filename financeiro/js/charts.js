// Gráficos em SVG puro: barras (entradas x saídas), linha (saldo) e donut (composição).
import { money, esc } from './utils.js';

const NS = 'http://www.w3.org/2000/svg';
function svg(w, h, cls = '') { const s = document.createElementNS(NS, 'svg'); s.setAttribute('viewBox', `0 0 ${w} ${h}`); s.setAttribute('class', 'chart ' + cls); s.setAttribute('preserveAspectRatio', 'none'); return s; }
function el(tag, attrs = {}) { const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); return e; }
function nice(max) { if (max <= 0) return 1; const p = Math.pow(10, Math.floor(Math.log10(max))); const f = max / p; const n = f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10; return n * p; }

// series: [{label, in, out, prevIn?, prevOut?}] ; opções: {height}
export function barsInOut(container, series, { height = 180, showLegend = true, onHover = null } = {}) {
  container.innerHTML = '';
  const n = series.length; if (!n) return;
  const W = Math.max(320, container.clientWidth || 600), H = height; const padL = 8, padR = 8, padT = 10, padB = 24;
  const max = nice(Math.max(1, ...series.map(s => Math.max(s.in + (s.prevIn || 0), s.out + (s.prevOut || 0)))));
  const s = svg(W, H); s.setAttribute('preserveAspectRatio', 'none'); s.style.height = H + 'px';
  const gw = (W - padL - padR) / n; const bw = Math.min(22, gw * 0.32); const y = v => padT + (H - padT - padB) * (1 - v / max);
  for (let i = 0; i <= 3; i++) { const yy = padT + (H - padT - padB) * i / 3; s.appendChild(el('line', { x1: padL, x2: W - padR, y1: yy, y2: yy, class: 'grid' })); }
  series.forEach((d, i) => {
    const cx = padL + gw * i + gw / 2; const g = el('g', { class: 'bar-g' });
    const inH = y(0) - y(d.in), outH = y(0) - y(d.out);
    g.appendChild(el('rect', { x: cx - bw - 2, y: y(d.in), width: bw, height: Math.max(0, inH), rx: 4, class: 'b-in' }));
    if (d.prevIn) g.appendChild(el('rect', { x: cx - bw - 2, y: y(d.in + d.prevIn), width: bw, height: Math.max(0, y(d.in) - y(d.in + d.prevIn)), rx: 4, class: 'b-in prev' }));
    g.appendChild(el('rect', { x: cx + 2, y: y(d.out), width: bw, height: Math.max(0, outH), rx: 4, class: 'b-out' }));
    if (d.prevOut) g.appendChild(el('rect', { x: cx + 2, y: y(d.out + d.prevOut), width: bw, height: Math.max(0, y(d.out) - y(d.out + d.prevOut)), rx: 4, class: 'b-out prev' }));
    const t = el('text', { x: cx, y: H - 6, class: 'lbl', 'text-anchor': 'middle' }); t.textContent = d.label; g.appendChild(t);
    const hit = el('rect', { x: padL + gw * i, y: 0, width: gw, height: H, fill: 'transparent' });
    hit.addEventListener('mouseenter', () => { tip.show(cx, padT, `<b>${esc(d.title || d.label)}</b><div><i class="dot in"></i>Entradas ${money(d.in + (d.prevIn || 0))}</div><div><i class="dot out"></i>Saídas ${money(d.out + (d.prevOut || 0))}</div>`); onHover && onHover(d); });
    hit.addEventListener('mouseleave', () => tip.hide());
    g.appendChild(hit); s.appendChild(g);
  });
  container.appendChild(s);
  const tip = tooltip(container);
  if (showLegend) container.appendChild(legend([['in', 'Entradas'], ['out', 'Saídas']]));
}

// linha de saldo: points [{label, value, projected?}]
export function lineSaldo(container, points, { height = 160, zero = true } = {}) {
  container.innerHTML = ''; const n = points.length; if (!n) return;
  const W = Math.max(320, container.clientWidth || 600), H = height; const padL = 8, padR = 8, padT = 12, padB = 22;
  const vals = points.map(p => p.value); let min = Math.min(...vals), max = Math.max(...vals); if (min < 0 && max < 0) max = 0; if (min > 0 && (max - min) < max * 0.15) { /* pouca variação: dá respiro sem forçar o zero */ } if (max === min) { max = min + 1; }
  const range = max - min; min -= range * 0.08; max += range * 0.08;
  const x = i => padL + (W - padL - padR) * (n === 1 ? 0.5 : i / (n - 1)); const y = v => padT + (H - padT - padB) * (1 - (v - min) / (max - min));
  const s = svg(W, H); s.style.height = H + 'px';
  if (zero && min < 0) s.appendChild(el('line', { x1: padL, x2: W - padR, y1: y(0), y2: y(0), class: 'zero' }));
  const realIdx = points.findIndex(p => p.projected); const splitAt = realIdx < 0 ? n - 1 : Math.max(0, realIdx - 1);
  const path = (from, to) => points.slice(from, to + 1).map((p, i) => `${i ? 'L' : 'M'}${x(from + i).toFixed(1)},${y(p.value).toFixed(1)}`).join(' ');
  const area = el('path', { d: path(0, n - 1) + ` L${x(n - 1)},${y(min)} L${x(0)},${y(min)} Z`, class: 'area' }); s.appendChild(area);
  s.appendChild(el('path', { d: path(0, splitAt), class: 'line' }));
  if (splitAt < n - 1) s.appendChild(el('path', { d: path(splitAt, n - 1), class: 'line proj' }));
  const step = Math.ceil(n / 6);
  points.forEach((p, i) => { if (i % step === 0 || i === n - 1) { const t = el('text', { x: x(i), y: H - 5, class: 'lbl', 'text-anchor': i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle' }); t.textContent = p.label; s.appendChild(t); } });
  const dot = el('circle', { r: 4, class: 'dot-hl', style: 'display:none' }); s.appendChild(dot);
  const hit = el('rect', { x: 0, y: 0, width: W, height: H, fill: 'transparent' });
  hit.addEventListener('mousemove', e => { const r = s.getBoundingClientRect(); const i = Math.round(((e.clientX - r.left) / r.width * W - padL) / (W - padL - padR) * (n - 1)); const p = points[Math.max(0, Math.min(n - 1, i))]; if (!p) return; const ii = points.indexOf(p); dot.setAttribute('cx', x(ii)); dot.setAttribute('cy', y(p.value)); dot.style.display = ''; tip.show(x(ii), y(p.value), `<b>${esc(p.title || p.label)}</b><div>${p.projected ? 'Projetado' : 'Saldo'} ${money(p.value)}</div>`); });
  hit.addEventListener('mouseleave', () => { dot.style.display = 'none'; tip.hide(); });
  s.appendChild(hit); container.appendChild(s);
  const tip = tooltip(container);
}

// donut: items [{label, value, color}]
export function donut(container, items, { size = 150, thickness = 16, center = '' } = {}) {
  container.innerHTML = ''; const total = items.reduce((a, b) => a + b.value, 0) || 1;
  const s = svg(size, size, 'donut'); s.setAttribute('preserveAspectRatio', 'xMidYMid meet'); s.style.width = size + 'px'; s.style.height = size + 'px';
  const r = (size - thickness) / 2, c = size / 2, circ = 2 * Math.PI * r; let off = 0;
  s.appendChild(el('circle', { cx: c, cy: c, r, class: 'track', 'stroke-width': thickness }));
  for (const it of items) {
    const len = circ * (it.value / total);
    const seg = el('circle', { cx: c, cy: c, r, 'stroke-width': thickness, stroke: it.color, fill: 'none', 'stroke-dasharray': `${Math.max(0, len - 2)} ${circ - len + 2}`, 'stroke-dashoffset': -off, transform: `rotate(-90 ${c} ${c})`, class: 'seg' });
    seg.addEventListener('mouseenter', () => tip.show(c, c, `<b>${esc(it.label)}</b><div>${money(it.value)} · ${(it.value / total * 100).toFixed(1)}%</div>`)); seg.addEventListener('mouseleave', () => tip.hide());
    s.appendChild(seg); off += len;
  }
  container.appendChild(s);
  if (center) { const t = document.createElement('div'); t.className = 'donut-c'; t.innerHTML = center; container.appendChild(t); }
  const tip = tooltip(container);
}

export function sparkline(values, { w = 90, h = 28, cls = '' } = {}) {
  if (!values.length) return '';
  const min = Math.min(...values), max = Math.max(...values); const rg = max - min || 1;
  const pts = values.map((v, i) => `${(i / (values.length - 1 || 1) * w).toFixed(1)},${(h - 2 - (v - min) / rg * (h - 4)).toFixed(1)}`).join(' ');
  return `<svg class="spark ${cls}" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}"><polyline points="${pts}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round"/></svg>`;
}

function legend(items) { const d = document.createElement('div'); d.className = 'legend'; d.innerHTML = items.map(([c, l]) => `<span><i class="dot ${c}"></i>${l}</span>`).join(''); return d; }
function tooltip(container) {
  let t = container.querySelector('.ctip'); if (!t) { t = document.createElement('div'); t.className = 'ctip'; container.style.position = 'relative'; container.appendChild(t); }
  const s = container.querySelector('svg');
  return { show(x, y, html) { t.innerHTML = html; t.style.display = 'block'; const vb = s.viewBox.baseVal; const r = s.getBoundingClientRect(); const px = x / vb.width * r.width, py = y / vb.height * r.height; const tw = t.offsetWidth; t.style.left = Math.max(0, Math.min(px - tw / 2, r.width - tw)) + 'px'; t.style.top = Math.max(0, py - t.offsetHeight - 10) + 'px'; }, hide() { t.style.display = 'none'; } };
}
