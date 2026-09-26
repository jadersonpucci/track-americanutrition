// Contas a pagar / a receber: filtros, agrupamento por vencimento, seleção múltipla, baixa em lote.
import { app } from '../app.js';
import { db, prefs } from '../db.js';
import { h, icon, bankIcon, catIcon, avatar, chips, combobox, menu, emptyState, toast, confirm, on, tagChip } from '../ui.js';
import { money, today, addDays, monthStart, monthEnd, addMonths, fmtDate, fmtMonth, relDate, esc, sum, round2, toCSV, download, groupBy, daysBetween } from '../utils.js';
import { statusOf, emAberto, liquidado, filtrar, resumoPeriodo, FORMAS, dataPagamento } from '../model.js';
import { abrirLancamento, abrirBaixa, abrirDetalhe, statusPill, excluirLancamento, estornarBaixa } from './form-lancamento.js';

const state = { pagar: null, receber: null };
function defState(tipo) { const t = today(); return { tipo, periodo: 'mes', de: monthStart(t), ate: monthEnd(t), status: [], conta: null, categoria: null, contato: null, centro: null, tag: null, q: '', ordem: 'vencimento', agrupar: 'dia', sel: new Set(), mostrarPagos: true }; }

export function render(root, { tipo = 'pagar', params = {} } = {}) {
  const S = state[tipo] || (state[tipo] = { ...defState(tipo), ...(prefs.get('lanc:' + tipo) || {}), sel: new Set() });
  if (params.status) { S.status = [params.status]; S.periodo = 'todos'; }
  if (params.periodo === 'hoje') { S.periodo = 'hoje'; } if (params.periodo === '7d') S.periodo = '7d';
  aplicarPeriodo(S);
  const E = app.empresaId; const C = app.ctx(); const isRec = tipo === 'receber';
  const todos = C.lancamentos.filter(l => l.tipo === tipo);
  const lista = filtrar(todos, { de: S.periodo === 'todos' ? null : S.de, ate: S.periodo === 'todos' ? null : S.ate, status: S.status, conta: S.conta, categoria: S.categoria, contato: S.contato, centro: S.centro, tag: S.tag, q: S.q });
  const ordenada = [...lista].sort((a, b) => { if (S.ordem === 'valor') return b.valor - a.valor; if (S.ordem === 'descricao') return a.descricao.localeCompare(b.descricao); return a.vencimento < b.vencimento ? -1 : a.vencimento > b.vencimento ? 1 : a.descricao.localeCompare(b.descricao); });
  const res = resumoPeriodo(lista);
  const nAtr = todos.filter(l => statusOf(l) === 'atrasado').length;
  const save = () => prefs.set('lanc:' + tipo, { ...S, sel: undefined });

  root.innerHTML = `<div class="page lancs">
    <header class="ph"><div><h1>${isRec ? 'Contas a receber' : 'Contas a pagar'}</h1></div>
      <div class="ph-a"><button class="btn ghost" data-export title="Exportar CSV">${icon('ti-download')}</button><button class="btn primary" data-novo>${icon('ti-plus')}${isRec ? 'Nova receita' : 'Nova despesa'}</button></div></header>
    <div class="toolbar">
      <div class="periodo"><button class="ibtn" data-prev>${icon('ti-chevron-left')}</button><button class="per-l" data-per-menu>${labelPeriodo(S)}${icon('ti-chevron-down')}</button><button class="ibtn" data-next>${icon('ti-chevron-right')}</button></div>
      <div class="search">${icon('ti-search')}<input placeholder="Buscar descrição, contato, valor…" value="${esc(S.q)}"><button class="ibtn xs ${S.q ? '' : 'hidden'}" data-clear>${icon('ti-x')}</button></div>
      <div class="filters" data-filters></div>
      <button class="btn ghost sm" data-more-f>${icon('ti-adjustments-horizontal')}Filtros${S.conta || S.categoria || S.contato || S.centro || S.tag ? '<b class="dot-on"></b>' : ''}</button>
    </div>
    <div class="adv-filters hidden" data-adv></div>
    <div class="sumbar">
      <div><span>Total</span><b>${money(res.total)}</b><small>${lista.length} lançamentos</small></div>
      <div><span>${isRec ? 'Recebido' : 'Pago'}</span><b class="pos">${money(res.pago)}</b><small>${res.total ? Math.round(res.pago / res.total * 100) : 0}%</small></div>
      <div><span>Em aberto</span><b>${money(res.aberto)}</b></div>
      <div class="${res.atrasado ? 'warn' : ''}"><span>Atrasado</span><b class="${res.atrasado ? 'neg' : ''}">${money(res.atrasado)}</b>${nAtr && S.periodo !== 'todos' ? `<small><a href="#" data-ver-atr>ver todos os ${nAtr}</a></small>` : ''}</div>
    </div>
    <div class="bulkbar hidden" data-bulk><label class="chk"><input type="checkbox" data-all></label><span data-bulk-n></span><span class="grow"></span><button class="btn secondary sm" data-bulk-pay>${icon('ti-check')}${isRec ? 'Receber' : 'Pagar'} selecionados</button><button class="btn ghost sm" data-bulk-del>${icon('ti-trash')}</button><button class="btn ghost sm" data-bulk-x>${icon('ti-x')}</button></div>
    <div class="listwrap" data-list></div>
  </div>`;

  // status chips
  const st = chips([{ id: 'aberto', label: 'Em aberto', count: todos.filter(l => statusOf(l) === 'aberto').length }, { id: 'atrasado', label: 'Atrasado', cor: '#E8262C', count: nAtr }, { id: 'parcial', label: 'Parcial' }, { id: 'pago', label: isRec ? 'Recebido' : 'Pago' }], { multi: true, value: S.status, onChange: v => { S.status = v; save(); render(root, { tipo }); } });
  root.querySelector('[data-filters]').appendChild(st);
  // filtros avançados
  const adv = root.querySelector('[data-adv]'); const showAdv = S.conta || S.categoria || S.contato || S.centro || S.tag || S._adv; adv.classList.toggle('hidden', !showAdv);
  const cb = (opts, val, ph, key) => { const c = combobox({ options: opts, value: val, placeholder: ph, onChange: v => { S[key] = v; save(); render(root, { tipo }); } }); adv.appendChild(c); return c; };
  cb(C.contas.map(c => ({ id: c.id, label: c.nome, icon: bankIcon(c, 22) })), S.conta, 'Conta', 'conta');
  cb(C.categorias.filter(c => c.tipo === (isRec ? 'in' : 'out')).map(c => ({ id: c.id, label: c.nome, icon: catIcon(c, 22), group: c.subgrupo })), S.categoria, 'Categoria', 'categoria');
  cb(C.contatos.map(c => ({ id: c.id, label: c.nome, icon: avatar(c.nome, 22) })), S.contato, 'Contato', 'contato');
  if (C.centros.length) cb(C.centros.map(c => ({ id: c.id, label: c.nome })), S.centro, 'Centro de custo', 'centro');
  if (C.tags.length) cb(C.tags.map(t => ({ id: t.nome, label: t.nome })), S.tag, 'Tag', 'tag');
  const ord = combobox({ options: [{ id: 'vencimento', label: 'Por vencimento' }, { id: 'valor', label: 'Maior valor' }, { id: 'descricao', label: 'A–Z' }], value: S.ordem, allowEmpty: false, onChange: v => { S.ordem = v; save(); render(root, { tipo }); } }); adv.appendChild(ord);
  const grp = combobox({ options: [{ id: 'dia', label: 'Agrupar por dia' }, { id: 'semana', label: 'Agrupar por semana' }, { id: 'nenhum', label: 'Sem agrupamento' }], value: S.agrupar, allowEmpty: false, onChange: v => { S.agrupar = v; save(); render(root, { tipo }); } }); adv.appendChild(grp);
  const limpar = h(`<button class="btn ghost sm">${icon('ti-x')}Limpar filtros</button>`); limpar.onclick = () => { Object.assign(S, { conta: null, categoria: null, contato: null, centro: null, tag: null, status: [], q: '', _adv: false }); save(); render(root, { tipo }); }; adv.appendChild(limpar);
  root.querySelector('[data-more-f]').onclick = () => { S._adv = !showAdv; adv.classList.toggle('hidden', !S._adv); };

  // busca
  const si = root.querySelector('.search input'); let tmr; si.oninput = () => { clearTimeout(tmr); tmr = setTimeout(() => { S.q = si.value; save(); const pos = si.selectionStart; render(root, { tipo }); const n = root.querySelector('.search input'); n.focus(); n.setSelectionRange(pos, pos); }, 250); };
  root.querySelector('[data-clear]').onclick = () => { S.q = ''; save(); render(root, { tipo }); };
  // período
  root.querySelector('[data-prev]').onclick = () => { moverPeriodo(S, -1); save(); render(root, { tipo }); };
  root.querySelector('[data-next]').onclick = () => { moverPeriodo(S, 1); save(); render(root, { tipo }); };
  root.querySelector('[data-per-menu]').onclick = e => menu(e.currentTarget, [
    { label: 'Este mês', onClick: () => setPer('mes') }, { label: 'Mês passado', onClick: () => setPer('mes-1') }, { label: 'Próximo mês', onClick: () => setPer('mes+1') }, '-',
    { label: 'Hoje', onClick: () => setPer('hoje') }, { label: 'Esta semana', onClick: () => setPer('semana') }, { label: 'Próximos 7 dias', onClick: () => setPer('7d') }, { label: 'Próximos 30 dias', onClick: () => setPer('30d') }, '-',
    { label: 'Este ano', onClick: () => setPer('ano') }, { label: 'Tudo', onClick: () => setPer('todos') }, { label: 'Personalizado…', onClick: () => custom() },
  ], { align: 'left' });
  const setPer = p => { S.periodo = p; S.offset = 0; aplicarPeriodo(S); save(); render(root, { tipo }); };
  const custom = async () => { const { modal, field } = await import('../ui.js'); const m = modal({ title: 'Período', size: 'sm', body: `<div class="row2"><label class="fld"><span class="fl">De</span><input class="inp" type="date" value="${S.de}" data-de></label><label class="fld"><span class="fl">Até</span><input class="inp" type="date" value="${S.ate}" data-ate></label></div>`, footer: `<button class="btn ghost" data-c>Cancelar</button><button class="btn primary" data-ok>Aplicar</button>` }); m.footer.querySelector('[data-c]').onclick = () => m.close(); m.footer.querySelector('[data-ok]').onclick = () => { S.periodo = 'custom'; S.de = m.body.querySelector('[data-de]').value; S.ate = m.body.querySelector('[data-ate]').value; save(); m.close(); render(root, { tipo }); }; };
  root.querySelector('[data-ver-atr]')?.addEventListener('click', e => { e.preventDefault(); S.status = ['atrasado']; setPer('todos'); });
  root.querySelector('[data-novo]').onclick = () => abrirLancamento(null, { tipo });
  root.querySelector('[data-export]').onclick = () => exportar(ordenada, C, tipo);

  // lista
  const lw = root.querySelector('[data-list]');
  if (!ordenada.length) { lw.appendChild(emptyState({ icon: isRec ? 'ti-cash-banknote' : 'ti-receipt', title: 'Nenhum lançamento', text: S.q || S.status.length ? 'Tente limpar os filtros.' : `Nada ${isRec ? 'a receber' : 'a pagar'} neste período.`, action: { label: isRec ? 'Nova receita' : 'Nova despesa', icon: 'ti-plus', onClick: () => abrirLancamento(null, { tipo }) } })); }
  else {
    const t = today();
    const grupos = S.agrupar === 'nenhum' || S.ordem !== 'vencimento' ? new Map([['', ordenada]]) : groupBy(ordenada, l => S.agrupar === 'semana' ? weekLabel(l.vencimento) : l.vencimento);
    let html = '';
    for (const [k, arr] of grupos) {
      const tot = round2(sum(arr, l => l.valor)); const ab = round2(sum(arr, emAberto));
      if (k) html += `<div class="grp-h ${S.agrupar === 'dia' && k < t && ab > 0 ? 'late' : ''} ${k === t ? 'today' : ''}"><span>${S.agrupar === 'dia' ? relDate(k) + ' <small>' + fmtDate(k) + '</small>' : k}</span><span class="grp-t">${ab > 0 && ab !== tot ? `<small>${money(ab)} em aberto de </small>` : ''}${money(tot)}</span></div>`;
      html += arr.map(l => linha(l, C, S)).join('');
    }
    lw.innerHTML = html;
  }
  on(lw, 'click', '.row', (e, r) => { if (e.target.closest('input,button,a')) return; abrirDetalhe(app.lanc(r.dataset.id)); });
  on(lw, 'change', 'input[data-sel]', (e, i) => { i.checked ? S.sel.add(i.dataset.sel) : S.sel.delete(i.dataset.sel); i.closest('.row').classList.toggle('sel', i.checked); paintBulk(); });
  on(lw, 'click', '[data-pay]', (e, b) => { e.stopPropagation(); abrirBaixa(app.lanc(b.dataset.pay)); });
  on(lw, 'click', '[data-menu]', (e, b) => { e.stopPropagation(); const l = app.lanc(b.dataset.menu); const s = statusOf(l); menu(b, [
    s !== 'pago' ? { label: isRec ? 'Receber' : 'Pagar', icon: 'ti-check', onClick: () => abrirBaixa(l) } : { label: 'Estornar baixa', icon: 'ti-arrow-back-up', onClick: () => estornarBaixa(l) },
    { label: 'Editar', icon: 'ti-pencil', onClick: () => abrirLancamento(l) }, { label: 'Duplicar', icon: 'ti-copy', onClick: () => abrirLancamento(null, { tipo, defaults: { ...l, id: undefined, baixas: [], status: 'aberto', parcela_num: null, parcela_total: null, grupo_parcelas_id: null, recorrencia_id: null, recorrencia: null, conciliado_fitid: null, vencimento: today() } }) },
    l.contato_id ? { label: 'Ver do contato', icon: 'ti-user', onClick: () => { S.contato = l.contato_id; S._adv = true; setPer('todos'); } } : null, '-',
    { label: 'Excluir', icon: 'ti-trash', danger: true, onClick: () => excluirLancamento(l) }]); });
  // bulk
  const bulk = root.querySelector('[data-bulk]');
  const paintBulk = () => { const n = S.sel.size; bulk.classList.toggle('hidden', !n); root.querySelector('[data-bulk-n]').textContent = `${n} selecionado${n > 1 ? 's' : ''} · ${money(sum([...S.sel].map(id => app.lanc(id)).filter(Boolean), emAberto))} em aberto`; };
  paintBulk();
  root.querySelector('[data-all]').onchange = e => { S.sel = new Set(e.target.checked ? ordenada.filter(l => statusOf(l) !== 'pago').map(l => l.id) : []); render(root, { tipo }); };
  root.querySelector('[data-bulk-x]').onclick = () => { S.sel.clear(); render(root, { tipo }); };
  root.querySelector('[data-bulk-pay]').onclick = () => { const ls = [...S.sel].map(id => app.lanc(id)).filter(l => l && statusOf(l) !== 'pago'); if (!ls.length) return toast('Nada em aberto na seleção', 'warn'); abrirBaixa(ls, { onDone: () => { S.sel.clear(); } }); };
  root.querySelector('[data-bulk-del]').onclick = async () => { const ids = [...S.sel]; if (!await confirm({ title: `Excluir ${ids.length} lançamentos`, msg: 'Essa ação não pode ser desfeita.', ok: 'Excluir', danger: true })) return; if (db.backend.name === 'supabase') await db.upsert('lancamentos', ids.map(id => ({ ...app.lanc(id), deletado_em: new Date().toISOString() }))); else await db.remove('lancamentos', ids); S.sel.clear(); toast('Excluídos'); };
}

function linha(l, C, S) {
  const st = statusOf(l); const cat = C.cat(l.categoria_id); const ct = C.contato(l.contato_id); const conta = C.conta(l.conta_id);
  const ab = emAberto(l); const pago = st === 'pago';
  return `<div class="row ${st} ${S.sel.has(l.id) ? 'sel' : ''}" data-id="${l.id}">
    <label class="chk"><input type="checkbox" data-sel="${l.id}" ${S.sel.has(l.id) ? 'checked' : ''} ${pago ? 'disabled' : ''}></label>
    ${catIcon(cat, 34)}
    <div class="r-b"><div class="r-t">${esc(l.descricao)}${l.parcela_total ? `<span class="parc">${l.parcela_num}/${l.parcela_total}</span>` : ''}${l.recorrencia_id ? icon('ti-repeat', 'rep') : ''}${l.anexos?.length ? icon('ti-paperclip', 'rep') : ''}</div>
      <div class="r-s">${ct ? `<span>${esc(ct.nome)}</span>` : ''}${cat ? `<span class="r-cat">${catIcon(cat, 14)}${esc(cat.nome)}</span>` : ''}${(l.tags || []).map(t => { const tg = C.tags.find(x => x.nome === t); return tg ? tagChip(tg) : ''; }).join('')}</div></div>
    <div class="r-conta" title="${esc(conta?.nome || '')}">${bankIcon(conta, 22)}<span>${esc(conta?.nome || '')}</span></div>
    <div class="r-d ${st === 'atrasado' ? 'neg' : ''}">${pago ? `<small>${l.tipo === 'receber' ? 'recebido' : 'pago'} em</small>${fmtDate(dataPagamento(l))}` : `${fmtDate(l.vencimento)}<small>${relDate(l.vencimento)}</small>`}</div>
    <div class="r-v"><span class="amt ${l.tipo === 'receber' ? 'pos' : 'neg'}">${money(l.valor)}</span>${st === 'parcial' ? `<small>falta ${money(ab)}</small>` : ''}</div>
    <div class="r-st">${statusPill(l)}</div>
    <div class="r-a">${!pago ? `<button class="ibtn pay" data-pay="${l.id}" title="${l.tipo === 'receber' ? 'Receber' : 'Pagar'}">${icon('ti-check')}</button>` : ''}<button class="ibtn" data-menu="${l.id}">${icon('ti-dots-vertical')}</button></div>
  </div>`;
}
function weekLabel(iso) { const d = new Date(iso + 'T00:00'); const day = (d.getDay() + 6) % 7; d.setDate(d.getDate() - day); const e = new Date(d); e.setDate(e.getDate() + 6); return `Semana ${fmtDate(d.toISOString().slice(0, 10), { short: true })} – ${fmtDate(e.toISOString().slice(0, 10), { short: true })}`; }
function aplicarPeriodo(S) {
  const t = today(); const off = S.offset || 0;
  switch (S.periodo) {
    case 'mes': { const m = addMonths(monthStart(t), off); S.de = m; S.ate = monthEnd(m); break; }
    case 'mes-1': { const m = addMonths(monthStart(t), -1 + off); S.de = m; S.ate = monthEnd(m); break; }
    case 'mes+1': { const m = addMonths(monthStart(t), 1 + off); S.de = m; S.ate = monthEnd(m); break; }
    case 'hoje': S.de = S.ate = addDays(t, off); break;
    case 'semana': { const d = new Date(t + 'T00:00'); const day = (d.getDay() + 6) % 7; d.setDate(d.getDate() - day + off * 7); S.de = d.toISOString().slice(0, 10); S.ate = addDays(S.de, 6); break; }
    case '7d': S.de = addDays(t, off * 7); S.ate = addDays(S.de, 7); break;
    case '30d': S.de = addDays(t, off * 30); S.ate = addDays(S.de, 30); break;
    case 'ano': { const y = Number(t.slice(0, 4)) + off; S.de = `${y}-01-01`; S.ate = `${y}-12-31`; break; }
    case 'custom': { if (off) { const n = daysBetween(S.de, S.ate) + 1; S.de = addDays(S.de, n * off); S.ate = addDays(S.ate, n * off); S.offset = 0; } break; }
    case 'todos': S.de = null; S.ate = null; break;
  }
}
function moverPeriodo(S, dir) {
  if (S.periodo === 'todos') return;
  if (S.periodo === 'mes-1') { S.periodo = 'mes'; S.offset = -1; } else if (S.periodo === 'mes+1') { S.periodo = 'mes'; S.offset = 1; }
  if (S.periodo === 'custom') { const n = daysBetween(S.de, S.ate) + 1; S.de = addDays(S.de, n * dir); S.ate = addDays(S.ate, n * dir); return; }
  S.offset = (S.offset || 0) + dir; aplicarPeriodo(S);
}
function labelPeriodo(S) {
  if (S.periodo === 'todos') return 'Todo o período';
  if (S.periodo.startsWith('mes')) return fmtMonth(S.de, true);
  if (S.periodo === 'ano') return S.de.slice(0, 4);
  if (S.de === S.ate) return fmtDate(S.de, { weekday: true });
  return `${fmtDate(S.de, { short: true })} – ${fmtDate(S.ate, { short: true })}`;
}
function exportar(list, C, tipo) {
  const csv = toCSV(list, [{ label: 'Vencimento', get: l => fmtDate(l.vencimento) }, { label: 'Descrição', key: 'descricao' }, { label: 'Contato', get: l => C.contato(l.contato_id)?.nome || '' }, { label: 'Categoria', get: l => C.cat(l.categoria_id)?.nome || '' }, { label: 'Conta', get: l => C.conta(l.conta_id)?.nome || '' }, { label: 'Valor', get: l => String(l.valor).replace('.', ',') }, { label: 'Pago', get: l => String(liquidado(l)).replace('.', ',') }, { label: 'Status', get: l => statusOf(l) }, { label: 'Pago em', get: l => fmtDate(dataPagamento(l)) }, { label: 'Competência', get: l => (l.competencia || '').slice(0, 7) }, { label: 'Referência', key: 'referencia' }, { label: 'Tags', get: l => (l.tags || []).join(', ') }, { label: 'Centro de custo', get: l => (l.rateio_centros || []).map(r => `${C.centro(r.centro_id)?.nome} ${r.percent}%`).join(', ') }]);
  download(`${tipo}-${today()}.csv`, csv); toast('CSV exportado');
}
