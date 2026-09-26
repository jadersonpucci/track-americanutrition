// Componentes de interface (sem framework): elementos, ícones, modais, gavetas, menus, campos.
import { esc, initials, hashColor, money, parseMoney, norm, uid } from './utils.js';
import { banco, logoUrl } from './bancos.js';

export function h(html) { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; }
export function frag(html) { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content; }
export const icon = (n, cls = '') => `<i class="ti ${n} ${cls}"></i>`;
export function on(root, ev, sel, fn) { root.addEventListener(ev, e => { const t = e.target.closest(sel); if (t && root.contains(t)) fn(e, t); }); }

// ---------- ícones de conta / contato / categoria ----------
export function bankIcon(conta, size = 36, cls = '') {
  if (!conta) return `<span class="bicon mono ${cls}" style="--s:${size}px;background:#8A94A8">?</span>`;
  const b = banco(conta.banco); const url = logoUrl(conta.banco); const cor = conta.cor || b.cor;
  if (url) return `<span class="bicon ${cls}" style="--s:${size}px" title="${esc(b.nome)}"><img src="${url}" alt="${esc(b.nome)}" loading="lazy"></span>`;
  return `<span class="bicon mono ${cls}" style="--s:${size}px;background:${cor}">${esc(initials(conta.nome))}</span>`;
}
export function avatar(nome, size = 36, cor = null) {
  return `<span class="avatar" style="--s:${size}px;background:${cor || hashColor(nome)}">${esc(initials(nome || '?'))}</span>`;
}
export function catIcon(cat, size = 36) {
  if (!cat) return `<span class="cicon" style="--s:${size}px;--c:#8A94A8">${icon('ti-help')}</span>`;
  const cor = cat.cor || (cat.tipo === 'in' ? '#17924A' : ['#B26A00', '#E8262C', '#2F6BE0', '#8E44AD'][Number(cat.grupo) - 2] || '#5B667E');
  return `<span class="cicon" style="--s:${size}px;--c:${cor}">${icon(cat.icone || (cat.tipo === 'in' ? 'ti-arrow-down-left' : 'ti-arrow-up-right'))}</span>`;
}
export function pill(text, cor = 'gray', extra = '') { return `<span class="pill ${cor} ${extra}">${text}</span>`; }
export function tagChip(tag) { return `<span class="tagchip" style="--c:${tag.cor || '#5B667E'}">${esc(tag.nome)}</span>`; }

// ---------- toast ----------
let toastEl;
export function toast(msg, type = 'ok', ms = 2800) {
  if (!toastEl) { toastEl = h('<div class="toasts"></div>'); document.body.appendChild(toastEl); }
  const t = h(`<div class="toast ${type}">${icon(type === 'err' ? 'ti-alert-circle' : type === 'warn' ? 'ti-alert-triangle' : 'ti-circle-check')}<span>${esc(msg)}</span></div>`);
  toastEl.appendChild(t); requestAnimationFrame(() => t.classList.add('on'));
  setTimeout(() => { t.classList.remove('on'); setTimeout(() => t.remove(), 300); }, ms);
}

// ---------- overlays: modal, drawer, confirm ----------
const stack = [];
function overlay(kind, { title = '', body = '', footer = '', size = '', onClose = null, cls = '' } = {}) {
  const el = h(`<div class="ov ${kind} ${cls}"><div class="ov-bg"></div><div class="ov-box ${size}" role="dialog" aria-modal="true">
    <header class="ov-h"><h3>${title}</h3><button class="ibtn ov-x" aria-label="Fechar">${icon('ti-x')}</button></header>
    <div class="ov-b"></div>${footer !== null ? '<footer class="ov-f"></footer>' : ''}</div></div>`);
  const bodyEl = el.querySelector('.ov-b'); const footEl = el.querySelector('.ov-f');
  if (typeof body === 'string') bodyEl.innerHTML = body; else if (body) bodyEl.appendChild(body);
  if (footEl) { if (typeof footer === 'string') footEl.innerHTML = footer; else if (footer) footEl.appendChild(footer); }
  const api = { el, body: bodyEl, footer: footEl, closed: false, close(result) { if (api.closed) return; api.closed = true; el.classList.remove('on'); setTimeout(() => el.remove(), 220); stack.splice(stack.indexOf(api), 1); document.body.classList.toggle('ov-open', stack.length > 0); onClose && onClose(result); }, setTitle(t) { el.querySelector('.ov-h h3').innerHTML = t; } };
  el.querySelector('.ov-x').onclick = () => api.close();
  el.querySelector('.ov-bg').onclick = () => api.close();
  document.body.appendChild(el); stack.push(api); document.body.classList.add('ov-open');
  requestAnimationFrame(() => el.classList.add('on'));
  const first = bodyEl.querySelector('input:not([type=hidden]),select,textarea,button'); if (first && window.innerWidth > 700) setTimeout(() => first.focus(), 60);
  return api;
}
export const modal = o => overlay('modal', o);
export const drawer = o => overlay('drawer', o);
document.addEventListener('keydown', e => { if (e.key === 'Escape' && stack.length) { const top = stack[stack.length - 1]; if (!document.querySelector('.combo-pop.on')) top.close(); } });
export function closeAll() { [...stack].forEach(s => s.close()); }

export function confirm({ title = 'Confirmar', msg = '', ok = 'Confirmar', cancel = 'Cancelar', danger = false } = {}) {
  return new Promise(res => {
    const m = modal({ title, body: `<p class="muted">${msg}</p>`, size: 'sm', footer: `<button class="btn ghost" data-c>${cancel}</button><button class="btn ${danger ? 'danger' : 'primary'}" data-ok>${ok}</button>`, onClose: r => res(!!r) });
    m.footer.querySelector('[data-c]').onclick = () => m.close(false);
    m.footer.querySelector('[data-ok]').onclick = () => m.close(true);
    setTimeout(() => m.footer.querySelector('[data-ok]').focus(), 50);
  });
}
export function prompt({ title = '', label = '', value = '', ok = 'Salvar', type = 'text', placeholder = '' } = {}) {
  return new Promise(res => {
    const m = modal({ title, size: 'sm', body: field(label, `<input class="inp" type="${type}" value="${esc(value)}" placeholder="${esc(placeholder)}">`), footer: `<button class="btn ghost" data-c>Cancelar</button><button class="btn primary" data-ok>${ok}</button>`, onClose: r => res(r) });
    const inp = m.body.querySelector('input');
    m.footer.querySelector('[data-c]').onclick = () => m.close(null);
    m.footer.querySelector('[data-ok]').onclick = () => m.close(inp.value);
    inp.addEventListener('keydown', e => { if (e.key === 'Enter') m.close(inp.value); });
  });
}

// ---------- menu popover ----------
let openMenu = null;
export function menu(anchor, items, { align = 'right' } = {}) {
  closeMenu();
  const el = h(`<div class="menu"></div>`);
  for (const it of items) {
    if (it === '-') { el.appendChild(h('<div class="menu-sep"></div>')); continue; }
    if (!it) continue;
    const b = h(`<button class="menu-it ${it.danger ? 'danger' : ''}" ${it.disabled ? 'disabled' : ''}>${it.icon ? icon(it.icon) : ''}<span>${it.label}</span>${it.kbd ? `<kbd>${it.kbd}</kbd>` : ''}</button>`);
    b.onclick = e => { e.stopPropagation(); closeMenu(); it.onClick && it.onClick(e); };
    el.appendChild(b);
  }
  document.body.appendChild(el);
  const r = anchor.getBoundingClientRect(); const w = el.offsetWidth, hgt = el.offsetHeight;
  let top = r.bottom + 6, left = align === 'right' ? r.right - w : r.left;
  if (top + hgt > window.innerHeight - 8) top = Math.max(8, r.top - hgt - 6);
  left = Math.max(8, Math.min(left, window.innerWidth - w - 8));
  el.style.top = top + 'px'; el.style.left = left + 'px';
  requestAnimationFrame(() => el.classList.add('on'));
  openMenu = el;
  setTimeout(() => document.addEventListener('click', closeMenu, { once: true }), 0);
  return el;
}
export function closeMenu() { if (openMenu) { openMenu.remove(); openMenu = null; } }
window.addEventListener('scroll', closeMenu, true);

// ---------- campos ----------
export function field(label, inputHtml, { hint = '', cls = '', req = false } = {}) {
  return h(`<label class="fld ${cls}"><span class="fl">${label}${req ? '<i class="req">*</i>' : ''}</span>${typeof inputHtml === 'string' ? inputHtml : ''}${hint ? `<small class="hint">${hint}</small>` : ''}</label>`);
}
export function fieldEl(label, el, opts = {}) { const f = field(label, '', opts); f.querySelector('.fl').after(el); return f; }

// input monetário: mostra formatado, aceita digitação livre, guarda número em .value (getter)
export function moneyInput({ value = 0, placeholder = '0,00', cls = '', allowNegative = false, name = '' } = {}) {
  const wrap = h(`<div class="minp ${cls}"><span class="cur">R$</span><input inputmode="decimal" placeholder="${placeholder}" ${name ? `name="${name}"` : ''}></div>`);
  const inp = wrap.querySelector('input');
  const fmt = v => v === 0 || v == null ? '' : Math.abs(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  inp.value = fmt(value); if (value < 0) inp.value = '-' + inp.value;
  inp.addEventListener('blur', () => { const v = wrap.get(); inp.value = v < 0 ? '-' + fmt(v) : fmt(v); inp.dispatchEvent(new CustomEvent('money', { bubbles: true, detail: v })); });
  inp.addEventListener('input', () => { inp.dispatchEvent(new CustomEvent('money', { bubbles: true, detail: wrap.get() })); });
  inp.addEventListener('focus', () => setTimeout(() => inp.select(), 0));
  wrap.get = () => { let v = parseMoney(inp.value); if (!allowNegative) v = Math.abs(v); return Math.round(v * 100) / 100; };
  wrap.set = v => { inp.value = v < 0 ? '-' + fmt(v) : fmt(v); };
  wrap.input = inp;
  return wrap;
}

// combobox pesquisável: options [{id, label, sub?, icon?(html), group?}]
export function combobox({ options = [], value = null, placeholder = 'Selecionar…', onChange = null, allowCreate = null, allowEmpty = true, cls = '', renderValue = null, name = '' } = {}) {
  const el = h(`<div class="combo ${cls}" tabindex="0" ${name ? `data-name="${name}"` : ''}><span class="combo-v"></span><i class="ti ti-selector"></i></div>`);
  let opts = options; let cur = value; let pop = null; let hi = 0; let filtered = [];
  const find = id => opts.find(o => o.id === id);
  const paint = () => { const o = find(cur); const v = el.querySelector('.combo-v'); if (o) { v.innerHTML = renderValue ? renderValue(o) : `${o.icon || ''}<span class="t">${esc(o.label)}</span>`; v.classList.remove('ph'); } else { v.innerHTML = `<span class="t">${esc(placeholder)}</span>`; v.classList.add('ph'); } };
  const close = () => { if (pop) { pop.remove(); pop = null; document.removeEventListener('click', outside, true); } };
  const outside = e => { if (pop && !pop.contains(e.target) && !el.contains(e.target)) close(); };
  const pick = o => { cur = o ? o.id : null; paint(); close(); el.dispatchEvent(new CustomEvent('change', { bubbles: true, detail: cur })); onChange && onChange(cur, o); };
  const open = () => {
    if (pop) return; hi = 0;
    pop = h(`<div class="combo-pop on"><div class="combo-s"><i class="ti ti-search"></i><input placeholder="Buscar…"></div><div class="combo-l"></div></div>`);
    document.body.appendChild(pop); document.addEventListener('click', outside, true);
    const r = el.getBoundingClientRect(); const wdt = Math.max(r.width, 280);
    const spaceBelow = window.innerHeight - r.bottom; const ph = Math.min(360, Math.max(200, spaceBelow - 16));
    pop.style.width = wdt + 'px'; pop.style.left = Math.min(r.left, window.innerWidth - wdt - 8) + 'px';
    if (spaceBelow < 260 && r.top > 300) { pop.style.top = ''; pop.style.bottom = (window.innerHeight - r.top + 6) + 'px'; pop.style.maxHeight = Math.min(360, r.top - 16) + 'px'; } else { pop.style.top = (r.bottom + 6) + 'px'; pop.style.maxHeight = ph + 'px'; }
    const inp = pop.querySelector('input'); const list = pop.querySelector('.combo-l');
    const render = () => {
      const q = norm(inp.value); filtered = opts.filter(o => !q || norm(o.label + ' ' + (o.sub || '') + ' ' + (o.keywords || '')).includes(q));
      let html = ''; let lastG = null;
      if (allowEmpty && !q) html += `<button class="combo-it empty" data-i="-1">${icon('ti-minus')}<span class="t">Nenhum</span></button>`;
      filtered.forEach((o, i) => { if (o.group && o.group !== lastG) { html += `<div class="combo-g">${esc(o.group)}</div>`; lastG = o.group; } html += `<button class="combo-it ${i === hi ? 'hi' : ''} ${o.id === cur ? 'sel' : ''}" data-i="${i}">${o.icon || ''}<span class="t">${esc(o.label)}${o.sub ? `<small>${esc(o.sub)}</small>` : ''}</span>${o.id === cur ? icon('ti-check') : ''}</button>`; });
      if (!filtered.length && !allowCreate) html += `<div class="combo-none">Nada encontrado</div>`;
      if (allowCreate && q) html += `<button class="combo-it create" data-create>${icon('ti-plus')}<span class="t">Criar "${esc(inp.value)}"</span></button>`;
      list.innerHTML = html;
      const hiEl = list.querySelector('.hi'); if (hiEl) hiEl.scrollIntoView({ block: 'nearest' });
    };
    render();
    inp.addEventListener('input', () => { hi = 0; render(); });
    inp.addEventListener('keydown', e => {
      if (e.key === 'ArrowDown') { hi = Math.min(filtered.length - 1, hi + 1); render(); e.preventDefault(); }
      else if (e.key === 'ArrowUp') { hi = Math.max(0, hi - 1); render(); e.preventDefault(); }
      else if (e.key === 'Enter') { e.preventDefault(); if (filtered[hi]) pick(filtered[hi]); else if (allowCreate && inp.value.trim()) doCreate(inp.value.trim()); }
      else if (e.key === 'Escape') { e.stopPropagation(); close(); el.focus(); }
    });
    const doCreate = async txt => { const o = await allowCreate(txt); if (o) { opts = [...opts, o]; pick(o); } };
    list.addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; if (b.dataset.create) return doCreate(inp.value.trim()); const i = Number(b.dataset.i); pick(i < 0 ? null : filtered[i]); });
    setTimeout(() => inp.focus(), 20);
  };
  el.addEventListener('click', () => pop ? close() : open());
  el.addEventListener('keydown', e => { if (['Enter', ' ', 'ArrowDown'].includes(e.key)) { e.preventDefault(); open(); } });
  el.get = () => cur; el.set = v => { cur = v; paint(); }; el.setOptions = o => { opts = o; paint(); };
  paint(); return el;
}

export function segmented(options, value, onChange, cls = '') {
  const el = h(`<div class="seg ${cls}">${options.map(o => `<button type="button" data-v="${o.id}" class="${o.id === value ? 'on' : ''} ${o.cls || ''}">${o.icon ? icon(o.icon) : ''}${o.label}</button>`).join('')}</div>`);
  el.addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; el.querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b)); onChange && onChange(b.dataset.v); });
  el.get = () => el.querySelector('button.on')?.dataset.v; el.set = v => el.querySelectorAll('button').forEach(x => x.classList.toggle('on', x.dataset.v === v));
  return el;
}
export function toggle({ label, checked = false, name = '' } = {}) {
  const el = h(`<label class="tgl"><input type="checkbox" ${checked ? 'checked' : ''} ${name ? `name="${name}"` : ''}><span class="tgl-k"></span><span class="tgl-l">${label}</span></label>`);
  el.get = () => el.querySelector('input').checked; el.set = v => { el.querySelector('input').checked = !!v; };
  return el;
}
export function chips(items, { multi = false, value = [], onChange } = {}) {
  let sel = new Set(Array.isArray(value) ? value : value ? [value] : []);
  const el = h(`<div class="chips">${items.map(i => `<button type="button" class="chip ${sel.has(i.id) ? 'on' : ''}" data-v="${i.id}" ${i.cor ? `style="--c:${i.cor}"` : ''}>${i.icon ? icon(i.icon) : ''}${esc(i.label)}${i.count != null ? `<b>${i.count}</b>` : ''}</button>`).join('')}</div>`);
  el.addEventListener('click', e => { const b = e.target.closest('.chip'); if (!b) return; const v = b.dataset.v; if (multi) { sel.has(v) ? sel.delete(v) : sel.add(v); } else { sel = sel.has(v) ? new Set() : new Set([v]); } el.querySelectorAll('.chip').forEach(c => c.classList.toggle('on', sel.has(c.dataset.v))); onChange && onChange(multi ? [...sel] : [...sel][0] || null); });
  el.get = () => multi ? [...sel] : [...sel][0] || null;
  return el;
}
export function emptyState({ icon: ic = 'ti-inbox', title = 'Nada por aqui', text = '', action = null }) {
  const el = h(`<div class="empty">${icon(ic)}<h4>${title}</h4>${text ? `<p>${text}</p>` : ''}</div>`);
  if (action) { const b = h(`<button class="btn primary sm">${action.icon ? icon(action.icon) : ''}${action.label}</button>`); b.onclick = action.onClick; el.appendChild(b); }
  return el;
}
export function moneyEl(v, { sign = true, cls = '' } = {}) { const c = v > 0 ? 'pos' : v < 0 ? 'neg' : ''; return `<span class="amt ${c} ${cls}">${money(v, { sign })}</span>`; }
export function kbd(s) { return `<kbd>${s}</kbd>`; }
export function skeleton(n = 5) { return Array.from({ length: n }, () => '<div class="sk row"></div>').join(''); }
export function copy(text) { navigator.clipboard?.writeText(text).then(() => toast('Copiado')); }
