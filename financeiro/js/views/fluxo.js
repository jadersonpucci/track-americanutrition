// Fluxo de caixa: realizado + previsto, por dia / semana / mês, com saldo acumulado e gráfico.
import { app } from '../app.js';
import { prefs } from '../db.js';
import { h, icon, segmented, combobox, bankIcon, emptyState, on } from '../ui.js';
import { money, today, addDays, addMonths, monthStart, monthEnd, fmtDate, fmtMonth, esc, round2, toCSV, download, sum } from '../utils.js';
import { fluxoCaixa, saldoTotal, saldoConta } from '../model.js';
import { barsInOut, lineSaldo } from '../charts.js';

const S = Object.assign({ gran: 'dia', horizonte: '30', contaId: null }, prefs.get('fluxo') || {});
export function render(root) {
  const E = app.empresaId; const C = app.ctx(); const t = today();
  const save = () => prefs.set('fluxo', S);
  let de, ate;
  if (S.gran === 'mes') { de = monthStart(addMonths(t, -3)); ate = monthEnd(addMonths(t, Number(S.horizonte) === 30 ? 6 : Number(S.horizonte) === 60 ? 9 : 12)); }
  else if (S.gran === 'semana') { de = addDays(t, -28); ate = addDays(t, Number(S.horizonte)); }
  else { de = addDays(t, -7); ate = addDays(t, Number(S.horizonte)); }
  const fx = fluxoCaixa(E, de, ate, S.gran, { contaId: S.contaId });
  const rows = fx.rows; const saldoHoje = S.contaId ? saldoConta(E, S.contaId) : saldoTotal(E);
  const min = rows.reduce((m, r) => r.saldoFinal < m.saldoFinal ? r : m, rows[0]);
  const totIn = round2(sum(rows.filter(r => r.key >= t || S.gran !== 'dia'), r => r.prevIn)), totOut = round2(sum(rows, r => r.prevOut));
  root.innerHTML = `<div class="page fluxo">
    <header class="ph"><div><h1>Fluxo de caixa</h1><p class="muted">Realizado até hoje, previsto daqui pra frente. Atrasados entram em "hoje".</p></div><div class="ph-a"><button class="btn ghost" data-export>${icon('ti-download')}</button></div></header>
    <div class="toolbar" data-tb></div>
    <div class="sumbar"><div><span>Saldo hoje</span><b>${money(saldoHoje)}</b><small>início do período ${money(fx.saldoInicial)}</small></div><div><span>Entradas previstas</span><b class="pos">${money(totIn)}</b></div><div><span>Saídas previstas</span><b class="neg">${money(totOut)}</b></div><div class="${min && min.saldoFinal < 0 ? 'warn' : ''}"><span>Menor saldo</span><b class="${min && min.saldoFinal < 0 ? 'neg' : ''}">${min ? money(min.saldoFinal) : '—'}</b><small>${min ? labelKey(min.key, S.gran) : ''}</small></div></div>
    <div class="card"><div class="card-h"><h3>Saldo acumulado</h3></div><div class="chart-box" data-line></div></div>
    <div class="card"><div class="card-h"><h3>Entradas × saídas</h3><span class="muted sm">tons claros = previsto</span></div><div class="chart-box" data-bars></div></div>
    <div class="card tbl-card"><table class="tbl fluxo-t"><thead><tr><th>Período</th><th class="r">Entradas</th><th class="r">Saídas</th><th class="r">Resultado</th><th class="r">Saldo</th></tr></thead><tbody>
      ${rows.map(r => { const inT = round2(r.realIn + r.prevIn), outT = round2(r.realOut + r.prevOut); const res = round2(inT - outT); const hoje = S.gran === 'dia' ? r.key === t : S.gran === 'semana' ? (r.key <= t && addDays(r.key, 6) >= t) : r.key === t.slice(0, 7);
        return `<tr class="${hoje ? 'today' : ''} ${r.saldoFinal < 0 ? 'neg-row' : ''}"><td>${labelKey(r.key, S.gran)}${hoje ? ' <span class="pill blue xs">hoje</span>' : ''}${r.atrasadoOut || r.atrasadoIn ? ` <span class="pill red xs">${money(r.atrasadoOut + r.atrasadoIn)} atrasado</span>` : ''}</td><td class="r pos">${inT ? money(inT) : '<span class="muted">—</span>'}${r.prevIn && r.realIn ? `<small>${money(r.realIn)} real.</small>` : ''}</td><td class="r neg">${outT ? money(outT) : '<span class="muted">—</span>'}${r.prevOut && r.realOut ? `<small>${money(r.realOut)} real.</small>` : ''}</td><td class="r ${res >= 0 ? 'pos' : 'neg'}">${money(res, { sign: true })}</td><td class="r ${r.saldoFinal < 0 ? 'neg' : ''}"><b>${money(r.saldoFinal)}</b></td></tr>`; }).join('')}</tbody></table></div>
  </div>`;
  const tb = root.querySelector('[data-tb]');
  tb.appendChild(segmented([{ id: 'dia', label: 'Dia' }, { id: 'semana', label: 'Semana' }, { id: 'mes', label: 'Mês' }], S.gran, v => { S.gran = v; save(); render(root); }));
  tb.appendChild(segmented([{ id: '30', label: S.gran === 'mes' ? '6 meses' : '30 dias' }, { id: '60', label: S.gran === 'mes' ? '9 meses' : '60 dias' }, { id: '90', label: S.gran === 'mes' ? '12 meses' : '90 dias' }], S.horizonte, v => { S.horizonte = v; save(); render(root); }));
  tb.appendChild(combobox({ options: C.contas.filter(c => !c.arquivada && c.tipo !== 'cartao').map(c => ({ id: c.id, label: c.nome, icon: bankIcon(c, 22) })), value: S.contaId, placeholder: 'Todas as contas', onChange: v => { S.contaId = v; save(); render(root); } }));
  requestAnimationFrame(() => {
    lineSaldo(root.querySelector('[data-line]'), rows.map((r, i) => ({ label: i % Math.ceil(rows.length / 8) === 0 ? labelKey(r.key, S.gran, true) : '', title: labelKey(r.key, S.gran), value: r.saldoFinal, projected: S.gran === 'dia' ? r.key > t : S.gran === 'semana' ? r.key > t : r.key > t.slice(0, 7) })), { height: 200 });
    barsInOut(root.querySelector('[data-bars]'), rows.map((r, i) => ({ label: i % Math.ceil(rows.length / 8) === 0 ? labelKey(r.key, S.gran, true) : '', title: labelKey(r.key, S.gran), in: r.realIn, out: r.realOut, prevIn: r.prevIn, prevOut: r.prevOut })), { height: 200 });
  });
  root.querySelector('[data-export]').onclick = () => download(`fluxo-${S.gran}-${t}.csv`, toCSV(rows, [{ label: 'Período', get: r => labelKey(r.key, S.gran) }, { label: 'Entradas realizadas', get: r => r.realIn }, { label: 'Entradas previstas', get: r => r.prevIn }, { label: 'Saídas realizadas', get: r => r.realOut }, { label: 'Saídas previstas', get: r => r.prevOut }, { label: 'Saldo', get: r => r.saldoFinal }].map(c => ({ ...c, get: r => String(c.get(r)).replace('.', ',') }))));
}
function labelKey(k, gran, short = false) { if (gran === 'mes') return fmtMonth(k + '-01', !short); if (gran === 'semana') return short ? fmtDate(k, { short: true }) : `${fmtDate(k, { short: true })} – ${fmtDate(addDays(k, 6), { short: true })}`; return short ? fmtDate(k, { short: true }) : fmtDate(k, { weekday: true }); }
