// Contas: cards com saldo, extrato com saldo corrente, transferências e conciliação (OFX/CSV).
import { app } from '../app.js';
import { db, prefs } from '../db.js';
import { h, icon, bankIcon, catIcon, avatar, moneyEl, menu, emptyState, toast, confirm, modal, drawer, combobox, on, field, fieldEl, segmented } from '../ui.js';
import { money, today, addDays, monthStart, monthEnd, addMonths, fmtDate, fmtMonth, relDate, esc, sum, round2, toCSV, download, groupBy, readFile, parseOFX, parseCSVExtrato, uid, norm } from '../utils.js';
import { saldoConta, saldoProjetado, movimentos, statusOf, sugerirConciliacao, emAberto } from '../model.js';
import { abrirLancamento, abrirDetalhe, abrirBaixa } from './form-lancamento.js';
import { abrirConta } from './cadastros.js';

const S = { contaId: null, mes: monthStart(today()), aba: 'extrato' };

export function render(root, { contaId = null } = {}) {
  const E = app.empresaId; const C = app.ctx();
  const contas = C.contas.filter(c => !c.arquivada).sort((a, b) => (a.ordem || 0) - (b.ordem || 0));
  if (contaId) S.contaId = contaId;
  if (!S.contaId || !db.get('contas', S.contaId)) S.contaId = contas[0]?.id || null;
  const conta = db.get('contas', S.contaId);
  const total = round2(sum(contas.filter(c => c.tipo !== 'cartao'), c => saldoConta(E, c.id)));

  root.innerHTML = `<div class="page extrato">
    <header class="ph"><div><div class="eyebrow">Saldo total em contas</div><h1 class="money">${money(total)}</h1></div>
      <div class="ph-a"><button class="btn secondary" data-transf>${icon('ti-arrows-exchange')}Transferir</button><button class="btn ghost" data-nova-conta>${icon('ti-plus')}Conta</button></div></header>
    <section class="contas-strip sel" data-contas></section>
    ${conta ? `<section class="card ext-card"><div class="ext-h">${bankIcon(conta, 44)}<div class="ext-i"><div class="ext-n">${esc(conta.nome)}<button class="ibtn xs" data-edit-conta>${icon('ti-pencil')}</button></div><div class="muted sm">${tipoNome(conta)}${conta.agencia ? ` · Ag ${esc(conta.agencia)}` : ''}${conta.numero ? ` · ${esc(conta.numero)}` : ''}</div></div>
        <div class="ext-s"><div><span>Saldo atual</span><b class="${saldoConta(E, conta.id) < 0 ? 'neg' : ''}">${money(saldoConta(E, conta.id))}</b></div><div><span>Projetado 30d</span><b>${money(saldoProjetado(E, conta.id, addDays(today(), 30)))}</b></div></div></div>
      <div class="ext-tabs" data-tabs></div><div data-body></div></section>` : ''}
  </div>`;

  const cs = root.querySelector('[data-contas]');
  cs.innerHTML = contas.map(c => { const s = saldoConta(E, c.id); return `<button class="conta-card ${c.id === S.contaId ? 'on' : ''}" data-conta="${c.id}">${bankIcon(c, 40)}<div class="cc-i"><div class="cc-n">${esc(c.nome)}</div><div class="cc-t">${tipoNome(c)}</div></div><div class="cc-v ${s < 0 ? 'neg' : ''}">${money(s)}</div></button>`; }).join('');
  on(cs, 'click', '[data-conta]', (e, b) => { S.contaId = b.dataset.conta; location.hash = '#/extrato/' + S.contaId; });
  root.querySelector('[data-transf]').onclick = () => abrirLancamento(null, { tipo: 'transferencia', defaults: { conta_id: S.contaId } });
  root.querySelector('[data-nova-conta]').onclick = () => abrirConta();
  if (!conta) { root.querySelector('.page').appendChild(emptyState({ icon: 'ti-building-bank', title: 'Nenhuma conta', text: 'Cadastre a primeira conta bancária.', action: { label: 'Nova conta', icon: 'ti-plus', onClick: () => abrirConta() } })); return; }
  root.querySelector('[data-edit-conta]').onclick = () => abrirConta(conta);
  const tabs = segmented([{ id: 'extrato', label: 'Extrato', icon: 'ti-list' }, { id: 'conciliar', label: 'Conciliação', icon: 'ti-checks' }, { id: 'previsto', label: 'Previsto', icon: 'ti-calendar-time' }], S.aba, v => { S.aba = v; paint(); });
  root.querySelector('[data-tabs]').appendChild(tabs);
  const body = root.querySelector('[data-body]');
  const paint = () => { body.innerHTML = ''; if (S.aba === 'extrato') paintExtrato(body, conta, C, E); else if (S.aba === 'conciliar') paintConciliar(body, conta, C, E); else paintPrevisto(body, conta, C, E); };
  paint();
}
function tipoNome(c) { return { corrente: 'Conta corrente', poupanca: 'Poupança', investimento: 'Investimento', gateway: 'Gateway', cartao: 'Cartão de crédito', caixa: 'Dinheiro' }[c.tipo] || 'Conta'; }

function paintExtrato(body, conta, C, E) {
  const de = S.mes, ate = monthEnd(S.mes);
  const movs = movimentos(E, conta.id, de, ate);
  const saldoIni = saldoConta(E, conta.id, addDays(de, -1));
  let s = saldoIni; const rows = movs.map(m => { s = round2(s + m.valor); return { ...m, saldo: s }; }).reverse();
  const entradas = round2(sum(movs.filter(m => m.valor > 0), m => m.valor)), saidas = round2(sum(movs.filter(m => m.valor < 0), m => -m.valor));
  body.innerHTML = `<div class="toolbar"><div class="periodo"><button class="ibtn" data-prev>${icon('ti-chevron-left')}</button><span class="per-l">${fmtMonth(S.mes, true)}</span><button class="ibtn" data-next>${icon('ti-chevron-right')}</button></div><span class="grow"></span><button class="btn ghost sm" data-export>${icon('ti-download')}CSV</button></div>
    <div class="sumbar"><div><span>Saldo inicial</span><b>${money(saldoIni)}</b></div><div><span>Entradas</span><b class="pos">${money(entradas)}</b></div><div><span>Saídas</span><b class="neg">${money(saidas)}</b></div><div><span>Saldo final</span><b>${money(round2(saldoIni + entradas - saidas))}</b></div></div>
    <div class="listwrap" data-list></div>`;
  body.querySelector('[data-prev]').onclick = () => { S.mes = addMonths(S.mes, -1); render(document.getElementById('main')); };
  body.querySelector('[data-next]').onclick = () => { S.mes = addMonths(S.mes, 1); render(document.getElementById('main')); };
  body.querySelector('[data-export]').onclick = () => { download(`extrato-${norm(conta.nome)}-${S.mes.slice(0, 7)}.csv`, toCSV([...rows].reverse(), [{ label: 'Data', get: r => fmtDate(r.data) }, { label: 'Descrição', key: 'descricao' }, { label: 'Valor', get: r => String(r.valor).replace('.', ',') }, { label: 'Saldo', get: r => String(r.saldo).replace('.', ',') }])); };
  const lw = body.querySelector('[data-list]');
  if (!rows.length) { lw.appendChild(emptyState({ icon: 'ti-file-invoice', title: 'Sem movimentos', text: `Nenhuma baixa ou transferência nesta conta em ${fmtMonth(S.mes, true)}.` })); return; }
  const grupos = groupBy(rows, r => r.data); let html = '';
  for (const [d, arr] of grupos) {
    html += `<div class="grp-h"><span>${relDate(d)} <small>${fmtDate(d)}</small></span><span class="grp-t muted">saldo ${money(arr[0].saldo)}</span></div>`;
    html += arr.map(r => { const l = r.lancamento; const isTr = r.tipo === 'transferencia'; const cat = C.cat(l.categoria_id); const ct = C.contato(l.contato_id); const contra = isTr ? C.conta(r.contra) : null;
      return `<div class="row mov" data-id="${l.id}">${isTr ? bankIcon(contra, 36) : ct ? avatar(ct.nome, 36) : catIcon(cat, 36)}<div class="r-b"><div class="r-t">${esc(r.descricao)}${l.conciliado_fitid ? icon('ti-checks', 'rep ok') : ''}</div><div class="r-s">${isTr ? `<span>${r.valor < 0 ? 'para' : 'de'} ${esc(contra?.nome || '')}</span>` : `${ct ? `<span>${esc(ct.nome)}</span>` : ''}${cat ? `<span class="r-cat">${catIcon(cat, 14)}${esc(cat.nome)}</span>` : ''}`}</div></div><div class="r-v">${moneyEl(r.valor)}</div><div class="r-saldo muted">${money(r.saldo)}</div></div>`; }).join('');
  }
  lw.innerHTML = html;
  on(lw, 'click', '.row', (e, r) => abrirDetalhe(app.lanc(r.dataset.id)));
}

function paintPrevisto(body, conta, C, E) {
  const t = today(); const ate = addDays(t, 60);
  const abertos = C.lancamentos.filter(l => l.tipo !== 'transferencia' && l.conta_id === conta.id && !['pago', 'cancelado'].includes(statusOf(l)) && l.vencimento <= ate).sort((a, b) => a.vencimento < b.vencimento ? -1 : 1);
  let s = saldoConta(E, conta.id);
  body.innerHTML = `<p class="muted sm pad">Lançamentos em aberto previstos nesta conta nos próximos 60 dias e o saldo projetado após cada um. Saldo hoje: <b>${money(s)}</b></p><div class="listwrap" data-list></div>`;
  const lw = body.querySelector('[data-list]');
  if (!abertos.length) { lw.appendChild(emptyState({ icon: 'ti-calendar-check', title: 'Nada previsto', text: 'Nenhum lançamento em aberto nesta conta nos próximos 60 dias.' })); return; }
  lw.innerHTML = abertos.map(l => { const v = (l.tipo === 'receber' ? 1 : -1) * emAberto(l); s = round2(s + v); const cat = C.cat(l.categoria_id); const ct = C.contato(l.contato_id); const st = statusOf(l);
    return `<div class="row mov ${st}" data-id="${l.id}">${ct ? avatar(ct.nome, 36) : catIcon(cat, 36)}<div class="r-b"><div class="r-t">${esc(l.descricao)}</div><div class="r-s"><span class="${st === 'atrasado' ? 'neg' : ''}">${relDate(l.vencimento)}</span>${cat ? `<span class="r-cat">${catIcon(cat, 14)}${esc(cat.nome)}</span>` : ''}</div></div><div class="r-v">${moneyEl(v)}</div><div class="r-saldo ${s < 0 ? 'neg' : 'muted'}">${money(s)}</div><div class="r-a"><button class="ibtn pay" data-pay="${l.id}">${icon('ti-check')}</button></div></div>`; }).join('');
  on(lw, 'click', '[data-pay]', (e, b) => { e.stopPropagation(); abrirBaixa(app.lanc(b.dataset.pay)); });
  on(lw, 'click', '.row', (e, r) => { if (e.target.closest('button')) return; abrirDetalhe(app.lanc(r.dataset.id)); });
}

// ---------- conciliação ----------
function paintConciliar(body, conta, C, E) {
  const itens = C.extrato.filter(i => i.conta_id === conta.id).sort((a, b) => b.data.localeCompare(a.data));
  const pend = itens.filter(i => !i.lancamento_id && !i.ignorado);
  body.innerHTML = `<div class="conc-top"><div><b>${pend.length}</b> pendentes · <b>${itens.filter(i => i.lancamento_id).length}</b> conciliados · <b>${itens.filter(i => i.ignorado).length}</b> ignorados</div><span class="grow"></span>
    <label class="btn secondary sm">${icon('ti-upload')}Importar OFX / CSV<input type="file" hidden accept=".ofx,.csv,.txt,.qfx"></label>${itens.length ? `<button class="btn ghost sm" data-auto>${icon('ti-wand')}Conciliar automático</button><button class="btn ghost sm" data-limpar>${icon('ti-trash')}</button>` : ''}</div>
    <div class="conc-list" data-list></div>`;
  body.querySelector('input[type=file]').onchange = async e => {
    const f = e.target.files[0]; if (!f) return; const txt = await readFile(f);
    const parsed = /<OFX|<STMTTRN/i.test(txt) ? parseOFX(txt) : parseCSVExtrato(txt);
    if (!parsed.items.length) return toast('Não encontrei lançamentos no arquivo', 'err');
    const existentes = new Set(itens.map(i => i.fitid));
    const novos = parsed.items.filter(i => !existentes.has(i.fitid)).map(i => ({ id: uid(), empresa_id: E, conta_id: conta.id, data: i.data, valor: round2(i.valor), descricao: i.descricao, fitid: i.fitid, lancamento_id: null, ignorado: false, importado_em: new Date().toISOString() }));
    if (!novos.length) return toast('Todos os itens do arquivo já estavam importados', 'warn');
    await db.upsert('extrato_itens', novos); toast(`${novos.length} itens importados${parsed.items.length - novos.length ? ` (${parsed.items.length - novos.length} repetidos ignorados)` : ''}`);
  };
  body.querySelector('[data-auto]')?.addEventListener('click', async () => {
    let n = 0; const ups = []; const lups = [];
    for (const it of pend) { const sug = sugerirConciliacao({ ...it, conta_id: conta.id }, E); if (sug[0] && sug[0].score >= 95) { const l = sug[0].l; if (lups.some(x => x.id === l.id)) continue; ups.push({ ...it, lancamento_id: l.id }); lups.push(await conciliarLanc(l, it, conta, false)); n++; } }
    if (n) { await db.upsert('lancamentos', lups); await db.upsert('extrato_itens', ups); } toast(n ? `${n} itens conciliados automaticamente` : 'Nenhuma correspondência exata encontrada', n ? 'ok' : 'warn');
  });
  body.querySelector('[data-limpar]')?.addEventListener('click', async () => { if (await confirm({ title: 'Limpar extrato importado', msg: 'Remove os itens importados desta conta (as baixas já feitas ficam). Continuar?', ok: 'Limpar', danger: true })) { await db.remove('extrato_itens', itens.map(i => i.id)); } });
  const lw = body.querySelector('[data-list]');
  if (!itens.length) { lw.appendChild(emptyState({ icon: 'ti-file-import', title: 'Importe o extrato do banco', text: 'Baixe o OFX (ou CSV) no internet banking e importe aqui. O sistema sugere o lançamento correspondente para cada linha e você concilia em um clique.' })); return; }
  lw.innerHTML = itens.map(it => {
    const l = it.lancamento_id ? app.lanc(it.lancamento_id) : null; const sug = !l && !it.ignorado ? sugerirConciliacao({ ...it, conta_id: conta.id }, E) : [];
    const best = sug[0];
    return `<div class="conc ${l ? 'ok' : it.ignorado ? 'ign' : ''}" data-id="${it.id}"><div class="conc-l"><div class="conc-d">${fmtDate(it.data)}</div><div class="conc-t">${esc(it.descricao)}</div>${moneyEl(it.valor)}</div>
      <div class="conc-m">${l ? icon('ti-checks') : it.ignorado ? icon('ti-eye-off') : icon('ti-arrow-right')}</div>
      <div class="conc-r">${l ? `<div class="conc-t">${esc(l.descricao)}</div><div class="muted sm">${fmtDate(l.vencimento)} · ${money(l.valor)} · ${C.cat(l.categoria_id)?.nome || 'Transferência'}</div><button class="btn ghost xs" data-undo="${it.id}">Desfazer</button>` : it.ignorado ? `<span class="muted sm">Ignorado</span> <button class="btn ghost xs" data-unign="${it.id}">Restaurar</button>` : best ? `<div class="conc-t">${esc(best.l.descricao)} <small class="muted">${best.score >= 95 ? 'match exato' : 'sugestão'}</small></div><div class="muted sm">${fmtDate(best.l.vencimento)} · ${money(best.l.valor)} · ${C.cat(best.l.categoria_id)?.nome || 'Transferência'}</div><div class="conc-a"><button class="btn primary xs" data-ok="${it.id}" data-l="${best.l.id}">Conciliar</button>${sug.length > 1 ? `<button class="btn ghost xs" data-outro="${it.id}">Outro</button>` : ''}<button class="btn ghost xs" data-novo="${it.id}">Criar</button><button class="btn ghost xs" data-ign="${it.id}">Ignorar</button></div>` : `<div class="muted sm">Sem correspondência</div><div class="conc-a"><button class="btn secondary xs" data-novo="${it.id}">Criar lançamento</button><button class="btn ghost xs" data-outro="${it.id}">Escolher</button><button class="btn ghost xs" data-ign="${it.id}">Ignorar</button></div>`}</div></div>`;
  }).join('');
  const item = id => db.get('extrato_itens', id);
  on(lw, 'click', '[data-ok]', async (e, b) => { const it = item(b.dataset.ok); const l = app.lanc(b.dataset.l); await db.upsert('lancamentos', await conciliarLanc(l, it, conta, false)); await db.upsert('extrato_itens', { ...it, lancamento_id: l.id }); toast('Conciliado'); });
  on(lw, 'click', '[data-undo]', async (e, b) => { const it = item(b.dataset.undo); const l = app.lanc(it.lancamento_id); if (l) await db.upsert('lancamentos', { ...l, conciliado_fitid: null }); await db.upsert('extrato_itens', { ...it, lancamento_id: null }); });
  on(lw, 'click', '[data-ign]', async (e, b) => { const it = item(b.dataset.ign); await db.upsert('extrato_itens', { ...it, ignorado: true }); });
  on(lw, 'click', '[data-unign]', async (e, b) => { const it = item(b.dataset.unign); await db.upsert('extrato_itens', { ...it, ignorado: false }); });
  on(lw, 'click', '[data-novo]', (e, b) => { const it = item(b.dataset.novo); const tipo = it.valor >= 0 ? 'receber' : 'pagar';
    const d = abrirLancamento(null, { tipo, defaults: { descricao: it.descricao, valor: Math.abs(it.valor), vencimento: it.data, competencia: monthStart(it.data), conta_id: conta.id, origem: 'extrato', conciliado_fitid: it.fitid } });
    const prevClose = d.close; d.close = async r => { prevClose(r); if (r) { const l = db.of('lancamentos', E).find(x => x.conciliado_fitid === it.fitid); if (l) { if (!(l.baixas || []).length) await db.upsert('lancamentos', { ...l, baixas: [{ id: uid(), data: it.data, valor: Math.abs(it.valor), conta_id: conta.id, juros: 0, multa: 0, desconto: 0 }] }); await db.upsert('extrato_itens', { ...it, lancamento_id: l.id }); } } }; });
  on(lw, 'click', '[data-outro]', (e, b) => { const it = item(b.dataset.outro); escolherLanc(it, conta, C, E); });
}
async function conciliarLanc(l, it, conta, save = true) {
  let novo = { ...l, conciliado_fitid: it.fitid };
  if (l.tipo !== 'transferencia') {
    const abs = Math.abs(it.valor); const temBaixaIgual = (l.baixas || []).some(b => Math.abs(Number(b.valor) - abs) < 0.01 && b.conta_id === conta.id);
    if (!temBaixaIgual && emAberto(l) > 0) novo.baixas = [...(l.baixas || []), { id: uid(), data: it.data, valor: Math.min(abs, emAberto(l)), conta_id: conta.id, juros: 0, multa: 0, desconto: 0, observacao: 'Conciliação' }];
  }
  if (save) await db.upsert('lancamentos', novo);
  return novo;
}
function escolherLanc(it, conta, C, E) {
  const tipo = it.valor >= 0 ? 'receber' : 'pagar';
  const cands = C.lancamentos.filter(l => !l.conciliado_fitid && l.status !== 'cancelado' && (l.tipo === tipo || l.tipo === 'transferencia') && Math.abs(l.vencimento.localeCompare(it.data)) >= 0 && Math.abs(new Date(l.vencimento) - new Date(it.data)) < 45 * 86400000).sort((a, b) => Math.abs(a.valor - Math.abs(it.valor)) - Math.abs(b.valor - Math.abs(it.valor)));
  const m = modal({ title: 'Escolher lançamento', size: 'md', body: `<div class="muted sm">${fmtDate(it.data)} · ${esc(it.descricao)} · <b>${money(it.valor)}</b></div><div class="search"><i class="ti ti-search"></i><input placeholder="Filtrar…"></div><div class="listwrap" data-l></div>`, footer: null });
  const paint = q => { m.body.querySelector('[data-l]').innerHTML = cands.filter(l => !q || norm(l.descricao).includes(norm(q))).slice(0, 40).map(l => `<div class="row mov" data-pick="${l.id}">${catIcon(C.cat(l.categoria_id), 32)}<div class="r-b"><div class="r-t">${esc(l.descricao)}</div><div class="r-s">${fmtDate(l.vencimento)} · ${C.contato(l.contato_id)?.nome || C.cat(l.categoria_id)?.nome || ''}</div></div><div class="r-v">${money(l.valor)}</div></div>`).join('') || '<div class="muted sm pad">Nada parecido.</div>'; };
  paint(''); m.body.querySelector('input').oninput = e => paint(e.target.value);
  on(m.body, 'click', '[data-pick]', async (e, r) => { const l = app.lanc(r.dataset.pick); await conciliarLanc(l, it, conta); await db.upsert('extrato_itens', { ...it, lancamento_id: l.id }); m.close(); toast('Conciliado'); });
}
