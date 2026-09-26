// Visão geral: saldos por conta, o que vence, fluxo dos próximos dias, DRE resumida do mês, pendências.
import { app } from '../app.js';
import { h, icon, bankIcon, catIcon, avatar, moneyEl, emptyState, on } from '../ui.js';
import { money, today, addDays, monthStart, monthEnd, fmtDate, fmtMonth, relDate, esc, sum, round2, daysBetween, addMonths, monthKey } from '../utils.js';
import { saldoConta, saldoTotal, saldoProjetado, fluxoCaixa, statusOf, emAberto, filtrar, dre, topPor, liquidado, movimentos } from '../model.js';
import { barsInOut, lineSaldo, donut, sparkline } from '../charts.js';
import { abrirLancamento, abrirBaixa, abrirDetalhe, statusPill } from './form-lancamento.js';

export function render(root) {
  const E = app.empresaId; const C = app.ctx(); const t = today();
  const contas = C.contas.filter(c => !c.arquivada).sort((a, b) => (a.ordem || 0) - (b.ordem || 0));
  const lancs = C.lancamentos.filter(l => l.tipo !== 'transferencia' && l.status !== 'cancelado');
  const abertos = lancs.filter(l => ['aberto', 'parcial', 'atrasado'].includes(statusOf(l)));
  const hoje = abertos.filter(l => l.vencimento === t), atras = abertos.filter(l => l.vencimento < t), prox7 = abertos.filter(l => l.vencimento > t && l.vencimento <= addDays(t, 7));
  const S = arr => ({ pagar: round2(sum(arr.filter(l => l.tipo === 'pagar'), emAberto)), receber: round2(sum(arr.filter(l => l.tipo === 'receber'), emAberto)) });
  const sHoje = S(hoje), sAtr = S(atras), sProx = S(prox7);
  const saldo = saldoTotal(E); const proj30 = round2(sum(contas.filter(c => c.tipo !== 'cartao'), c => saldoProjetado(E, c.id, addDays(t, 30))));
  const mes = monthStart(t); const mesLancs = lancs.filter(l => (l.competencia || l.vencimento) >= mes && (l.competencia || l.vencimento) <= monthEnd(mes));
  const recMes = round2(sum(mesLancs.filter(l => l.tipo === 'receber'), l => l.valor)), despMes = round2(sum(mesLancs.filter(l => l.tipo === 'pagar'), l => l.valor));
  const mesAnt = addMonths(mes, -1); const antLancs = lancs.filter(l => (l.competencia || l.vencimento) >= mesAnt && (l.competencia || l.vencimento) <= monthEnd(mesAnt));
  const recAnt = round2(sum(antLancs.filter(l => l.tipo === 'receber'), l => l.valor)), despAnt = round2(sum(antLancs.filter(l => l.tipo === 'pagar'), l => l.valor));
  const varPct = (a, b) => b ? Math.round((a - b) / b * 100) : null;
  const hora = new Date().getHours(); const sauda = hora < 12 ? 'Bom dia' : hora < 18 ? 'Boa tarde' : 'Boa noite';
  const nomeUser = (db_user() || '').split(' ')[0];

  root.innerHTML = `
  <div class="page dash">
    <header class="ph"><div><div class="eyebrow">${fmtDate(t, { long: true })}</div><h1>${sauda}${nomeUser ? ', ' + esc(nomeUser) : ''}</h1></div>
      <div class="ph-a"><button class="btn secondary" data-go="#/receber/novo">${icon('ti-arrow-down-left')}Receita</button><button class="btn primary" data-go="#/pagar/novo">${icon('ti-arrow-up-right')}Despesa</button></div></header>

    <section class="hero-cards">
      <div class="card hero-saldo"><div class="hc-l">Saldo em contas</div><div class="hc-v">${money(saldo)}</div><div class="hc-s">Projetado em 30 dias <b class="${proj30 >= saldo ? 'pos' : 'neg'}">${money(proj30)}</b></div><div class="hc-spark" data-spark></div></div>
      <div class="card kpi ${sAtr.pagar || sAtr.receber ? 'warn' : ''}"><div class="kpi-h">${icon('ti-alert-triangle')}Atrasados</div><div class="kpi-r"><span>A pagar</span><b class="neg">${money(sAtr.pagar)}</b></div><div class="kpi-r"><span>A receber</span><b class="pos">${money(sAtr.receber)}</b></div><a href="#/pagar?status=atrasado" class="kpi-link">${atras.length} lançamentos ${icon('ti-arrow-right')}</a></div>
      <div class="card kpi"><div class="kpi-h">${icon('ti-calendar-event')}Hoje</div><div class="kpi-r"><span>A pagar</span><b class="neg">${money(sHoje.pagar)}</b></div><div class="kpi-r"><span>A receber</span><b class="pos">${money(sHoje.receber)}</b></div><a href="#/pagar?periodo=hoje" class="kpi-link">${hoje.length} lançamentos ${icon('ti-arrow-right')}</a></div>
      <div class="card kpi"><div class="kpi-h">${icon('ti-calendar-week')}Próximos 7 dias</div><div class="kpi-r"><span>A pagar</span><b class="neg">${money(sProx.pagar)}</b></div><div class="kpi-r"><span>A receber</span><b class="pos">${money(sProx.receber)}</b></div><a href="#/pagar?periodo=7d" class="kpi-link">${prox7.length} lançamentos ${icon('ti-arrow-right')}</a></div>
    </section>

    <section class="contas-strip" data-contas></section>

    <section class="grid2">
      <div class="card"><div class="card-h"><h3>Fluxo de caixa · 30 dias</h3><a href="#/fluxo" class="lnk">Ver completo ${icon('ti-arrow-right')}</a></div><div data-fluxo class="chart-box"></div></div>
      <div class="card"><div class="card-h"><h3>${fmtMonth(mes, true)}</h3><a href="#/dre" class="lnk">DRE ${icon('ti-arrow-right')}</a></div>
        <div class="mes-kpis"><div><span>Receitas</span><b class="pos">${money(recMes)}</b>${varPct(recMes, recAnt) != null ? `<small class="${recMes >= recAnt ? 'pos' : 'neg'}">${recMes >= recAnt ? '↑' : '↓'} ${Math.abs(varPct(recMes, recAnt))}% vs ${fmtMonth(mesAnt)}</small>` : ''}</div><div><span>Despesas</span><b class="neg">${money(despMes)}</b>${varPct(despMes, despAnt) != null ? `<small class="${despMes <= despAnt ? 'pos' : 'neg'}">${despMes >= despAnt ? '↑' : '↓'} ${Math.abs(varPct(despMes, despAnt))}%</small>` : ''}</div><div><span>Resultado</span><b class="${recMes - despMes >= 0 ? 'pos' : 'neg'}">${money(recMes - despMes)}</b><small class="muted">margem ${recMes ? Math.round((recMes - despMes) / recMes * 100) : 0}%</small></div></div>
        <div class="donut-row"><div data-donut class="donut-box"></div><div data-donut-l class="donut-legend"></div></div></div>
    </section>

    <section class="grid2">
      <div class="card"><div class="card-h"><h3>Vencendo</h3><a href="#/pagar" class="lnk">Contas a pagar ${icon('ti-arrow-right')}</a></div><div class="list" data-vencendo></div></div>
      <div class="card"><div class="card-h"><h3>Últimos movimentos</h3><a href="#/extrato" class="lnk">Extrato ${icon('ti-arrow-right')}</a></div><div class="list" data-movs></div></div>
    </section>
  </div>`;

  // contas
  const cs = root.querySelector('[data-contas]');
  cs.innerHTML = contas.map(c => { const s = saldoConta(E, c.id); return `<a class="conta-card" href="#/extrato/${c.id}">${bankIcon(c, 40)}<div class="cc-i"><div class="cc-n">${esc(c.nome)}</div><div class="cc-t">${c.tipo === 'cartao' ? 'Cartão' : c.tipo === 'gateway' ? 'Gateway' : c.tipo === 'caixa' ? 'Dinheiro' : c.agencia ? `Ag ${esc(c.agencia)}${c.numero ? ' · ' + esc(c.numero) : ''}` : 'Conta'}</div></div><div class="cc-v ${s < 0 ? 'neg' : ''}">${money(s)}</div></a>`; }).join('') + `<a class="conta-card add" href="#/cadastros/contas">${icon('ti-plus')}<span>Nova conta</span></a>`;

  // fluxo 30d
  const fx = fluxoCaixa(E, t, addDays(t, 29), 'dia');
  const box = root.querySelector('[data-fluxo]');
  const pts = fx.rows.map((r, i) => ({ label: i % 5 === 0 ? fmtDate(r.key, { short: true }) : '', title: fmtDate(r.key, { weekday: true }), value: r.saldoFinal, projected: true }));
  pts.unshift({ label: 'Hoje', title: 'Saldo atual', value: fx.saldoInicial, projected: false });
  requestAnimationFrame(() => { lineSaldo(box, pts, { height: 170 }); const sp = root.querySelector('[data-spark]'); const hist = []; for (let i = 29; i >= 0; i--) hist.push(saldoTotal(E, { ate: addDays(t, -i) })); sp.innerHTML = sparkline(hist, { w: 140, h: 34 }); });
  const min = Math.min(...fx.rows.map(r => r.saldoFinal)); const minRow = fx.rows.find(r => r.saldoFinal === min);
  if (min < 0) box.insertAdjacentHTML('afterend', `<div class="alert red">${icon('ti-alert-circle')}Caixa fica negativo em ${fmtDate(minRow.key)} (${money(min)}) se tudo vencer como previsto.</div>`);
  else box.insertAdjacentHTML('afterend', `<div class="alert soft">${icon('ti-shield-check')}Menor saldo previsto: <b>${money(min)}</b> em ${fmtDate(minRow.key)}.</div>`);

  // donut categorias do mês (despesas)
  const desp = mesLancs.filter(l => l.tipo === 'pagar');
  const top = topPor(desp, l => l.categoria_id, { limite: 6 });
  const cores = ['#07388E', '#2F6BE0', '#E8262C', '#B26A00', '#8E44AD', '#0E7C6B', '#8A94A8'];
  const items = top.map(([id, v], i) => ({ label: C.cat(id)?.nome || 'Sem categoria', value: v, color: cores[i] }));
  const resto = round2(despMes - sum(items, i => i.value)); if (resto > 0) items.push({ label: 'Outras', value: resto, color: cores[6] });
  if (items.length) { requestAnimationFrame(() => donut(root.querySelector('[data-donut]'), items, { size: 132, thickness: 14, center: `<small>despesas</small><b>${money(despMes, { compact: true })}</b>` })); root.querySelector('[data-donut-l]').innerHTML = items.map(i => `<div class="dl"><i style="background:${i.color}"></i><span>${esc(i.label)}</span><b>${Math.round(i.value / (despMes || 1) * 100)}%</b></div>`).join(''); }
  else root.querySelector('.donut-row').innerHTML = '<div class="muted sm">Sem despesas no mês.</div>';

  // vencendo
  const venc = [...atras, ...hoje, ...prox7].sort((a, b) => a.vencimento < b.vencimento ? -1 : 1).slice(0, 8);
  const lv = root.querySelector('[data-vencendo]');
  if (!venc.length) lv.appendChild(emptyState({ icon: 'ti-confetti', title: 'Nada vencendo', text: 'Nenhum lançamento em aberto nos próximos 7 dias.' }));
  else lv.innerHTML = venc.map(l => rowLanc(l, C)).join('');
  on(lv, 'click', '[data-pay]', (e, b) => { e.preventDefault(); e.stopPropagation(); abrirBaixa(app.lanc(b.dataset.pay)); });
  on(lv, 'click', '.li', (e, r) => { abrirDetalhe(app.lanc(r.dataset.id)); });

  // últimos movimentos
  const movs = []; for (const c of contas) movs.push(...movimentos(E, c.id, addDays(t, -30), t).map(m => ({ ...m, conta: c })));
  movs.sort((a, b) => (b.data + (b.lancamento.atualizado_em || '')).localeCompare(a.data + (a.lancamento.atualizado_em || '')));
  const lm = root.querySelector('[data-movs]');
  lm.innerHTML = movs.slice(0, 8).map(m => `<div class="li" data-id="${m.lancamento.id}">${bankIcon(m.conta, 34)}<div class="li-b"><div class="li-t">${esc(m.descricao)}</div><div class="li-s">${esc(m.conta.nome)} · ${relDate(m.data)}</div></div>${moneyEl(m.valor)}</div>`).join('') || '<div class="muted sm pad">Nenhum movimento nos últimos 30 dias.</div>';
  on(lm, 'click', '.li', (e, r) => abrirDetalhe(app.lanc(r.dataset.id)));
  on(root, 'click', '[data-go]', (e, b) => { location.hash = b.dataset.go; });
}

function db_user() { return app.userName || ''; }

export function rowLanc(l, C) {
  const st = statusOf(l); const cat = C.cat(l.categoria_id); const ct = C.contato(l.contato_id);
  return `<div class="li lanc ${st}" data-id="${l.id}">${catIcon(cat, 32)}<div class="li-b"><div class="li-t">${esc(l.descricao)}</div><div class="li-s">${ct ? esc(ct.nome) + ' · ' : ''}${esc(cat?.nome || '')} · <span class="${st === 'atrasado' ? 'neg' : ''}">${relDate(l.vencimento)}</span></div></div><div class="li-r"><span class="amt ${l.tipo === 'receber' ? 'pos' : 'neg'}">${money(emAberto(l))}</span>${statusPill(l)}</div><button class="ibtn pay" data-pay="${l.id}" title="${l.tipo === 'receber' ? 'Receber' : 'Pagar'}">${icon('ti-check')}</button></div>`;
}
