// Componentes de interface do painel.
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const brl = (v) => 'R$ ' + Number(v || 0).toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.');
export const num = (s) => { if (typeof s === 'number') return s; const t = String(s ?? '').trim().replace(/[^\d,.-]/g, ''); if (!t) return 0; return parseFloat(t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : t) || 0; };
export const dataBR = (d, hora = false) => d ? new Date(d).toLocaleString('pt-BR', hora ? { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' } : { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—';
export const slug = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);
export const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];
export const thumb = (u, w = 120) => !u ? '' : /cdn\.shopify\.com|\/cdn\/shop\//.test(u) ? u + (u.includes('?') ? '&' : '?') + 'width=' + w : u;

export function toast(msg, err = false) {
  const t = document.createElement('div'); t.className = 'toast' + (err ? ' err' : ''); t.textContent = msg;
  document.body.appendChild(t); setTimeout(() => t.remove(), err ? 5000 : 2600);
}

// gaveta lateral (editores) ou modal central
export function abrirPainel({ titulo, corpo, rodape = '', largo = false, central = false, aoFechar }) {
  const ov = document.createElement('div');
  ov.className = 'ov' + (central ? ' center' : '');
  ov.innerHTML = central
    ? `<div class="md"><div class="dw-h"><h2>${esc(titulo)}</h2><button class="btn ico ghost" data-x><i class="ti ti-x"></i></button></div><div class="dw-b">${corpo}</div>${rodape ? `<div class="dw-f">${rodape}</div>` : ''}</div>`
    : `<div class="dw${largo ? ' wide' : ''}"><div class="dw-h"><h2>${esc(titulo)}</h2><button class="btn ico ghost" data-x><i class="ti ti-x"></i></button></div><div class="dw-b">${corpo}</div>${rodape ? `<div class="dw-f">${rodape}</div>` : ''}</div>`;
  const fechar = () => { ov.remove(); document.removeEventListener('keydown', esc_); aoFechar?.(); };
  const esc_ = (e) => { if (e.key === 'Escape') fechar(); };
  ov.addEventListener('mousedown', (e) => { if (e.target === ov) fechar(); });
  ov.querySelector('[data-x]').onclick = fechar;
  document.addEventListener('keydown', esc_);
  document.body.appendChild(ov);
  return { el: ov, fechar };
}

export function confirmar(msg, { ok = 'Confirmar', perigo = false } = {}) {
  return new Promise((res) => {
    const p = abrirPainel({ titulo: 'Confirmar', central: true, corpo: `<p>${esc(msg)}</p>`, rodape: `<button class="btn" data-n>Cancelar</button><button class="btn ${perigo ? 'red' : 'pri'}" data-s>${esc(ok)}</button>`, aoFechar: () => res(false) });
    p.el.querySelector('[data-n]').onclick = () => p.fechar();
    p.el.querySelector('[data-s]').onclick = () => { res(true); p.el.remove(); };
  });
}

// campos
export const fld = (label, inner, ajuda = '') => `<label class="fld"><span>${esc(label)}</span>${inner}${ajuda ? `<small>${ajuda}</small>` : ''}</label>`;
export const inp = (name, v, attrs = '') => `<input class="in" name="${name}" value="${esc(v ?? '')}" ${attrs}>`;
export const area = (name, v, attrs = '') => `<textarea class="in" name="${name}" ${attrs}>${esc(v ?? '')}</textarea>`;
export const sel = (name, v, ops) => `<select class="in" name="${name}">${ops.map(([k, t]) => `<option value="${esc(k)}"${String(k) === String(v ?? '') ? ' selected' : ''}>${esc(t)}</option>`).join('')}</select>`;
export const chk = (name, v, label) => `<label class="chk"><input type="checkbox" name="${name}"${v ? ' checked' : ''}> ${esc(label)}</label>`;

export function lerForm(root) {
  const o = {};
  $$('[name]', root).forEach((el) => {
    if (el.closest('[data-skip]')) return;
    const k = el.name;
    if (el.type === 'checkbox') o[k] = el.checked;
    else if (el.type === 'number') o[k] = el.value === '' ? null : Number(el.value);
    else o[k] = el.value;
  });
  return o;
}

// editor de texto rico simples (contenteditable) com alternância para HTML
export function editorRico(html, nome = 'html') {
  const id = 'rte' + Math.random().toString(36).slice(2, 8);
  setTimeout(() => {
    const box = document.getElementById(id); if (!box) return;
    const area_ = $('.rte-area', box), code = $('textarea', box);
    $$('[data-cmd]', box).forEach((b) => b.onclick = (e) => {
      e.preventDefault();
      const c = b.dataset.cmd;
      if (c === 'html') { const on = code.hidden; if (on) { code.value = area_.innerHTML; } else { area_.innerHTML = code.value; } code.hidden = !on; area_.hidden = on; return; }
      if (c === 'link') { const u = prompt('Endereço do link:'); if (u) document.execCommand('createLink', false, u); return; }
      if (c === 'img') { const u = prompt('URL da imagem:'); if (u) document.execCommand('insertImage', false, u); return; }
      if (c.startsWith('h')) { document.execCommand('formatBlock', false, c); return; }
      document.execCommand(c, false, null);
    });
    area_.addEventListener('input', () => { code.value = area_.innerHTML; });
    code.addEventListener('input', () => { area_.innerHTML = code.value; });
  });
  const bt = (cmd, ico, t) => `<button type="button" data-cmd="${cmd}" title="${t}"><i class="ti ti-${ico}"></i></button>`;
  return `<div class="rte" id="${id}"><div class="rte-tools">${bt('bold', 'bold', 'Negrito')}${bt('italic', 'italic', 'Itálico')}${bt('h2', 'h-2', 'Título')}${bt('h3', 'h-3', 'Subtítulo')}${bt('p', 'pilcrow', 'Parágrafo')}${bt('insertUnorderedList', 'list', 'Lista')}${bt('insertOrderedList', 'list-numbers', 'Lista numerada')}${bt('link', 'link', 'Link')}${bt('img', 'photo', 'Imagem')}${bt('removeFormat', 'clear-formatting', 'Limpar')}${bt('html', 'code', 'Ver HTML')}</div>
<div class="rte-area" contenteditable="true">${html || ''}</div><textarea class="in code" name="${nome}" hidden>${esc(html || '')}</textarea></div>`;
}

// lista reordenável por arrastar
export function ordenavel(root, aoMudar) {
  let arr = null;
  root.addEventListener('dragstart', (e) => { arr = e.target.closest('.it'); arr?.classList.add('drag'); });
  root.addEventListener('dragend', () => { arr?.classList.remove('drag'); arr = null; aoMudar?.(); });
  root.addEventListener('dragover', (e) => {
    e.preventDefault(); if (!arr) return;
    const alvo = e.target.closest('.it'); if (!alvo || alvo === arr || alvo.parentNode !== root) return;
    const r = alvo.getBoundingClientRect();
    root.insertBefore(arr, e.clientY > r.top + r.height / 2 ? alvo.nextSibling : alvo);
  });
}

export const statusBadge = (s) => ({ ativo: '<span class="badge green">Ativo</span>', rascunho: '<span class="badge">Rascunho</span>', arquivado: '<span class="badge amber">Arquivado</span>' }[s || 'ativo'] || `<span class="badge">${esc(s)}</span>`);
