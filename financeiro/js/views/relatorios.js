// Relatórios: por categoria, por contato, por centro de custo, evolução mensal, comparativo, inadimplência.
import { app } from '../app.js';
import { prefs } from '../db.js';
import { h, icon, segmented, combobox, catIcon, avatar, bankIcon, emptyState, on, moneyEl } from '../ui.js';
import { money, today, addMonths, monthStart, monthEnd, fmtDate, fmtMonth, esc, round2, sum, toCSV, download, groupBy, daysBetween, monthKey } from '../utils.js';
import { filtrar, statusOf, emAberto, liquidado, topPor, principalBaixa } from '../model.js';
import { donut, barsInOut } from '../charts.js';
import { abrirDetalhe } from './form-lancamento.js';

const S = Object.assign({ tipo: 'categoria', de: monthStart(today()), ate: monthEnd(today()), fluxo: 'pagar', regime: 'competencia' }, prefs.get('rel') || {});
const TIPOS = [{ id: 'categoria', label: 'Por categoria', icon: 'ti-category' }, { id: 'contato', label: 'Por contato', icon: 'ti-users' }, { id: 'centro', label: 'Por centro de custo', icon: 'ti-target' }, { id: 'evolucao', label: 'Evolução mensal', icon: 'ti-chart-bar' }, { id: 'inadimplencia', label: 'Atrasados', icon: 'ti-alert-triangle' }, { id: 'lancamentos', label: 'Lançamentos', icon: 'ti-list-details' }];

export function render(root, { params = {} } = {}) {
  const E = app.empresaId; const C = app.ctx(); const save = () => prefs.set('rel', S);
  if (params.categoria) { S.tipo = 'lancamentos'; S.categoria = params.categoria; if (params.ano) { S.de = `${params.ano}-01-01`; S.ate = `${params.ano}-12-31`; } }
  const dataDe = l => S.regime === 'competencia' ? (l.competencia || l.vencimento) : l.vencimento;
  const base = C.lancamentos.filter(l => l.tipo !== 'transferencia' && l.status !== 'cancelado' && dataDe(l) >= S.de && dataDe(l) <= monthEnd(S.ate) && (S.tipo === 'evolucao' || S.tipo === 'inadimplencia' || l.tipo === S.fluxo));
  root.innerHTML = `<div class="page rel">
    <header class="ph"><div><h1>Relatórios</h1></div><div class="ph-a"><button class="btn ghost" data-export>${icon('ti-download')}</button><button class="btn ghost" data-print>${icon('ti-printer')}</button></div></header>
    <div class="rel-nav">${TIPOS.map(t => `<button class="rel-tab ${S.tipo === t.id ? 'on' : ''}" data-t="${t.id}">${icon(t.icon)}${t.label}</button>`).join('')}</div>
    <div class="toolbar" data-tb><div class="periodo"><button class="ibtn" data-prev>${icon('ti-chevron-left')}</button><span class="per-l">${labelPer()}</span><button class="ibtn" data-next>${icon('ti-chevron-right')}</button></div><label class="fld inl"><input class="inp sm" type="date" value="${S.de}" data-de></label><span class="muted">até</span><label class="fld inl"><input class="inp sm" type="date" value="${S.ate}" data-ate></label></div>
    <div data-body></div></div>`;
  const tb = root.querySelector('[data-tb]');
  if (!['evolucao', 'inadimplencia'].includes(S.tipo)) tb.appendChild(segmented([{ id: 'pagar', label: 'Despesas' }, { id: 'receber', label: 'Receitas' }], S.fluxo, v => { S.fluxo = v; save(); render(root); }));
  if (S.tipo !== 'inadimplencia') tb.appendChild(segmented([{ id: 'competencia', label: 'Competência' }, { id: 'vencimento', label: 'Vencimento' }], S.regime, v => { S.regime = v; save(); render(root); }));
  on(root, 'click', '.rel-tab', (e, b) => { S.tipo = b.dataset.t; S.categoria = null; save(); render(root); });
  root.querySelector('[data-prev]').onclick = () => { const m = addMonths(S.de, -1); S.de = m; S.ate = monthEnd(m); save(); render(root); };
  root.querySelector('[data-next]').onclick = () => { const m = addMonths(S.de, 1); S.de = m; S.ate = monthEnd(m); save(); render(root); };
  root.querySelector('[data-de]').onchange = e => { S.de = e.target.value; save(); render(root); };
  root.querySelector('[data-ate]').onchange = e => { S.ate = e.target.value; save(); render(root); };
  root.querySelector('[data-print]').onclick = () => window.print();
  const body = root.querySelector('[data-body]');
  const cores = ['#07388E', '#2F6BE0', '#E8262C', '#B26A00', '#8E44AD', '#0E7C6B', '#C2185B', '#1976D2', '#5D4037', '#8A94A8'];
  let exportRows = [], exportCols = [];

  if (S.tipo === 'categoria' || S.tipo === 'contato' || S.tipo === 'centro') {
    let agg;
    if (S.tipo === 'categoria') { const m = new Map(); for (const l of base) { const splits = l.rateio_categorias?.length ? l.rateio_categorias : [{ categoria_id: l.categoria_id, valor: l.valor }]; for (const s of splits) m.set(s.categoria_id, round2((m.get(s.categoria_id) || 0) + Number(s.valor))); } agg = [...m.entries()].map(([id, v]) => ({ id, nome: C.cat(id)?.nome || 'Sem categoria', sub: C.cat(id)?.subgrupo || '', icon: catIcon(C.cat(id), 32), valor: v, n: base.filter(l => l.categoria_id === id || (l.rateio_categorias || []).some(r => r.categoria_id === id)).length })); }
    else if (S.tipo === 'contato') { agg = topPor(base, l => l.contato_id || '', { limite: 999 }).map(([id, v]) => ({ id, nome: C.contato(id)?.nome || 'Sem contato', sub: '', icon: id ? avatar(C.contato(id)?.nome, 32) : avatar('?', 32, '#8A94A8'), valor: v, n: base.filter(l => (l.contato_id || '') === id).length })); }
    else { const m = new Map(); for (const l of base) { const rc = l.rateio_centros?.length ? l.rateio_centros : [{ centro_id: '', percent: 100 }]; for (const r of rc) m.set(r.centro_id, round2((m.get(r.centro_id) || 0) + Number(l.valor) * Number(r.percent) / 100)); } agg = [...m.entries()].map(([id, v]) => ({ id, nome: C.centro(id)?.nome || 'Sem centro de custo', sub: '', icon: `<span class="cicon" style="--s:32px;--c:${C.centro(id)?.cor || '#8A94A8'}">${icon('ti-target')}</span>`, valor: v, n: 0 })); }
    agg.sort((a, b) => b.valor - a.valor); const total = round2(sum(agg, a => a.valor));
    body.innerHTML = `<div class="grid2 rel-g"><div class="card"><div class="card-h"><h3>${S.fluxo === 'pagar' ? 'Despesas' : 'Receitas'} · ${money(total)}</h3></div><div class="donut-row big"><div class="donut-box" data-donut></div><div class="donut-legend" data-leg></div></div></div>
      <div class="card"><div class="card-h"><h3>Ranking</h3><span class="muted sm">${agg.length} itens</span></div><div class="rank">${agg.map((a, i) => `<div class="rank-r" data-id="${a.id}"><span class="rank-n">${i + 1}</span>${a.icon}<div class="rank-b"><div class="rank-t">${esc(a.nome)}</div><div class="rank-bar"><i style="width:${total ? a.valor / total * 100 : 0}%;background:${cores[i % cores.length]}"></i></div></div><div class="rank-v"><b>${money(a.valor)}</b><small>${total ? (a.valor / total * 100).toFixed(1) : 0}%${a.n ? ` · ${a.n} lanç.` : ''}</small></div></div>`).join('') || '<div class="muted pad">Sem dados no período.</div>'}</div></div></div>`;
    const top = agg.slice(0, 8).map((a, i) => ({ label: a.nome, value: a.valor, color: cores[i] })); const resto = round2(total - sum(top, x => x.value)); if (resto > 0) top.push({ label: 'Outros', value: resto, color: cores[9] });
    if (top.length) { requestAnimationFrame(() => donut(body.querySelector('[data-donut]'), top, { size: 200, thickness: 22, center: `<small>total</small><b>${money(total, { compact: true })}</b>` })); body.querySelector('[data-leg]').innerHTML = top.map(i => `<div class="dl"><i style="background:${i.color}"></i><span>${esc(i.label)}</span><b>${money(i.value)}</b></div>`).join(''); }
    body.querySelectorAll('.rank-r').forEach(r => r.onclick = () => { const key = S.tipo === 'categoria' ? 'categoria' : S.tipo === 'contato' ? 'contato' : 'centro'; S.categoria = S.contato = S.centro = null; S[key] = r.dataset.id || null; S.tipo = 'lancamentos'; save(); render(root); });
    exportRows = agg; exportCols = [{ label: 'Nome', key: 'nome' }, { label: 'Valor', get: a => String(a.valor).replace('.', ',') }, { label: '%', get: a => total ? (a.valor / total * 100).toFixed(1) : '0' }];
  }
  else if (S.tipo === 'evolucao') {
    const meses = []; for (let m = monthStart(S.de); m <= S.ate; m = addMonths(m, 1)) meses.push(m);
    if (meses.length < 3) { const m0 = addMonths(monthStart(S.ate), -11); meses.length = 0; for (let m = m0; m <= S.ate; m = addMonths(m, 1)) meses.push(m); }
    const all = C.lancamentos.filter(l => l.tipo !== 'transferencia' && l.status !== 'cancelado');
    const series = meses.map(m => { const k = monthKey(m); const ls = all.filter(l => monthKey(dataDe(l)) === k); const inn = round2(sum(ls.filter(l => l.tipo === 'receber'), l => l.valor)), out = round2(sum(ls.filter(l => l.tipo === 'pagar'), l => l.valor)); return { key: m, label: fmtMonth(m).slice(0, 3), title: fmtMonth(m, true), in: inn, out, res: round2(inn - out) }; });
    body.innerHTML = `<div class="card"><div class="card-h"><h3>Receitas × despesas por mês</h3></div><div class="chart-box" data-bars></div></div>
      <div class="card tbl-card"><table class="tbl"><thead><tr><th>Mês</th><th class="r">Receitas</th><th class="r">Despesas</th><th class="r">Resultado</th><th class="r">Margem</th><th class="r">Var. receita</th></tr></thead><tbody>${series.map((s, i) => { const prev = series[i - 1]; const v = prev && prev.in ? Math.round((s.in - prev.in) / prev.in * 100) : null; return `<tr><td>${s.title}</td><td class="r pos">${money(s.in)}</td><td class="r neg">${money(s.out)}</td><td class="r ${s.res >= 0 ? 'pos' : 'neg'}"><b>${money(s.res)}</b></td><td class="r">${s.in ? Math.round(s.res / s.in * 100) + '%' : '—'}</td><td class="r ${v > 0 ? 'pos' : v < 0 ? 'neg' : ''}">${v == null ? '—' : (v > 0 ? '+' : '') + v + '%'}</td></tr>`; }).join('')}</tbody></table></div>`;
    requestAnimationFrame(() => barsInOut(body.querySelector('[data-bars]'), series, { height: 220 }));
    exportRows = series; exportCols = [{ label: 'Mês', key: 'title' }, { label: 'Receitas', get: s => String(s.in).replace('.', ',') }, { label: 'Despesas', get: s => String(s.out).replace('.', ',') }, { label: 'Resultado', get: s => String(s.res).replace('.', ',') }];
  }
  else if (S.tipo === 'inadimplencia') {
    const t = today(); const atr = C.lancamentos.filter(l => l.tipo !== 'transferencia' && statusOf(l) === 'atrasado').sort((a, b) => a.vencimento < b.vencimento ? -1 : 1);
    const faixas = [['1–7 dias', 1, 7], ['8–30 dias', 8, 30], ['31–90 dias', 31, 90], ['+90 dias', 91, 99999]];
    const porFaixa = tipo => faixas.map(([n, a, b]) => ({ n, v: round2(sum(atr.filter(l => l.tipo === tipo && daysBetween(l.vencimento, t) >= a && daysBetween(l.vencimento, t) <= b), emAberto)) }));
    const rec = porFaixa('receber'), pag = porFaixa('pagar');
    body.innerHTML = `<div class="grid2"><div class="card"><div class="card-h"><h3>A receber em atraso</h3><b class="pos">${money(sum(rec, r => r.v))}</b></div><div class="faixas">${rec.map(r => `<div class="faixa"><span>${r.n}</span><i style="width:${sum(rec, x => x.v) ? r.v / sum(rec, x => x.v) * 100 : 0}%"></i><b>${money(r.v)}</b></div>`).join('')}</div></div>
      <div class="card"><div class="card-h"><h3>A pagar em atraso</h3><b class="neg">${money(sum(pag, r => r.v))}</b></div><div class="faixas red">${pag.map(r => `<div class="faixa"><span>${r.n}</span><i style="width:${sum(pag, x => x.v) ? r.v / sum(pag, x => x.v) * 100 : 0}%"></i><b>${money(r.v)}</b></div>`).join('')}</div></div></div>
      <div class="card tbl-card"><table class="tbl"><thead><tr><th>Vencimento</th><th>Descrição</th><th>Contato</th><th class="r">Dias</th><th class="r">Em aberto</th></tr></thead><tbody>${atr.map(l => `<tr data-id="${l.id}" class="clk"><td>${fmtDate(l.vencimento)}</td><td>${esc(l.descricao)}</td><td>${esc(C.contato(l.contato_id)?.nome || '')}</td><td class="r neg">${daysBetween(l.vencimento, t)}</td><td class="r ${l.tipo === 'receber' ? 'pos' : 'neg'}">${money(emAberto(l))}</td></tr>`).join('') || '<tr><td colspan="5" class="muted">Nenhum lançamento atrasado. 🎉</td></tr>'}</tbody></table></div>`;
    on(body, 'click', 'tr.clk', (e, tr) => abrirDetalhe(app.lanc(tr.dataset.id)));
    exportRows = atr; exportCols = [{ label: 'Vencimento', get: l => fmtDate(l.vencimento) }, { label: 'Descrição', key: 'descricao' }, { label: 'Contato', get: l => C.contato(l.contato_id)?.nome || '' }, { label: 'Dias', get: l => daysBetween(l.vencimento, t) }, { label: 'Em aberto', get: l => String(emAberto(l)).replace('.', ',') }];
  }
  else { // lançamentos detalhados com filtro
    const ls = filtrar(base, { categoria: S.categoria, contato: S.contato, centro: S.centro }).sort((a, b) => a.vencimento < b.vencimento ? -1 : 1);
    const filtroNome = S.categoria ? C.cat(S.categoria)?.nome : S.contato ? C.contato(S.contato)?.nome : S.centro ? C.centro(S.centro)?.nome : null;
    body.innerHTML = `<div class="card tbl-card"><div class="card-h"><h3>${ls.length} lançamentos${filtroNome ? ` · <span class="pill blue">${esc(filtroNome)} <button class="ibtn xs" data-x>${icon('ti-x')}</button></span>` : ''}</h3><b>${money(sum(ls, l => l.valor))}</b></div>
      <table class="tbl"><thead><tr><th>Venc.</th><th>Descrição</th><th>Contato</th><th>Categoria</th><th>Conta</th><th>Status</th><th class="r">Valor</th></tr></thead><tbody>${ls.map(l => `<tr class="clk" data-id="${l.id}"><td>${fmtDate(l.vencimento)}</td><td>${esc(l.descricao)}</td><td>${esc(C.contato(l.contato_id)?.nome || '')}</td><td>${esc(C.cat(l.categoria_id)?.nome || '')}</td><td>${esc(C.conta(l.conta_id)?.nome || '')}</td><td>${statusOf(l)}</td><td class="r ${l.tipo === 'receber' ? 'pos' : 'neg'}">${money(l.valor)}</td></tr>`).join('') || '<tr><td colspan="7" class="muted">Nada no período.</td></tr>'}</tbody></table></div>`;
    body.querySelector('[data-x]')?.addEventListener('click', () => { S.categoria = S.contato = S.centro = null; save(); render(root); });
    on(body, 'click', 'tr.clk', (e, tr) => abrirDetalhe(app.lanc(tr.dataset.id)));
    exportRows = ls; exportCols = [{ label: 'Vencimento', get: l => fmtDate(l.vencimento) }, { label: 'Descrição', key: 'descricao' }, { label: 'Contato', get: l => C.contato(l.contato_id)?.nome || '' }, { label: 'Categoria', get: l => C.cat(l.categoria_id)?.nome || '' }, { label: 'Conta', get: l => C.conta(l.conta_id)?.nome || '' }, { label: 'Status', get: l => statusOf(l) }, { label: 'Valor', get: l => String(l.valor).replace('.', ',') }];
  }
  root.querySelector('[data-export]').onclick = () => download(`relatorio-${S.tipo}-${S.de}-${S.ate}.csv`, toCSV(exportRows, exportCols));
  function labelPer() { return S.de === monthStart(S.de) && S.ate === monthEnd(S.de) ? fmtMonth(S.de, true) : `${fmtDate(S.de, { short: true })} – ${fmtDate(S.ate, { short: true })}`; }
}
