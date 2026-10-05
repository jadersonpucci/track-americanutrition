// Utilitários do tema (rodam no build, em Node).

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// R$ 1.234,56
export const brl = (v) => 'R$ ' + Number(v || 0).toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.');

// Largura certa da imagem. No CDN próprio (cdn.americanutrition.com/imagens/loja/…) cada imagem tem
// versões WebP prontas de 300/600/1000/1600 px (scripts/loja-midia.py); na Shopify, ?width=.
export const LARGURAS = [300, 600, 1000, 1600];
const CDN_LOJA = /^(https:\/\/cdn\.americanutrition\.com\/imagens\/loja\/)(?!w\d+\/)(.+)\.(jpe?g|png|webp)$/i;
export function img(url, w) {
  if (!url) return '';
  let u = url.startsWith('//') ? 'https:' + url : url;
  if (!w) return u;
  const m = u.match(CDN_LOJA);
  if (m) { const alvo = LARGURAS.find((x) => x >= w); return alvo ? `${m[1]}w${alvo}/${m[2]}.webp` : u; }
  if (/cdn\.shopify\.com|\/cdn\/shop\//.test(u)) return u + (u.includes('?') ? '&' : '?') + 'width=' + w;
  return u;
}
export const srcset = (url, ws) => ws.map((w) => `${img(url, w)} ${w}w`).join(', ');

// Links no formato da Shopify (shopify://products/x) viram URLs da loja.
export function link(u) {
  if (!u) return '';
  const m = /^shopify:\/\/(products|collections|pages|blogs)\/(.+)$/.exec(u);
  return m ? `/${m[1]}/${m[2]}` : u;
}

export const strip = (h) => String(h || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
export const resumo = (h, n = 160) => { const t = strip(h); return t.length > n ? t.slice(0, n - 1).replace(/\s+\S*$/, '') + '…' : t; };

// Rabisco que a Concept desenha embaixo do <em> dos títulos.
const SCRIBBLES = {
  'squiggle-underline': '<svg class="scribble" viewBox="0 0 300 30" preserveAspectRatio="none" aria-hidden="true"><path d="M3 21c40-9 64-12 83-6 14 5-8 13 6 9 30-9 54-15 78-11 20 3 6 13 26 9 30-7 60-12 101-10" fill="none" stroke="currentColor" stroke-width="7" stroke-linecap="round"/></svg>',
  'basic-underline': '<svg class="scribble" viewBox="0 0 300 20" preserveAspectRatio="none" aria-hidden="true"><path d="M4 14c70-8 160-11 292-6" fill="none" stroke="currentColor" stroke-width="7" stroke-linecap="round"/></svg>',
  circle: '<svg class="scribble scribble--circle" viewBox="0 0 300 120" preserveAspectRatio="none" aria-hidden="true"><path d="M150 8C70 8 8 30 8 62s64 52 146 50 138-26 138-54S230 6 130 12" fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round"/></svg>',
};
export function heading(html, cfg = {}) {
  if (!html) return '';
  const tipo = cfg.highlighted_text || 'none';
  return String(html).replace(/<em>(.*?)<\/em>/g, (_, t) => {
    if (tipo === 'scribble') return `<em class="hl hl--scribble">${t}${SCRIBBLES[cfg.highlighted_scribble] || SCRIBBLES['squiggle-underline']}</em>`;
    if (tipo === 'text') return `<em class="hl hl--text">${t}</em>`;
    return `<em>${t}</em>`;
  });
}

export const titleSize = (s) => ({ 'title-lg tracking-heading': 'title-lg', 'title-lg': 'title-lg', 'title-md': 'title-md', 'title-sm': 'title-sm' }[s] || 'title-md');

// Variáveis de cor por seção, no mesmo esquema da Concept (rgb separado por espaço).
export function rgb(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return `${(n >> 16) & 255} ${(n >> 8) & 255} ${n & 255}`;
}
export function secVars(c = {}) {
  const v = [];
  if (rgb(c.color_text)) v.push(`--color-foreground:${rgb(c.color_text)}`);
  if (rgb(c.color_background)) v.push(`--color-background:${rgb(c.color_background)}`);
  if (rgb(c.color_highlight)) v.push(`--color-highlight:${rgb(c.color_highlight)}`);
  if (rgb(c.color_button_text)) v.push(`--color-button-text:${rgb(c.color_button_text)}`);
  if (rgb(c.color_button_background)) v.push(`--color-button-background:${rgb(c.color_button_background)}`);
  if (c.padding_top != null) v.push(`--pt:${c.padding_top}px`);
  if (c.padding_bottom != null) v.push(`--pb:${c.padding_bottom}px`);
  return v.join(';');
}
export const temFundo = (c = {}) => !!rgb(c.color_background) && c.color_background.toLowerCase() !== '#ffffff';

export const icon = {
  arrowR: '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>',
  chevL: '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 18l-6-6 6-6"/></svg>',
  chevR: '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>',
  menu: '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><path d="M3 6h18M3 12h10M3 18h18"/></svg>',
  search: '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>',
  user: '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="7" r="4"/><path d="M4 21v-1a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v1"/></svg>',
  cart: '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 3h2.2l2.4 11.2a2 2 0 0 0 2 1.6h8.9a2 2 0 0 0 2-1.5L21 7H5.4"/><circle cx="9" cy="20" r="1.3"/><circle cx="17" cy="20" r="1.3"/></svg>',
  close: '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>',
  star: '<svg class="icon icon-star" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2.5l2.9 6.1 6.6.8-4.9 4.6 1.3 6.6L12 17.3l-5.9 3.3 1.3-6.6L2.5 9.4l6.6-.8z"/></svg>',
  lock: '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>',
  truck: '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M1 4h13v12H1zM14 8h4l3 3v5h-7"/><circle cx="5.5" cy="18" r="2"/><circle cx="17.5" cy="18" r="2"/></svg>',
  home: '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 11 12 3l9 8v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/></svg>',
  filter: '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><path d="M3 7h10M17 7h4M3 17h4M11 17h10"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/></svg>',
  play: '<svg class="icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>',
  pause: '<svg class="icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 5h3v14H7zM14 5h3v14h-3z"/></svg>',
  blog: '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true"><rect x="4" y="3" width="13" height="18" rx="2"/><path d="M8 8h5M8 12h5M8 16h3M17 7h3v12a2 2 0 0 1-2 2"/></svg>',
  facebook: '<svg class="icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M9.03 23V13H5.67V9h3.36V6.08C9.03 2.66 11.1.8 14.13.8c1.45 0 2.7.1 3.06.16v3.55h-2.1c-1.65 0-1.98.79-1.98 1.94V9H17l-.5 4h-3.37v10z"/></svg>',
  instagram: '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><rect x="2.5" y="2.5" width="19" height="19" rx="5.5"/><circle cx="12" cy="12" r="4.4"/><circle cx="17.6" cy="6.4" r="1" fill="currentColor"/></svg>',
  youtube: '<svg class="icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M23.5 7.2s-.2-1.7-1-2.4c-.9-1-1.9-1-2.4-1C16.8 3.5 12 3.5 12 3.5s-4.8 0-8.1.3c-.5 0-1.5.1-2.4 1-.7.7-1 2.4-1 2.4S.2 9.1.2 11v1.8c0 1.9.3 3.8.3 3.8s.2 1.7 1 2.4c.9 1 2.1.9 2.6 1 1.9.2 7.9.3 7.9.3s4.8 0 8.1-.3c.5-.1 1.5-.1 2.4-1 .7-.7 1-2.4 1-2.4s.2-1.9.2-3.8V11c0-1.9-.2-3.8-.2-3.8zM9.6 15V8.3l6.4 3.4z"/></svg>',
  tiktok: '<svg class="icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M16.6 1h-3.7v14.6a3.1 3.1 0 1 1-2.2-3V8.8a6.9 6.9 0 1 0 5.9 6.8V8.2a8.8 8.8 0 0 0 5.2 1.7V6.2A5.2 5.2 0 0 1 16.6 1z"/></svg>',
  whatsapp: '<svg class="icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm5.3 14.1c-.2.6-1.3 1.2-1.8 1.2-.5.1-1 .1-1.7-.1a15 15 0 0 1-1.5-.6 12 12 0 0 1-4.6-4c-.3-.5-1-1.5-1-2.8s.7-2 1-2.3c.2-.2.5-.3.7-.3h.5c.2 0 .4 0 .6.5l.8 2c.1.1.1.3 0 .5l-.3.5-.4.4c-.1.2-.3.3-.1.6.2.3.8 1.3 1.7 2.1 1.2 1 2.1 1.4 2.4 1.5.3.2.5.1.6 0l.9-1c.2-.3.4-.2.6-.1l1.9.9c.3.1.5.2.5.3.1.1.1.6-.1 1.2z"/></svg>',
  telegram: '<svg class="icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M21.9 4.3 18.7 19.4c-.2 1-.9 1.3-1.7.8l-4.8-3.6-2.3 2.2c-.3.3-.5.5-1 .5l.3-4.9 8.9-8c.4-.3-.1-.5-.6-.2L6.5 13.1 1.8 11.6c-1-.3-1-1 .2-1.5L20.5 3c.9-.3 1.6.2 1.4 1.3z"/></svg>',
};
