// Utilidades: dinheiro, datas, ids, texto, CSV, OFX.
export const uid = () => (crypto.randomUUID ? crypto.randomUUID() : 'id-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10));

const fmtBRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const fmtNum = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export function money(v, { sign = false, compact = false } = {}) {
  v = Number(v) || 0;
  if (compact && Math.abs(v) >= 1000) {
    const abs = Math.abs(v);
    const s = abs >= 1e6 ? (abs / 1e6).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + ' mi' : (abs / 1e3).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + ' mil';
    return (v < 0 ? '-' : sign && v > 0 ? '+' : '') + 'R$ ' + s;
  }
  const s = fmtBRL.format(Math.abs(v));
  return (v < 0 ? '-' : sign && v > 0 ? '+' : '') + s;
}
export function num(v) { return fmtNum.format(Number(v) || 0); }
export function round2(v) { return Math.round((Number(v) || 0) * 100) / 100; }
export function parseMoney(s) {
  if (typeof s === 'number') return s;
  s = String(s || '').trim();
  if (!s) return 0;
  const neg = /^-|\(/.test(s);
  s = s.replace(/[^\d,.]/g, '');
  if (s.includes(',') && s.includes('.')) s = s.replace(/\./g, '').replace(',', '.');
  else if (s.includes(',')) s = s.replace(',', '.');
  const v = parseFloat(s) || 0;
  return neg ? -v : v;
}
export function pct(v, total) { return total ? (v / total) * 100 : 0; }

// ---- datas (sempre 'YYYY-MM-DD' internamente, sem fuso) ----
export function today() { return toISO(new Date()); }
export function toISO(d) {
  if (typeof d === 'string') return d.slice(0, 10);
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
export function fromISO(s) { const [y, m, d] = String(s).slice(0, 10).split('-').map(Number); return new Date(y, m - 1, d || 1); }
export function addDays(iso, n) { const d = fromISO(iso); d.setDate(d.getDate() + n); return toISO(d); }
export function addMonths(iso, n, keepDay = true) {
  const d = fromISO(iso); const day = d.getDate();
  d.setDate(1); d.setMonth(d.getMonth() + n);
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(keepDay ? Math.min(day, last) : 1);
  return toISO(d);
}
export function monthKey(iso) { return String(iso).slice(0, 7); }
export function monthStart(iso) { return String(iso).slice(0, 7) + '-01'; }
export function monthEnd(iso) { const d = fromISO(iso); return toISO(new Date(d.getFullYear(), d.getMonth() + 1, 0)); }
export function daysBetween(a, b) { return Math.round((fromISO(b) - fromISO(a)) / 86400000); }
export function fmtDate(iso, opts = {}) {
  if (!iso) return '';
  const d = fromISO(iso);
  if (opts.long) return d.toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' });
  if (opts.short) return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }).replace('.', '');
  if (opts.weekday) return d.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short' }).replace(/\./g, '');
  return d.toLocaleDateString('pt-BR');
}
export function fmtMonth(iso, long = false) {
  const d = fromISO(monthStart(iso));
  const s = d.toLocaleDateString('pt-BR', { month: long ? 'long' : 'short', year: 'numeric' }).replace('.', '');
  return s.charAt(0).toUpperCase() + s.slice(1);
}
export function relDate(iso) {
  const n = daysBetween(today(), iso);
  if (n === 0) return 'Hoje';
  if (n === 1) return 'Amanhã';
  if (n === -1) return 'Ontem';
  if (n < 0) return `${-n} dias atrás`;
  if (n < 7) return `Em ${n} dias`;
  return fmtDate(iso, { weekday: true });
}
export function fmtDateTime(iso) { if (!iso) return ''; const d = new Date(iso); return d.toLocaleDateString('pt-BR') + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }); }

// ---- texto ----
export function norm(s) { return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim(); }
export function initials(name) {
  const p = String(name || '').replace(/[^\p{L}\p{N} ]/gu, '').trim().split(/\s+/).filter(Boolean);
  if (!p.length) return '?';
  return (p.length === 1 ? p[0].slice(0, 2) : p[0][0] + p[p.length - 1][0]).toUpperCase();
}
export function esc(s) { return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
export function cap(s) { s = String(s || ''); return s.charAt(0).toUpperCase() + s.slice(1); }
export function plural(n, s, p) { return n === 1 ? `${n} ${s}` : `${n} ${p || s + 's'}`; }
export function fmtDoc(doc) {
  const d = String(doc || '').replace(/\D/g, '');
  if (d.length === 11) return d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
  if (d.length === 14) return d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
  return doc || '';
}
export function hashColor(s) {
  const pal = ['#2F6BE0', '#17924A', '#B26A00', '#8E44AD', '#E8262C', '#0E7C6B', '#C2185B', '#5D4037', '#1976D2', '#F57C00'];
  let h = 0; for (const c of String(s || '')) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return pal[h % pal.length];
}
export function debounce(fn, ms = 200) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }
export function groupBy(arr, fn) { const m = new Map(); for (const x of arr) { const k = fn(x); if (!m.has(k)) m.set(k, []); m.get(k).push(x); } return m; }
export function sum(arr, fn = x => x) { let s = 0; for (const x of arr) s += Number(fn(x)) || 0; return round2(s); }
export function sortBy(arr, fn, desc = false) { return [...arr].sort((a, b) => { const x = fn(a), y = fn(b); return (x > y ? 1 : x < y ? -1 : 0) * (desc ? -1 : 1); }); }
export function clone(o) { return JSON.parse(JSON.stringify(o)); }

// ---- exportação ----
export function toCSV(rows, cols) {
  const escCell = v => { v = v == null ? '' : String(v); return /[";\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
  const head = cols.map(c => escCell(c.label)).join(';');
  const body = rows.map(r => cols.map(c => escCell(typeof c.get === 'function' ? c.get(r) : r[c.key])).join(';'));
  return '﻿' + [head, ...body].join('\n');
}
export function download(name, content, type = 'text/csv;charset=utf-8') {
  const blob = content instanceof Blob ? content : new Blob([content], { type });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}
export function readFile(file, as = 'text') {
  return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; as === 'text' ? r.readAsText(file, 'utf-8') : r.readAsDataURL(file); });
}

// ---- OFX (extrato bancário) ----
export function parseOFX(text) {
  const items = [];
  const body = text.replace(/\r/g, '');
  const re = /<STMTTRN>([\s\S]*?)<\/STMTTRN>/gi; let m;
  const get = (blk, tag) => { const r = new RegExp('<' + tag + '>([^<\\n]*)', 'i').exec(blk); return r ? r[1].trim() : ''; };
  while ((m = re.exec(body))) {
    const b = m[1];
    const dt = get(b, 'DTPOSTED').slice(0, 8);
    const data = dt ? `${dt.slice(0, 4)}-${dt.slice(4, 6)}-${dt.slice(6, 8)}` : '';
    const valor = parseFloat(get(b, 'TRNAMT').replace(',', '.')) || 0;
    items.push({ data, valor, descricao: get(b, 'MEMO') || get(b, 'NAME') || get(b, 'TRNTYPE'), fitid: get(b, 'FITID') || `${data}-${valor}-${items.length}` });
  }
  const acct = /<ACCTID>([^<\n]*)/i.exec(body); const bank = /<BANKID>([^<\n]*)/i.exec(body);
  const bal = /<BALAMT>([^<\n]*)/i.exec(body);
  return { items, conta: acct ? acct[1].trim() : '', banco: bank ? bank[1].trim() : '', saldo: bal ? parseFloat(bal[1].replace(',', '.')) : null };
}
// CSV genérico de extrato: tenta achar colunas data / descrição / valor
export function parseCSVExtrato(text) {
  const lines = text.replace(/\r/g, '').split('\n').filter(l => l.trim());
  if (!lines.length) return { items: [] };
  const sep = (lines[0].match(/;/g) || []).length >= (lines[0].match(/,/g) || []).length ? ';' : ',';
  const split = l => { const out = []; let cur = '', q = false; for (const c of l) { if (c === '"') q = !q; else if (c === sep && !q) { out.push(cur); cur = ''; } else cur += c; } out.push(cur); return out.map(s => s.trim()); };
  const head = split(lines[0]).map(norm);
  const idx = (names) => head.findIndex(h => names.some(n => h.includes(n)));
  const iD = idx(['data', 'date']), iDesc = idx(['descri', 'histor', 'memo', 'lancamento', 'title']), iV = idx(['valor', 'amount', 'value']);
  const iCred = idx(['credito', 'entrada']), iDeb = idx(['debito', 'saida']);
  const items = [];
  for (const l of lines.slice(1)) {
    const c = split(l); if (c.length < 2) continue;
    let data = c[iD] || ''; const dm = /^(\d{2})[\/-](\d{2})[\/-](\d{4})/.exec(data); if (dm) data = `${dm[3]}-${dm[2]}-${dm[1]}`; else data = data.slice(0, 10);
    let valor = iV >= 0 ? parseMoney(c[iV]) : (parseMoney(c[iCred]) || 0) - (parseMoney(c[iDeb]) || 0);
    if (!data || !valor) continue;
    items.push({ data, valor, descricao: c[iDesc] || '', fitid: `${data}-${valor}-${items.length}` });
  }
  return { items };
}
