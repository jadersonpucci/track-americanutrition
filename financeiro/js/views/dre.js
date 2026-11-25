// DRE gerencial: vencimento ou caixa, por mês ou trimestre, grupos → subgrupos → categorias, % da receita.
import { app } from '../app.js';
import { prefs } from '../db.js';
import { h, icon, segmented, combobox, catIcon, on } from '../ui.js';
import { today, esc, round2, toCSV, download, sum, monthKey } from '../utils.js';
import { dre } from '../model.js';

const S = Object.assign({ ano: Number(today().slice(0, 4)), regime: 'vencimento', centro: null, aberto: {}, visao: 'meses', periodo: null }, prefs.get('dre') || {});
if (S.regime !== 'caixa') S.regime = 'vencimento';
// valores inteiros, sem R$ e sem centavos, para caber o ano inteiro na tela
const num = v => (v < 0 ? '-' : '') + Math.round(Math.abs(v)).toLocaleString('pt-BR');
const tri = arr => [0, 1, 2, 3].map(q => round2(arr[q * 3] + arr[q * 3 + 1] + arr[q * 3 + 2]));
export function render(root) {
  const E = app.empresaId; const C = app.ctx(); const save = () => prefs.set('dre', S);
  const D = dre(E, S.ano, S.regime, { centroId: S.centro });
  const mesAtual = monthKey(today()); const idxAtual = Number(mesAtual.slice(5, 7)) - 1;
  const periodo = S.periodo || (matchMedia('(max-width: 860px)').matches ? 'tri' : 'mes'); const porTri = periodo === 'tri';
  const anoAtual = S.ano === Number(mesAtual.slice(0, 4));
  const meses = porTri ? [0, 1, 2, 3].map(q => ({ label: `${q + 1}º tri`, atual: anoAtual && Math.floor(idxAtual / 3) === q })) : D.meses.map((m, i) => ({ key: m, label: ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'][i], atual: anoAtual && i === idxAtual }));
  const cols = arr => porTri ? tri(arr) : arr;
  const receita = cols(D.receita); const recTotal = round2(sum(receita));
  const cell = (v, base) => v ? `<td class="r ${v < 0 ? 'neg' : 'pos'}">${num(v)}${S.visao === 'pct' && base ? `<small>${Math.round(v / base * 100)}%</small>` : ''}</td>` : '<td class="r muted">—</td>';
  const cells = (arr, tot) => `${cols(arr).map((v, i) => cell(v, receita[i])).join('')}<td class="r tot ${tot < 0 ? 'neg' : 'pos'}">${tot ? num(tot) : '—'}${S.visao === 'pct' && recTotal ? `<small>${Math.round(tot / recTotal * 100)}%</small>` : ''}</td>`;
  const resumoRows = D.resumo.map(r => `<tr class="res ${r.tipo}"><td class="sticky"><div class="nm">${r.nome}</div></td>${cells(r.totais, r.total)}</tr>`);
  root.innerHTML = `<div class="page dre">
    <header class="ph"><div><h1>DRE gerencial</h1><p class="muted">${S.regime === 'caixa' ? 'Regime de caixa: pelo mês em que foi pago ou recebido.' : 'Pelo mês de vencimento do lançamento.'}</p></div><div class="ph-a"><button class="btn ghost" data-export>${icon('ti-download')}</button><button class="btn ghost" data-print>${icon('ti-printer')}</button></div></header>
    <div class="toolbar" data-tb><div class="periodo"><button class="ibtn" data-prev>${icon('ti-chevron-left')}</button><span class="per-l">${S.ano}</span><button class="ibtn" data-next>${icon('ti-chevron-right')}</button></div></div>
    <div class="card tbl-card dre-wrap"><table class="tbl dre-t"><thead><tr><th class="sticky">Conta</th>${meses.map(m => `<th class="r ${m.atual ? 'cur' : ''}">${m.label}</th>`).join('')}<th class="r tot">Total</th></tr></thead><tbody>
    ${D.grupos.map(g => `<tr class="grp" data-g="${g.id}"><td class="sticky"><div class="nm">${icon(S.aberto[g.id] === false ? 'ti-chevron-right' : 'ti-chevron-down')}<b>${esc(g.nome)}</b></div></td>${cells(g.totais, g.total)}</tr>
      ${S.aberto[g.id] === false ? '' : g.subgrupos.map(sg => `<tr class="sub" data-sg="${g.id}:${esc(sg.nome)}"><td class="sticky"><div class="nm">${icon(S.aberto[g.id + ':' + sg.nome] === false ? 'ti-chevron-right' : 'ti-chevron-down')}${esc(sg.nome)}</div></td>${cells(sg.totais, sg.total)}</tr>
        ${S.aberto[g.id + ':' + sg.nome] === false ? '' : sg.categorias.map(c => `<tr class="cat" data-cat="${c.cat.id}"><td class="sticky"><div class="nm" title="${esc(c.cat.nome)}">${catIcon(c.cat, 18)}${esc(c.cat.nome)}</div></td>${cells(c.valores, c.total)}</tr>`).join('')}`).join('')}
      ${({ 2: 0, 3: 1, 4: 2, 5: 3, 7: 4 })[g.id] !== undefined ? resumoRows[({ 2: 0, 3: 1, 4: 2, 5: 3, 7: 4 })[g.id]] : ''}`).join('')}
    </tbody></table></div>
    <p class="muted xs">Valores em reais, sem centavos. Transferências entre contas não entram. Lançamentos cancelados também não. Rateios por categoria são respeitados.</p>
  </div>`;
  const tb = root.querySelector('[data-tb]');
  tb.appendChild(segmented([{ id: 'vencimento', label: 'Vencimento' }, { id: 'caixa', label: 'Caixa' }], S.regime, v => { S.regime = v; save(); render(root); }));
  tb.appendChild(segmented([{ id: 'mes', label: 'Meses' }, { id: 'tri', label: 'Trimestres' }], periodo, v => { S.periodo = v; save(); render(root); }));
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
    download(`dre-${S.ano}-${S.regime}.csv`, toCSV(rows, [{ label: 'Conta', key: 'n' }, ...meses.map((m, i) => ({ label: m.label, get: r => String(cols(r.v)[i]).replace('.', ',') })), { label: 'Total', get: r => String(r.t).replace('.', ',') }]));
  };
}
