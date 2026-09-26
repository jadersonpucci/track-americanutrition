// DRE gerencial: competência ou caixa, 12 meses, grupos → subgrupos → categorias, % da receita.
import { app } from '../app.js';
import { prefs } from '../db.js';
import { h, icon, segmented, combobox, catIcon, on } from '../ui.js';
import { money, today, esc, round2, toCSV, download, sum, monthKey } from '../utils.js';
import { dre } from '../model.js';

const S = Object.assign({ ano: Number(today().slice(0, 4)), regime: 'competencia', centro: null, aberto: {}, visao: 'meses' }, prefs.get('dre') || {});
export function render(root) {
  const E = app.empresaId; const C = app.ctx(); const save = () => prefs.set('dre', S);
  const D = dre(E, S.ano, S.regime, { centroId: S.centro });
  const mesAtual = monthKey(today()); const idxAtual = Number(mesAtual.slice(5, 7)) - 1;
  const meses = D.meses.map((m, i) => ({ key: m, label: ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'][i], atual: i === idxAtual && S.ano === Number(mesAtual.slice(0, 4)) }));
  const receita = D.receita; const recTotal = round2(sum(receita));
  const cell = (v, base) => v ? `<td class="r ${v < 0 ? 'neg' : 'pos'}">${money(v)}${S.visao === 'pct' && base ? `<small>${Math.round(v / base * 100)}%</small>` : ''}</td>` : '<td class="r muted">—</td>';
  const cells = (arr, tot) => `${arr.map((v, i) => cell(v, receita[i])).join('')}<td class="r tot ${tot < 0 ? 'neg' : 'pos'}">${tot ? money(tot) : '—'}${S.visao === 'pct' && recTotal ? `<small>${Math.round(tot / recTotal * 100)}%</small>` : ''}</td>`;
  const resumoRow = D.resumo.map(r => `<tr class="res ${r.tipo}"><td>${r.nome}</td>${cells(r.totais, r.total)}</tr>`).join('');
  root.innerHTML = `<div class="page dre">
    <header class="ph"><div><h1>DRE gerencial</h1><p class="muted">${S.regime === 'competencia' ? 'Regime de competência: pelo mês de competência do lançamento.' : 'Regime de caixa: pelo mês em que foi pago ou recebido.'}</p></div><div class="ph-a"><button class="btn ghost" data-export>${icon('ti-download')}</button><button class="btn ghost" data-print>${icon('ti-printer')}</button></div></header>
    <div class="toolbar" data-tb><div class="periodo"><button class="ibtn" data-prev>${icon('ti-chevron-left')}</button><span class="per-l">${S.ano}</span><button class="ibtn" data-next>${icon('ti-chevron-right')}</button></div></div>
    <div class="card tbl-card dre-wrap"><table class="tbl dre-t"><thead><tr><th class="sticky">Conta</th>${meses.map(m => `<th class="r ${m.atual ? 'cur' : ''}">${m.label}</th>`).join('')}<th class="r tot">Total</th></tr></thead><tbody>
    ${D.grupos.map(g => `<tr class="grp" data-g="${g.id}"><td class="sticky">${icon(S.aberto[g.id] === false ? 'ti-chevron-right' : 'ti-chevron-down')}<b>${esc(g.nome)}</b></td>${cells(g.totais, g.total)}</tr>
      ${S.aberto[g.id] === false ? '' : g.subgrupos.map(sg => `<tr class="sub" data-sg="${g.id}:${esc(sg.nome)}"><td class="sticky">${icon(S.aberto[g.id + ':' + sg.nome] === false ? 'ti-chevron-right' : 'ti-chevron-down')}${esc(sg.nome)}</td>${cells(sg.totais, sg.total)}</tr>
        ${S.aberto[g.id + ':' + sg.nome] === false ? '' : sg.categorias.map(c => `<tr class="cat" data-cat="${c.cat.id}"><td class="sticky">${catIcon(c.cat, 18)}${esc(c.cat.nome)}</td>${cells(c.valores, c.total)}</tr>`).join('')}`).join('')}
      ${g.id === 1 ? resumoRow.split('</tr>')[0] + '</tr>' : g.id === 2 ? resumoRow.split('</tr>')[1] + '</tr>' : g.id === 3 ? resumoRow.split('</tr>')[2] + '</tr>' : g.id === 5 ? resumoRow.split('</tr>')[3] + '</tr>' : ''}`).join('')}
    </tbody></table></div>
    <p class="muted xs">Transferências entre contas não entram. Lançamentos cancelados também não. Rateios por categoria são respeitados.</p>
  </div>`;
  const tb = root.querySelector('[data-tb]');
  tb.appendChild(segmented([{ id: 'competencia', label: 'Competência' }, { id: 'caixa', label: 'Caixa' }], S.regime, v => { S.regime = v; save(); render(root); }));
  tb.appendChild(segmented([{ id: 'meses', label: 'R$' }, { id: 'pct', label: '% receita' }], S.visao, v => { S.visao = v; save(); render(root); }));
  if (C.centros.length) tb.appendChild(combobox({ options: C.centros.map(c => ({ id: c.id, label: c.nome })), value: S.centro, placeholder: 'Todos os centros', onChange: v => { S.centro = v; save(); render(root); } }));
  root.querySelector('[data-prev]').onclick = () => { S.ano--; save(); render(root); };
  root.querySelector('[data-next]').onclick = () => { S.ano++; save(); render(root); };
  on(root, 'click', 'tr.grp', (e, tr) => { const k = tr.dataset.g; S.aberto[k] = S.aberto[k] === false; save(); render(root); });
  on(root, 'click', 'tr.sub', (e, tr) => { const k = tr.dataset.sg; S.aberto[k] = S.aberto[k] === false; save(); render(root); });
  on(root, 'click', 'tr.cat', (e, tr) => { location.hash = `#/relatorios?categoria=${tr.dataset.cat}&ano=${S.ano}`; });
  root.querySelector('[data-print]').onclick = () => window.print();
  root.querySelector('[data-export]').onclick = () => {
    const rows = [];
    for (const g of D.grupos) { rows.push({ n: g.nome, v: g.totais, t: g.total }); for (const sg of g.subgrupos) { rows.push({ n: '  ' + sg.nome, v: sg.totais, t: sg.total }); for (const c of sg.categorias) rows.push({ n: '    ' + c.cat.nome, v: c.valores, t: c.total }); } }
    for (const r of D.resumo) rows.push({ n: r.nome.toUpperCase(), v: r.totais, t: r.total });
    download(`dre-${S.ano}-${S.regime}.csv`, toCSV(rows, [{ label: 'Conta', key: 'n' }, ...meses.map((m, i) => ({ label: m.label, get: r => String(r.v[i]).replace('.', ',') })), { label: 'Total', get: r => String(r.t).replace('.', ',') }]));
  };
}
