// Regras de negócio: status, saldos, fluxo de caixa, DRE, parcelas, recorrência, conciliação.
import { db } from './db.js';
import { today, addDays, addMonths, monthKey, monthStart, monthEnd, round2, sum, uid, norm, daysBetween, toISO, fromISO } from './utils.js';
import { GRUPOS } from './seed.js';

export const FORMAS = [
  { id: 'pix', nome: 'PIX', icone: 'ti-bolt' }, { id: 'boleto', nome: 'Boleto', icone: 'ti-barcode' }, { id: 'cartao', nome: 'Cartão', icone: 'ti-credit-card' },
  { id: 'ted', nome: 'TED / DOC', icone: 'ti-building-bank' }, { id: 'debito', nome: 'Débito automático', icone: 'ti-refresh' }, { id: 'dinheiro', nome: 'Dinheiro', icone: 'ti-cash' }, { id: 'outro', nome: 'Outro', icone: 'ti-dots' },
];
export const FORMA = Object.fromEntries(FORMAS.map(f => [f.id, f]));
export const ORIGENS = { manual: 'Manual', pagarme: 'Pagar.me', shopify: 'Shopify', importacao: 'Importação', nibo: 'Nibo', extrato: 'Extrato', recorrencia: 'Recorrência' };

export function principalBaixa(b) { return round2((Number(b.valor) || 0) - (Number(b.juros) || 0) - (Number(b.multa) || 0) + (Number(b.desconto) || 0)); }
export function liquidado(l) { return sum(l.baixas || [], principalBaixa); }
export function emAberto(l) { return Math.max(0, round2((Number(l.valor) || 0) - liquidado(l))); }
export function statusOf(l, ref = today()) {
  if (l.status === 'cancelado') return 'cancelado';
  if (l.tipo === 'transferencia') return 'pago';
  const liq = liquidado(l), v = Number(l.valor) || 0;
  if (liq >= v - 0.005 && v > 0) return 'pago';
  if (liq > 0.005) return l.vencimento < ref ? 'atrasado' : 'parcial';
  return l.vencimento < ref ? 'atrasado' : 'aberto';
}
export const STATUS = {
  aberto:    { nome: 'Em aberto', cor: 'blue' },
  parcial:   { nome: 'Parcial',   cor: 'amber' },
  atrasado:  { nome: 'Atrasado',  cor: 'red' },
  pago:      { nome: 'Pago',      cor: 'green' },
  cancelado: { nome: 'Cancelado', cor: 'gray' },
};
export function statusNome(l) { const s = statusOf(l); if (s === 'pago' && l.tipo === 'receber') return 'Recebido'; return STATUS[s].nome; }
export function dataPagamento(l) { const b = l.baixas || []; return b.length ? b[b.length - 1].data : null; }

// ---------- contexto da empresa ----------
export function ctx(empresaId) {
  const c = {
    contas: db.of('contas', empresaId), categorias: db.of('categorias', empresaId), centros: db.of('centros', empresaId),
    contatos: db.of('contatos', empresaId), tags: db.of('tags', empresaId), lancamentos: db.of('lancamentos', empresaId), extrato: db.of('extrato_itens', empresaId),
  };
  c.conta = id => db.get('contas', id); c.cat = id => db.get('categorias', id); c.contato = id => db.get('contatos', id); c.centro = id => db.get('centros', id);
  return c;
}

// ---------- movimentos realizados por conta ----------
// devolve [{data, valor(+/-), descricao, lancamento, baixa, tipo}] ordenado por data
export function movimentos(empresaId, contaId, de = null, ate = null) {
  const out = [];
  const cta = db.get('contas', contaId); const ini = cta?.data_saldo_inicial || null;
  if (ini && (!de || de < ini)) de = ini;
  for (const l of db.of('lancamentos', empresaId)) {
    if (l.status === 'cancelado') continue;
    if (l.tipo === 'transferencia') {
      const d = l.vencimento;
      if (l.conta_id === contaId) out.push({ data: d, valor: -Number(l.valor), descricao: l.descricao || 'Transferência enviada', lancamento: l, tipo: 'transferencia', contra: l.conta_destino_id });
      if (l.conta_destino_id === contaId) out.push({ data: d, valor: Number(l.valor), descricao: l.descricao || 'Transferência recebida', lancamento: l, tipo: 'transferencia', contra: l.conta_id });
      continue;
    }
    for (const b of l.baixas || []) {
      if (b.conta_id !== contaId) continue;
      out.push({ data: b.data, valor: l.tipo === 'receber' ? Number(b.valor) : -Number(b.valor), descricao: l.descricao, lancamento: l, baixa: b, tipo: l.tipo });
    }
  }
  return out.filter(m => (!de || m.data >= de) && (!ate || m.data <= ate)).sort((a, b) => a.data < b.data ? -1 : a.data > b.data ? 1 : 0);
}
export function saldoConta(empresaId, contaId, ate = today()) {
  const c = db.get('contas', contaId); if (!c) return 0;
  const ini = c.data_saldo_inicial || '0000-00-00';
  return round2((Number(c.saldo_inicial) || 0) + sum(movimentos(empresaId, contaId, ini, ate), m => m.valor));
}
export function saldoProjetado(empresaId, contaId, ate) {
  let s = saldoConta(empresaId, contaId, today());
  for (const l of db.of('lancamentos', empresaId)) {
    if (l.tipo === 'transferencia' || l.conta_id !== contaId) continue;
    const st = statusOf(l); if (st === 'pago' || st === 'cancelado') continue;
    if (l.vencimento <= ate) s += (l.tipo === 'receber' ? 1 : -1) * emAberto(l);
  }
  return round2(s);
}
export function saldoTotal(empresaId, { incluirCartao = false, ate = today() } = {}) {
  return round2(sum(db.of('contas', empresaId).filter(c => !c.arquivada && (incluirCartao || c.tipo !== 'cartao')), c => saldoConta(empresaId, c.id, ate)));
}

// ---------- fluxo de caixa ----------
// granularidade: 'dia' | 'semana' | 'mes'
export function fluxoCaixa(empresaId, de, ate, gran = 'dia', { contaId = null } = {}) {
  const contas = db.of('contas', empresaId).filter(c => !c.arquivada && c.tipo !== 'cartao' && (!contaId || c.id === contaId));
  const keyOf = d => gran === 'mes' ? monthKey(d) : gran === 'semana' ? weekKey(d) : d;
  const buckets = new Map();
  const bucket = k => { if (!buckets.has(k)) buckets.set(k, { key: k, realIn: 0, realOut: 0, prevIn: 0, prevOut: 0, atrasadoIn: 0, atrasadoOut: 0 }); return buckets.get(k); };
  // gera chaves vazias no intervalo
  for (let d = de; d <= ate; d = gran === 'mes' ? addMonths(d, 1, false) : addDays(d, gran === 'semana' ? 7 : 1)) bucket(keyOf(d));
  const t = today();
  for (const l of db.of('lancamentos', empresaId)) {
    if (l.status === 'cancelado') continue;
    if (l.tipo === 'transferencia') { if (contaId) { if (l.conta_id === contaId && l.vencimento >= de && l.vencimento <= ate) bucket(keyOf(l.vencimento)).realOut += Number(l.valor); if (l.conta_destino_id === contaId && l.vencimento >= de && l.vencimento <= ate) bucket(keyOf(l.vencimento)).realIn += Number(l.valor); } continue; }
    if (contaId && l.conta_id !== contaId && !(l.baixas || []).some(b => b.conta_id === contaId)) continue;
    for (const b of l.baixas || []) { if (b.data >= de && b.data <= ate && (!contaId || b.conta_id === contaId)) { const bk = bucket(keyOf(b.data)); if (l.tipo === 'receber') bk.realIn += Number(b.valor); else bk.realOut += Number(b.valor); } }
    const ab = emAberto(l);
    if (ab > 0) {
      const d = l.vencimento < t ? t : l.vencimento; // atrasado cai em "hoje"
      if (d >= de && d <= ate) { const bk = bucket(keyOf(d)); if (l.tipo === 'receber') { bk.prevIn += ab; if (l.vencimento < t) bk.atrasadoIn += ab; } else { bk.prevOut += ab; if (l.vencimento < t) bk.atrasadoOut += ab; } }
    }
  }
  const rows = [...buckets.values()].sort((a, b) => a.key < b.key ? -1 : 1);
  let saldo = round2(sum(contas, c => saldoConta(empresaId, c.id, addDays(de, -1))));
  for (const r of rows) { for (const k of ['realIn', 'realOut', 'prevIn', 'prevOut', 'atrasadoIn', 'atrasadoOut']) r[k] = round2(r[k]); r.saldoInicial = saldo; saldo = round2(saldo + r.realIn - r.realOut + r.prevIn - r.prevOut); r.saldoFinal = saldo; }
  return { rows, saldoInicial: rows[0]?.saldoInicial ?? saldo };
}
export function weekKey(iso) { const d = fromISO(iso); const day = (d.getDay() + 6) % 7; d.setDate(d.getDate() - day); return toISO(d); }

// ---------- DRE ----------
// regime: 'competencia' (valor por competência, com rateio de categorias) | 'caixa' (baixas por data)
export function dre(empresaId, ano, regime = 'competencia', { centroId = null } = {}) {
  const cats = db.of('categorias', empresaId);
  const meses = Array.from({ length: 12 }, (_, i) => `${ano}-${String(i + 1).padStart(2, '0')}`);
  const cell = new Map(); // catId -> [12]
  const add = (catId, mk, v) => { if (!mk.startsWith(String(ano))) return; const i = Number(mk.slice(5, 7)) - 1; if (!cell.has(catId)) cell.set(catId, Array(12).fill(0)); cell.get(catId)[i] = round2(cell.get(catId)[i] + v); };
  for (const l of db.of('lancamentos', empresaId)) {
    if (l.tipo === 'transferencia' || l.status === 'cancelado') continue;
    let fator = 1;
    if (centroId) { const rc = l.rateio_centros || []; const r = rc.find(x => x.centro_id === centroId); if (!r) continue; fator = (Number(r.percent) || 0) / 100; }
    const splits = (l.rateio_categorias && l.rateio_categorias.length) ? l.rateio_categorias.map(r => ({ cat: r.categoria_id, valor: Number(r.valor) || 0 })) : [{ cat: l.categoria_id, valor: Number(l.valor) || 0 }];
    const total = sum(splits, s => s.valor) || Number(l.valor) || 1;
    if (regime === 'competencia') {
      const mk = monthKey(l.competencia || l.vencimento);
      for (const s of splits) add(s.cat, mk, s.valor * fator);
    } else {
      for (const b of l.baixas || []) { const p = principalBaixa(b); for (const s of splits) add(s.cat, monthKey(b.data), p * (s.valor / total) * fator); }
    }
  }
  // monta árvore grupo → subgrupo → categoria
  const grupos = GRUPOS.map(g => ({ ...g, subgrupos: [], totais: Array(12).fill(0) }));
  for (const c of cats) {
    const g = grupos.find(x => x.id === Number(c.grupo)); if (!g) continue;
    const vals = cell.get(c.id) || Array(12).fill(0);
    if (!vals.some(v => v)) continue;
    const signed = vals.map(v => c.tipo === 'in' ? v : -v);
    let sg = g.subgrupos.find(s => s.nome === (c.subgrupo || 'Geral')); if (!sg) { sg = { nome: c.subgrupo || 'Geral', categorias: [], totais: Array(12).fill(0) }; g.subgrupos.push(sg); }
    sg.categorias.push({ cat: c, valores: signed, total: round2(sum(signed)) });
    for (let i = 0; i < 12; i++) { sg.totais[i] = round2(sg.totais[i] + signed[i]); g.totais[i] = round2(g.totais[i] + signed[i]); }
  }
  for (const g of grupos) { g.total = round2(sum(g.totais)); for (const s of g.subgrupos) s.total = round2(sum(s.totais)); s => s.categorias.sort((a, b) => a.cat.ordem - b.cat.ordem); }
  const linha = (nome, arr, tipo) => ({ nome, totais: arr, total: round2(sum(arr)), tipo });
  const G = id => grupos.find(g => g.id === id).totais;
  const soma = (...ids) => Array.from({ length: 12 }, (_, i) => round2(ids.reduce((s, id) => s + G(id)[i], 0)));
  const resumo = [
    linha('Receita líquida', G(1), 'sub'), linha('Lucro bruto', soma(1, 2), 'sub'), linha('Resultado operacional', soma(1, 2, 3), 'sub'),
    linha('Resultado do período', soma(1, 2, 3, 4, 5), 'final'),
  ];
  return { meses, grupos, resumo, receita: G(1) };
}

// ---------- parcelas e recorrência ----------
export function gerarParcelas(base, n, { modo = 'dividir', intervalo = 'mensal', primeiro = null } = {}) {
  const grupo = uid(); const out = [];
  const total = round2(base.valor); const parcela = modo === 'dividir' ? Math.floor((total / n) * 100) / 100 : total;
  let acum = 0;
  for (let i = 0; i < n; i++) {
    const venc = intervalo === 'semanal' ? addDays(primeiro || base.vencimento, 7 * i) : intervalo === 'quinzenal' ? addDays(primeiro || base.vencimento, 15 * i) : addMonths(primeiro || base.vencimento, i);
    let v = parcela; if (modo === 'dividir' && i === n - 1) v = round2(total - acum); acum = round2(acum + v);
    out.push({ ...base, id: uid(), valor: v, vencimento: venc, competencia: base.competencia && i === 0 ? base.competencia : monthStart(venc), parcela_num: i + 1, parcela_total: n, grupo_parcelas_id: grupo, baixas: [] });
  }
  return out;
}
export function gerarRecorrencia(base, rec) {
  // rec: {freq: 'semanal'|'quinzenal'|'mensal'|'bimestral'|'trimestral'|'semestral'|'anual', vezes?: n, ate?: iso}
  const grupo = uid(); const out = []; const max = rec.vezes ? Number(rec.vezes) : 60;
  const step = { semanal: d => addDays(d, 7), quinzenal: d => addDays(d, 15), mensal: d => addMonths(d, 1), bimestral: d => addMonths(d, 2), trimestral: d => addMonths(d, 3), semestral: d => addMonths(d, 6), anual: d => addMonths(d, 12) }[rec.freq] || (d => addMonths(d, 1));
  let venc = base.vencimento; const diaBase = fromISO(base.vencimento).getDate();
  for (let i = 0; i < max; i++) {
    if (rec.ate && venc > rec.ate) break;
    out.push({ ...base, id: uid(), vencimento: venc, competencia: i === 0 && base.competencia ? base.competencia : monthStart(venc), recorrencia_id: grupo, recorrencia: { ...rec, n: i + 1 }, baixas: [] });
    // pra mensal e derivados, preserva o dia original (ex.: 31 → 28/30 → 31)
    if (['mensal', 'bimestral', 'trimestral', 'semestral', 'anual'].includes(rec.freq)) { const m = { mensal: 1, bimestral: 2, trimestral: 3, semestral: 6, anual: 12 }[rec.freq]; const d = fromISO(monthStart(venc)); d.setMonth(d.getMonth() + m); const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate(); d.setDate(Math.min(diaBase, last)); venc = toISO(d); } else venc = step(venc);
  }
  return out;
}

// ---------- filtros ----------
export function filtrar(lancs, f = {}) {
  const q = f.q ? norm(f.q) : '';
  const t = today();
  return lancs.filter(l => {
    if (f.tipo && l.tipo !== f.tipo) return false;
    if (f.de && l.vencimento < f.de) return false;
    if (f.ate && l.vencimento > f.ate) return false;
    if (f.status && f.status.length) { const s = statusOf(l, t); if (!f.status.includes(s)) return false; }
    if (f.conta && l.conta_id !== f.conta && !(l.baixas || []).some(b => b.conta_id === f.conta)) return false;
    if (f.categoria && l.categoria_id !== f.categoria && !(l.rateio_categorias || []).some(r => r.categoria_id === f.categoria)) return false;
    if (f.contato && l.contato_id !== f.contato) return false;
    if (f.centro && !(l.rateio_centros || []).some(r => r.centro_id === f.centro)) return false;
    if (f.tag && !(l.tags || []).includes(f.tag)) return false;
    if (f.origem && (l.origem || 'manual') !== f.origem) return false;
    if (q) { const c = l.contato_id ? db.get('contatos', l.contato_id) : null; const cat = db.get('categorias', l.categoria_id); const hay = norm([l.descricao, c?.nome, cat?.nome, l.referencia, l.observacoes, String(l.valor), (l.tags || []).join(' ')].join(' ')); if (!hay.includes(q)) return false; }
    return true;
  });
}

// ---------- conciliação ----------
export function sugerirConciliacao(item, empresaId) {
  // item: {data, valor, descricao, conta_id}. Procura lançamentos abertos/pagos da mesma conta, valor igual, data ±5 dias.
  const abs = Math.abs(item.valor); const tipo = item.valor >= 0 ? 'receber' : 'pagar';
  const cands = [];
  for (const l of db.of('lancamentos', empresaId)) {
    if (l.status === 'cancelado' || l.conciliado_fitid) continue;
    if (l.tipo === 'transferencia') {
      if ((item.valor < 0 && l.conta_id === item.conta_id) || (item.valor > 0 && l.conta_destino_id === item.conta_id)) { if (Math.abs(Number(l.valor) - abs) < 0.01) cands.push({ l, score: 90 - Math.abs(daysBetween(l.vencimento, item.data)) * 5 }); }
      continue;
    }
    if (l.tipo !== tipo) continue;
    const contaOk = l.conta_id === item.conta_id || (l.baixas || []).some(b => b.conta_id === item.conta_id);
    const vOk = Math.abs(Number(l.valor) - abs) < 0.01 || Math.abs(emAberto(l) - abs) < 0.01 || (l.baixas || []).some(b => Math.abs(Number(b.valor) - abs) < 0.01);
    if (!vOk) continue;
    const dd = Math.abs(daysBetween(l.vencimento, item.data));
    if (dd > 10) continue;
    let score = 100 - dd * 6 - (contaOk ? 0 : 20);
    const w = norm(item.descricao).split(/\W+/).filter(x => x.length > 3); const hay = norm(l.descricao + ' ' + (db.get('contatos', l.contato_id)?.nome || ''));
    for (const x of w) if (hay.includes(x)) score += 8;
    cands.push({ l, score });
  }
  return cands.sort((a, b) => b.score - a.score).slice(0, 5);
}

// ---------- resumos ----------
export function resumoPeriodo(lancs) {
  const r = { total: 0, pago: 0, aberto: 0, atrasado: 0, n: lancs.length };
  for (const l of lancs) { if (l.status === 'cancelado') continue; r.total += Number(l.valor) || 0; r.pago += liquidado(l); const ab = emAberto(l); if (statusOf(l) === 'atrasado') r.atrasado += ab; else r.aberto += ab; }
  for (const k in r) r[k] = round2(r[k]);
  return r;
}
export function topPor(lancs, keyFn, { limite = 8 } = {}) {
  const m = new Map();
  for (const l of lancs) { if (l.status === 'cancelado') continue; const k = keyFn(l); m.set(k, round2((m.get(k) || 0) + (Number(l.valor) || 0))); }
  return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, limite);
}
