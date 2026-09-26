// Formulário de lançamento (despesa / receita / transferência) + baixa (pagar/receber) + estorno.
import { db } from '../db.js';
import { drawer, modal, field, fieldEl, moneyInput, combobox, segmented, toggle, toast, confirm, icon, h, bankIcon, catIcon, avatar, on } from '../ui.js';
import { today, addDays, addMonths, monthStart, uid, esc, money, round2, fmtDate, sum, readFile } from '../utils.js';
import { FORMAS, gerarParcelas, gerarRecorrencia, emAberto, statusOf, liquidado } from '../model.js';
import { app } from '../app.js';

const contaOpt = c => ({ id: c.id, label: c.nome, sub: c.tipo === 'cartao' ? 'Cartão' : undefined, icon: bankIcon(c, 24), group: c.arquivada ? 'Arquivadas' : undefined });
const catOpts = (cats, tipo) => cats.filter(c => !c.arquivada && (!tipo || c.tipo === tipo)).sort((a, b) => (a.grupo - b.grupo) || (a.ordem - b.ordem)).map(c => ({ id: c.id, label: c.nome, sub: c.codigo, icon: catIcon(c, 24), group: `${c.grupo} · ${c.subgrupo || ''}`, keywords: c.subgrupo }));
const contatoOpts = (contatos, tipo) => contatos.filter(c => !c.arquivado).sort((a, b) => a.nome.localeCompare(b.nome)).map(c => ({ id: c.id, label: c.nome, sub: c.tipo === 'socio' ? 'Sócio' : c.tipo === 'cliente' ? 'Cliente' : c.tipo === 'fornecedor' ? 'Fornecedor' : c.tipo === 'funcionario' ? 'Funcionário' : '', icon: avatar(c.nome, 24) }));

export function abrirLancamento(existing = null, { tipo = 'pagar', defaults = {} } = {}) {
  const E = app.empresaId; const C = app.ctx();
  const isEdit = !!existing;
  const L = existing ? JSON.parse(JSON.stringify(existing)) : { tipo, descricao: '', valor: 0, vencimento: today(), competencia: monthStart(today()), categoria_id: null, contato_id: null, conta_id: C.contas.find(c => !c.arquivada && c.tipo !== 'cartao')?.id || null, forma_pagamento: 'pix', tags: [], anexos: [], rateio_categorias: [], rateio_centros: [], observacoes: '', referencia: '', baixas: [], status: 'aberto', ...defaults };
  const d = drawer({ title: isEdit ? 'Editar lançamento' : 'Novo lançamento', size: 'lg', cls: 'form-lanc' });
  const body = d.body; body.innerHTML = '';
  const f = h(`<form class="lform" autocomplete="off"></form>`); body.appendChild(f);

  // tipo
  const segTipo = segmented([{ id: 'pagar', label: 'Despesa', icon: 'ti-arrow-up-right', cls: 'out' }, { id: 'receber', label: 'Receita', icon: 'ti-arrow-down-left', cls: 'in' }, { id: 'transferencia', label: 'Transferência', icon: 'ti-arrows-exchange', cls: 'tr' }], L.tipo, v => { L.tipo = v; repaintTipo(); }, 'big');
  if (isEdit) segTipo.querySelectorAll('button').forEach(b => { if (b.dataset.v !== L.tipo) b.disabled = true; });
  f.appendChild(segTipo);

  // linha valor + descrição
  const valor = moneyInput({ value: L.valor, cls: 'xl' });
  const descr = h(`<input class="inp" list="dl-desc" placeholder="Ex.: Meta Ads · setembro" value="${esc(L.descricao)}" required>`);
  const dl = h(`<datalist id="dl-desc">${[...new Set(C.lancamentos.map(l => l.descricao).filter(Boolean))].slice(0, 300).map(s => `<option value="${esc(s)}">`).join('')}</datalist>`);
  f.appendChild(h('<div class="row2 top"></div>')).append(fieldEl('Valor', valor, { req: true }), fieldEl('Descrição', descr, { req: true }), dl);

  // datas
  const venc = h(`<input class="inp" type="date" value="${L.vencimento}" required>`);
  const comp = h(`<input class="inp" type="month" value="${(L.competencia || L.vencimento).slice(0, 7)}">`);
  const quick = h(`<div class="quick"><button type="button" data-d="0">Hoje</button><button type="button" data-d="1">Amanhã</button><button type="button" data-d="7">+7 dias</button><button type="button" data-d="30">+30 dias</button></div>`);
  quick.onclick = e => { const b = e.target.closest('button'); if (!b) return; venc.value = addDays(today(), Number(b.dataset.d)); comp.value = venc.value.slice(0, 7); };
  const rowDatas = h('<div class="row2"></div>'); const fv = fieldEl('Vencimento', venc, { req: true }); fv.appendChild(quick); rowDatas.append(fv, fieldEl('Competência', comp, { hint: 'Mês do DRE' })); f.appendChild(rowDatas);
  venc.addEventListener('change', () => { if (!compTouched) comp.value = venc.value.slice(0, 7); }); let compTouched = false; comp.addEventListener('change', () => compTouched = true);

  // contato + categoria
  const contato = combobox({ options: contatoOpts(C.contatos), value: L.contato_id, placeholder: 'Cliente, fornecedor…', allowCreate: async nome => { const c = await db.upsert('contatos', { id: uid(), empresa_id: E, nome, tipo: L.tipo === 'receber' ? 'cliente' : 'fornecedor', documento: '', email: '', telefone: '', pix: '', cidade: '', uf: '', observacoes: '', arquivado: false }); toast('Contato criado'); return { id: c.id, label: c.nome, icon: avatar(c.nome, 24) }; } });
  const categoria = combobox({ options: catOpts(C.categorias, L.tipo === 'receber' ? 'in' : 'out'), value: L.categoria_id, placeholder: 'Categoria', allowEmpty: false });
  const rowCC = h('<div class="row2"></div>'); rowCC.append(fieldEl('Contato', contato), fieldEl('Categoria', categoria, { req: true })); f.appendChild(rowCC);
  // rateio de categorias
  const rateioBox = h(`<div class="rateio hidden"><div class="rateio-h"><span>Rateio por categoria</span><button type="button" class="btn ghost xs" data-add>${icon('ti-plus')}Linha</button></div><div class="rateio-l"></div><div class="rateio-t"></div></div>`);
  const rateioBtn = h(`<button type="button" class="linkbtn">${icon('ti-layout-list')}Dividir em mais de uma categoria</button>`);
  rowCC.lastChild.appendChild(rateioBtn); f.appendChild(rateioBox);
  let rateio = (L.rateio_categorias || []).map(r => ({ ...r }));
  const paintRateio = () => {
    const list = rateioBox.querySelector('.rateio-l'); list.innerHTML = '';
    rateio.forEach((r, i) => {
      const row = h(`<div class="rateio-r"></div>`);
      const cb = combobox({ options: catOpts(C.categorias, L.tipo === 'receber' ? 'in' : 'out'), value: r.categoria_id, placeholder: 'Categoria', allowEmpty: false, onChange: v => r.categoria_id = v });
      const mi = moneyInput({ value: r.valor }); mi.addEventListener('money', e => { r.valor = e.detail; paintTot(); });
      const ds = h(`<input class="inp" placeholder="Detalhe (opcional)" value="${esc(r.descricao || '')}">`); ds.oninput = () => r.descricao = ds.value;
      const x = h(`<button type="button" class="ibtn">${icon('ti-x')}</button>`); x.onclick = () => { rateio.splice(i, 1); paintRateio(); };
      row.append(cb, mi, ds, x); list.appendChild(row);
    });
    paintTot();
  };
  const paintTot = () => { const t = sum(rateio, r => r.valor); const v = valor.get(); const diff = round2(v - t); rateioBox.querySelector('.rateio-t').innerHTML = `Soma ${money(t)} de ${money(v)} ${Math.abs(diff) > 0.005 ? `<b class="neg">· faltam ${money(diff)}</b>` : `<b class="pos">· ok</b>`}`; };
  rateioBtn.onclick = () => { rateioBox.classList.remove('hidden'); rateioBtn.classList.add('hidden'); if (!rateio.length) rateio = [{ categoria_id: categoria.get(), valor: valor.get(), descricao: '' }, { categoria_id: null, valor: 0, descricao: '' }]; paintRateio(); };
  rateioBox.querySelector('[data-add]').onclick = () => { rateio.push({ categoria_id: null, valor: round2(valor.get() - sum(rateio, r => r.valor)), descricao: '' }); paintRateio(); };
  valor.addEventListener('money', paintTot);
  if (rateio.length) { rateioBox.classList.remove('hidden'); rateioBtn.classList.add('hidden'); paintRateio(); }

  // conta + forma
  const conta = combobox({ options: C.contas.filter(c => !c.arquivada || c.id === L.conta_id).map(contaOpt), value: L.conta_id, placeholder: 'Conta', allowEmpty: false });
  const contaDest = combobox({ options: C.contas.filter(c => !c.arquivada || c.id === L.conta_destino_id).map(contaOpt), value: L.conta_destino_id || null, placeholder: 'Conta de destino', allowEmpty: false });
  const forma = combobox({ options: FORMAS.map(x => ({ id: x.id, label: x.nome, icon: icon(x.icone, 'oi') })), value: L.forma_pagamento || 'pix', allowEmpty: false });
  const rowConta = h('<div class="row2"></div>'); const fConta = fieldEl('Conta', conta, { req: true }); const fDest = fieldEl('Para a conta', contaDest, { req: true }); const fForma = fieldEl('Forma', forma);
  rowConta.append(fConta, fDest, fForma); f.appendChild(rowConta);

  // centro de custo (rateio %)
  let centros = (L.rateio_centros || []).map(r => ({ ...r }));
  const ccBox = h(`<div class="ccbox"><div class="fl">Centro de custo</div><div class="cc-l"></div></div>`);
  const paintCC = () => {
    const l = ccBox.querySelector('.cc-l'); l.innerHTML = '';
    C.centros.filter(c => !c.arquivado).forEach(c => {
      const r = centros.find(x => x.centro_id === c.id);
      const b = h(`<button type="button" class="chip ${r ? 'on' : ''}" style="--c:${c.cor || '#5B667E'}">${esc(c.nome)}${r ? `<input class="pct" value="${r.percent}" inputmode="numeric">%` : ''}</button>`);
      b.onclick = e => { if (e.target.classList.contains('pct')) return; if (r) centros = centros.filter(x => x !== r); else { centros.push({ centro_id: c.id, percent: centros.length ? 0 : 100 }); if (centros.length === 2) { centros[0].percent = 50; centros[1].percent = 50; } } paintCC(); };
      const p = b.querySelector('.pct'); if (p) { p.onclick = e => e.stopPropagation(); p.oninput = () => { r.percent = Number(p.value) || 0; }; }
      l.appendChild(b);
    });
    if (!C.centros.length) l.innerHTML = '<span class="muted sm">Nenhum centro de custo cadastrado.</span>';
  };
  paintCC(); f.appendChild(ccBox);

  // repetição (só na criação)
  const repBox = h(`<div class="repbox"></div>`);
  const segRep = segmented([{ id: 'nao', label: 'Não repete' }, { id: 'parcelado', label: 'Parcelado' }, { id: 'recorrente', label: 'Recorrente' }], 'nao', v => paintRep(v));
  const repOpts = h('<div class="rep-o"></div>');
  const paintRep = v => {
    repOpts.innerHTML = '';
    if (v === 'parcelado') {
      const r = h(`<div class="row3"><label class="fld"><span class="fl">Parcelas</span><input class="inp" type="number" min="2" max="120" value="2" data-n></label><label class="fld"><span class="fl">Intervalo</span><select class="inp" data-int><option value="mensal">Mensal</option><option value="quinzenal">Quinzenal</option><option value="semanal">Semanal</option></select></label><label class="fld"><span class="fl">O valor informado é</span><select class="inp" data-modo><option value="dividir">o total (dividir)</option><option value="cada">de cada parcela</option></select></label></div><div class="rep-preview muted sm"></div>`);
      repOpts.appendChild(r); const prev = () => { const n = Number(r.querySelector('[data-n]').value) || 2; const modo = r.querySelector('[data-modo]').value; const v = valor.get(); r.querySelector('.rep-preview').textContent = `${n}× de ${money(modo === 'dividir' ? v / n : v)} · total ${money(modo === 'dividir' ? v : v * n)} · última em ${fmtDate(addMonths(venc.value, n - 1))}`; }; r.addEventListener('input', prev); r.addEventListener('change', prev); valor.addEventListener('money', prev); prev();
    } else if (v === 'recorrente') {
      const r = h(`<div class="row3"><label class="fld"><span class="fl">Frequência</span><select class="inp" data-freq><option value="mensal">Mensal</option><option value="semanal">Semanal</option><option value="quinzenal">Quinzenal</option><option value="bimestral">Bimestral</option><option value="trimestral">Trimestral</option><option value="semestral">Semestral</option><option value="anual">Anual</option></select></label><label class="fld"><span class="fl">Repetir</span><select class="inp" data-fim><option value="vezes">um nº de vezes</option><option value="ate">até uma data</option></select></label><label class="fld" data-vezes><span class="fl">Vezes</span><input class="inp" type="number" min="2" max="120" value="12"></label><label class="fld hidden" data-ate><span class="fl">Até</span><input class="inp" type="date" value="${addMonths(today(), 12)}"></label></div>`);
      repOpts.appendChild(r); r.querySelector('[data-fim]').onchange = e => { r.querySelector('[data-vezes]').classList.toggle('hidden', e.target.value !== 'vezes'); r.querySelector('[data-ate]').classList.toggle('hidden', e.target.value !== 'ate'); };
    }
  };
  if (!isEdit) { repBox.append(h('<div class="fl">Repetição</div>'), segRep, repOpts); f.appendChild(repBox); }

  // já pago
  const pagoBox = h('<div class="pagobox"></div>');
  const tglPago = toggle({ label: L.tipo === 'receber' ? 'Já foi recebido' : 'Já foi pago', checked: false });
  const pagoOpts = h(`<div class="row2 hidden"><label class="fld"><span class="fl">Data</span><input class="inp" type="date" value="${today()}" data-dt></label></div>`);
  const pagoConta = combobox({ options: C.contas.filter(c => !c.arquivada).map(contaOpt), value: L.conta_id, placeholder: 'Conta', allowEmpty: false }); pagoOpts.appendChild(fieldEl('Na conta', pagoConta));
  tglPago.querySelector('input').onchange = e => pagoOpts.classList.toggle('hidden', !e.target.checked);
  conta.addEventListener('change', e => { pagoConta.set(e.detail); });
  if (!isEdit) { pagoBox.append(tglPago, pagoOpts); f.appendChild(pagoBox); }

  // mais: tags, referência, obs, anexos
  const more = h(`<details class="more" ${L.tags?.length || L.referencia || L.observacoes || L.anexos?.length ? 'open' : ''}><summary>${icon('ti-chevron-right')}Mais detalhes <span class="muted">tags, referência, observações, anexos</span></summary><div class="more-b"></div></details>`);
  const mb = more.querySelector('.more-b');
  const tagsEl = h(`<div class="chips"></div>`); const selTags = new Set(L.tags || []);
  const paintTags = () => { tagsEl.innerHTML = C.tags.map(t => `<button type="button" class="chip ${selTags.has(t.nome) ? 'on' : ''}" style="--c:${t.cor}" data-t="${esc(t.nome)}">${esc(t.nome)}</button>`).join('') + `<button type="button" class="chip add" data-new>${icon('ti-plus')}Nova tag</button>`; };
  paintTags(); tagsEl.onclick = async e => { const b = e.target.closest('button'); if (!b) return; if (b.dataset.new) { const nome = window.prompt('Nome da tag'); if (nome) { await db.upsert('tags', { id: uid(), empresa_id: E, nome, cor: ['#2F6BE0', '#17924A', '#B26A00', '#8E44AD', '#E8262C'][C.tags.length % 5] }); C.tags = db.of('tags', E); selTags.add(nome); paintTags(); } return; } selTags.has(b.dataset.t) ? selTags.delete(b.dataset.t) : selTags.add(b.dataset.t); paintTags(); };
  const ref = h(`<input class="inp" placeholder="Nº da nota, pedido, contrato…" value="${esc(L.referencia || '')}">`);
  const obs = h(`<textarea class="inp" rows="3" placeholder="Observações internas">${esc(L.observacoes || '')}</textarea>`);
  const anexos = [...(L.anexos || [])];
  const anexBox = h(`<div class="anexos"><div class="anexos-l"></div><div class="anexos-a"><label class="btn ghost sm">${icon('ti-paperclip')}Anexar arquivo<input type="file" multiple hidden accept="image/*,.pdf"></label><button type="button" class="btn ghost sm" data-link>${icon('ti-link')}Adicionar link</button></div></div>`);
  const paintAnex = () => { anexBox.querySelector('.anexos-l').innerHTML = anexos.map((a, i) => `<span class="anexo">${icon(a.url?.startsWith('data:image') || /\.(png|jpe?g|webp)$/i.test(a.nome || '') ? 'ti-photo' : 'ti-file')}<a href="${esc(a.url)}" target="_blank">${esc(a.nome || a.url)}</a><button type="button" data-rm="${i}">${icon('ti-x')}</button></span>`).join('') || '<span class="muted sm">Sem anexos.</span>'; };
  paintAnex(); anexBox.addEventListener('click', e => { const rm = e.target.closest('[data-rm]'); if (rm) { anexos.splice(Number(rm.dataset.rm), 1); paintAnex(); } });
  anexBox.querySelector('input[type=file]').onchange = async e => { for (const file of e.target.files) { if (file.size > 800 * 1024 && db.backend.name === 'local') { toast(`"${file.name}" é grande demais pra guardar no navegador (máx. 800 KB). Use um link.`, 'warn', 5000); continue; } const url = await readFile(file, 'data'); anexos.push({ nome: file.name, url, tipo: file.type, tamanho: file.size }); } paintAnex(); };
  anexBox.querySelector('[data-link]').onclick = () => { const url = window.prompt('URL do anexo (nota fiscal, comprovante…)'); if (url) { anexos.push({ nome: url.split('/').pop().slice(0, 40) || url, url }); paintAnex(); } };
  mb.append(fieldEl('Tags', tagsEl), h('<div class="row2"></div>')); mb.lastChild.append(fieldEl('Referência', ref), fieldEl('Observações', obs)); mb.append(fieldEl('Anexos', anexBox));
  f.appendChild(more);

  // footer
  const foot = d.footer; foot.innerHTML = '';
  const bCancel = h('<button type="button" class="btn ghost">Cancelar</button>'); bCancel.onclick = () => d.close();
  const bSave = h(`<button type="submit" form="_" class="btn primary">${icon('ti-check')}${isEdit ? 'Salvar' : 'Salvar lançamento'}</button>`);
  const bMore = h(`<button type="button" class="btn ghost sm">${icon('ti-dots')}</button>`);
  foot.append(bMore, h('<span class="grow"></span>'), bCancel, bSave);
  if (!isEdit) { const bAgain = h('<button type="button" class="btn secondary">Salvar e novo</button>'); bAgain.onclick = () => submit(true); foot.insertBefore(bAgain, bSave); }
  bMore.onclick = e => { import('../ui.js').then(({ menu }) => menu(bMore, [isEdit ? { label: 'Duplicar', icon: 'ti-copy', onClick: () => { d.close(); abrirLancamento(null, { tipo: L.tipo, defaults: { ...L, id: undefined, baixas: [], status: 'aberto', parcela_num: null, parcela_total: null, grupo_parcelas_id: null, recorrencia_id: null, recorrencia: null, conciliado_fitid: null } }); } } : null, isEdit ? { label: 'Excluir', icon: 'ti-trash', danger: true, onClick: async () => { if (await excluirLancamento(L)) d.close(); } } : null].filter(Boolean), { align: 'left' })); };
  bSave.onclick = e => { e.preventDefault(); submit(false); };
  f.onsubmit = e => { e.preventDefault(); submit(false); };

  function repaintTipo() {
    const tr = L.tipo === 'transferencia';
    f.classList.toggle('is-tr', tr);
    fDest.classList.toggle('hidden', !tr); fForma.classList.toggle('hidden', tr); rowCC.classList.toggle('hidden', tr); rateioBox.classList.toggle('hidden', tr || !rateio.length); ccBox.classList.toggle('hidden', tr); pagoBox.classList.toggle('hidden', tr); repBox.classList.toggle('hidden', tr);
    fConta.querySelector('.fl').textContent = tr ? 'Da conta' : 'Conta';
    if (!tr) { categoria.setOptions(catOpts(C.categorias, L.tipo === 'receber' ? 'in' : 'out')); const cat = db.get('categorias', categoria.get()); if (cat && cat.tipo !== (L.tipo === 'receber' ? 'in' : 'out')) categoria.set(null); tglPago.querySelector('.tgl-l').textContent = L.tipo === 'receber' ? 'Já foi recebido' : 'Já foi pago'; }
    descr.placeholder = tr ? 'Ex.: Saque Pagar.me → BTG' : L.tipo === 'receber' ? 'Ex.: Repasse Mercado Livre' : 'Ex.: Meta Ads · setembro';
  }
  repaintTipo();

  async function submit(again) {
    const v = valor.get(); if (!v) { toast('Informe o valor', 'err'); valor.input.focus(); return; }
    if (!descr.value.trim()) { toast('Informe a descrição', 'err'); descr.focus(); return; }
    if (!venc.value) { toast('Informe a data', 'err'); return; }
    const tr = L.tipo === 'transferencia';
    if (!conta.get()) { toast('Escolha a conta', 'err'); return; }
    if (tr && (!contaDest.get() || contaDest.get() === conta.get())) { toast('Escolha uma conta de destino diferente da origem', 'err'); return; }
    if (!tr && !categoria.get() && !rateio.length) { toast('Escolha a categoria', 'err'); return; }
    if (!tr && rateio.length) { const t = sum(rateio, r => r.valor); if (Math.abs(t - v) > 0.005) { toast('O rateio precisa somar o valor total', 'err'); return; } if (rateio.some(r => !r.categoria_id)) { toast('Escolha a categoria de cada linha do rateio', 'err'); return; } }
    const pctTot = sum(centros, c => c.percent); if (centros.length && Math.abs(pctTot - 100) > 0.01) { toast('Os centros de custo precisam somar 100%', 'err'); return; }
    const base = { ...L, empresa_id: E, tipo: L.tipo, descricao: descr.value.trim(), valor: v, vencimento: venc.value, competencia: (comp.value || venc.value.slice(0, 7)) + '-01', contato_id: tr ? null : contato.get(), categoria_id: tr ? null : (rateio.length ? rateio[0].categoria_id : categoria.get()), rateio_categorias: tr ? [] : (rateio.length > 1 ? rateio.map(r => ({ categoria_id: r.categoria_id, valor: round2(r.valor), descricao: r.descricao || '' })) : []), rateio_centros: tr ? [] : centros.map(c => ({ centro_id: c.centro_id, percent: Number(c.percent) })), conta_id: conta.get(), conta_destino_id: tr ? contaDest.get() : null, forma_pagamento: tr ? 'transferencia' : forma.get(), tags: [...selTags], referencia: ref.value.trim(), observacoes: obs.value.trim(), anexos, origem: L.origem || 'manual', criado_em: L.criado_em || new Date().toISOString() };
    if (tr) base.status = 'pago';
    let rows = [base];
    if (!isEdit && !tr) {
      const rep = segRep.get();
      if (rep === 'parcelado') { const r = repOpts; rows = gerarParcelas(base, Math.max(2, Number(r.querySelector('[data-n]').value) || 2), { modo: r.querySelector('[data-modo]').value, intervalo: r.querySelector('[data-int]').value }); }
      else if (rep === 'recorrente') { const r = repOpts; const fim = r.querySelector('[data-fim]').value; rows = gerarRecorrencia(base, { freq: r.querySelector('[data-freq]').value, vezes: fim === 'vezes' ? Number(r.querySelector('[data-vezes] input').value) || 12 : null, ate: fim === 'ate' ? r.querySelector('[data-ate] input').value : null }); }
      if (tglPago.get()) { const dt = pagoOpts.querySelector('[data-dt]').value || today(); const first = rows[0]; first.baixas = [{ id: uid(), data: dt, valor: first.valor, conta_id: pagoConta.get() || first.conta_id, juros: 0, multa: 0, desconto: 0 }]; }
    }
    if (isEdit && !tr && liquidado(base) > base.valor + 0.005) { if (!await confirm({ title: 'Valor menor que o já pago', msg: 'O novo valor é menor que o total já baixado. Deseja manter as baixas mesmo assim?', ok: 'Manter' })) return; }
    try { await db.upsert('lancamentos', rows); } catch (e) { toast(e.message, 'err', 5000); return; }
    toast(rows.length > 1 ? `${rows.length} lançamentos criados` : isEdit ? 'Lançamento salvo' : 'Lançamento criado');
    d.close(true);
    if (again) abrirLancamento(null, { tipo: L.tipo, defaults: { conta_id: base.conta_id, vencimento: base.vencimento } });
  }
  return d;
}

// ---------- baixa (pagar / receber) ----------
export function abrirBaixa(lancs, { onDone } = {}) {
  const list = Array.isArray(lancs) ? lancs : [lancs]; const C = app.ctx();
  const isRec = list.every(l => l.tipo === 'receber'); const multi = list.length > 1;
  const total = round2(sum(list, emAberto));
  const m = modal({ title: multi ? `${isRec ? 'Receber' : 'Pagar'} ${list.length} lançamentos` : (isRec ? 'Registrar recebimento' : 'Registrar pagamento'), size: 'md' });
  const b = m.body;
  const l0 = list[0];
  b.innerHTML = multi ? `<div class="baixa-head"><div class="muted sm">Total em aberto selecionado</div><div class="big">${money(total)}</div></div>` : `<div class="baixa-head"><div class="baixa-t">${esc(l0.descricao)}</div><div class="muted sm">${C.contato(l0.contato_id)?.nome || ''} · venc. ${fmtDate(l0.vencimento)}${liquidado(l0) ? ` · já ${isRec ? 'recebido' : 'pago'} ${money(liquidado(l0))}` : ''}</div></div>`;
  const dt = h(`<input class="inp" type="date" value="${today()}">`);
  const conta = combobox({ options: C.contas.filter(c => !c.arquivada).map(contaOpt), value: l0.conta_id || C.contas[0]?.id, allowEmpty: false });
  const val = moneyInput({ value: total, cls: 'lg' });
  const juros = moneyInput({ value: 0 }), multa = moneyInput({ value: 0 }), desc = moneyInput({ value: 0 });
  const r1 = h('<div class="row2"></div>'); r1.append(fieldEl('Data', dt), fieldEl('Conta', conta)); b.appendChild(r1);
  b.appendChild(fieldEl(multi ? 'Valor total' : `Valor ${isRec ? 'recebido' : 'pago'}`, val, { hint: multi ? 'Será distribuído na ordem da lista.' : 'Menor que o em aberto = baixa parcial.' }));
  const det = h(`<details class="more"><summary>${icon('ti-chevron-right')}Juros, multa e desconto</summary><div class="row3"></div></details>`); det.querySelector('.row3').append(fieldEl('Juros', juros), fieldEl('Multa', multa), fieldEl('Desconto', desc)); b.appendChild(det);
  const resumo = h('<div class="baixa-res muted sm"></div>'); b.appendChild(resumo);
  const calc = () => { const principal = round2(val.get() - juros.get() - multa.get() + desc.get()); const rest = round2(total - principal); resumo.innerHTML = `Abate ${money(principal)} do principal${rest > 0.005 ? ` · fica em aberto ${money(rest)}` : rest < -0.005 ? ` · <b class="neg">excede em ${money(-rest)}</b>` : ' · quita tudo'}`; };
  b.addEventListener('money', calc); calc();
  const obs = h('<input class="inp" placeholder="Observação (opcional)">'); b.appendChild(fieldEl('Observação', obs));
  m.footer.innerHTML = ''; const bc = h('<button class="btn ghost">Cancelar</button>'); bc.onclick = () => m.close(); const ok = h(`<button class="btn primary">${icon('ti-check')}Confirmar</button>`); m.footer.append(bc, ok);
  ok.onclick = async () => {
    let restante = val.get(); if (restante <= 0) { toast('Informe o valor', 'err'); return; }
    const rows = [];
    for (const l of list) {
      const ab = emAberto(l); if (ab <= 0 && multi) continue;
      const v = multi ? Math.min(restante, ab) : restante; if (v <= 0) break;
      const bx = { id: uid(), data: dt.value, valor: round2(v), conta_id: conta.get(), juros: multi ? 0 : juros.get(), multa: multi ? 0 : multa.get(), desconto: multi ? 0 : desc.get(), observacao: obs.value.trim() };
      rows.push({ ...l, baixas: [...(l.baixas || []), bx] }); restante = round2(restante - v);
    }
    await db.upsert('lancamentos', rows);
    toast(isRec ? 'Recebimento registrado' : 'Pagamento registrado'); m.close(true); onDone && onDone();
  };
}

export async function estornarBaixa(l, baixaId = null) {
  const bx = l.baixas || []; if (!bx.length) return;
  const alvo = baixaId ? bx.find(b => b.id === baixaId) : bx[bx.length - 1];
  if (!await confirm({ title: 'Estornar baixa', msg: `Remover a baixa de ${money(alvo.valor)} em ${fmtDate(alvo.data)}? O lançamento volta a ficar em aberto.`, ok: 'Estornar', danger: true })) return false;
  await db.upsert('lancamentos', { ...l, baixas: bx.filter(b => b !== alvo), conciliado_fitid: null });
  toast('Baixa estornada'); return true;
}

export async function excluirLancamento(l) {
  const irmaos = l.grupo_parcelas_id ? db.of('lancamentos', app.empresaId).filter(x => x.grupo_parcelas_id === l.grupo_parcelas_id && x.id !== l.id) : l.recorrencia_id ? db.of('lancamentos', app.empresaId).filter(x => x.recorrencia_id === l.recorrencia_id && x.id !== l.id && x.vencimento >= l.vencimento && !liquidado(x)) : [];
  let escopo = 'este';
  if (irmaos.length) {
    const r = await new Promise(res => { const mm = modal({ title: 'Excluir lançamento', size: 'sm', body: `<p class="muted">Este lançamento faz parte de ${l.grupo_parcelas_id ? 'um parcelamento' : 'uma recorrência'}. O que deseja excluir?</p>`, footer: `<button class="btn ghost" data-c>Cancelar</button><button class="btn secondary" data-um>Só este</button><button class="btn danger" data-todos>Este e os ${irmaos.length} ${l.grupo_parcelas_id ? 'outros' : 'próximos'}</button>`, onClose: v => res(v) }); mm.footer.querySelector('[data-c]').onclick = () => mm.close(null); mm.footer.querySelector('[data-um]').onclick = () => mm.close('este'); mm.footer.querySelector('[data-todos]').onclick = () => mm.close('todos'); });
    if (!r) return false; escopo = r;
  } else if (!await confirm({ title: 'Excluir lançamento', msg: `Excluir "${esc(l.descricao)}"? Essa ação não pode ser desfeita.`, ok: 'Excluir', danger: true })) return false;
  const ids = [l.id, ...(escopo === 'todos' ? irmaos.map(x => x.id) : [])];
  if (db.backend.name === 'supabase') await db.upsert('lancamentos', ids.map(id => ({ ...db.get('lancamentos', id), deletado_em: new Date().toISOString() })));
  else await db.remove('lancamentos', ids);
  toast(ids.length > 1 ? `${ids.length} lançamentos excluídos` : 'Lançamento excluído'); return true;
}

// ---------- detalhe rápido ----------
export function abrirDetalhe(l) {
  const C = app.ctx(); const st = statusOf(l); const cat = C.cat(l.categoria_id); const ct = C.contato(l.contato_id); const cta = C.conta(l.conta_id);
  const isTr = l.tipo === 'transferencia';
  const d = drawer({ title: isTr ? 'Transferência' : l.tipo === 'receber' ? 'Conta a receber' : 'Conta a pagar', size: 'md' });
  const kv = (k, v) => v ? `<div class="kv"><span>${k}</span><b>${v}</b></div>` : '';
  d.body.innerHTML = `<div class="det-head">${isTr ? bankIcon(cta, 44) : catIcon(cat, 44)}<div><div class="det-t">${esc(l.descricao)}</div><div class="muted sm">${ct ? esc(ct.nome) + ' · ' : ''}${cat ? esc(cat.nome) : isTr ? esc(cta?.nome) + ' → ' + esc(C.conta(l.conta_destino_id)?.nome) : ''}</div></div><div class="det-v ${l.tipo === 'receber' ? 'pos' : 'neg'}">${money(l.valor)}</div></div>
  <div class="det-status">${statusPill(l)}${l.parcela_total ? `<span class="pill gray">Parcela ${l.parcela_num}/${l.parcela_total}</span>` : ''}${l.recorrencia_id ? `<span class="pill gray">${icon('ti-repeat')} Recorrente</span>` : ''}${(l.tags || []).map(t => { const tg = C.tags.find(x => x.nome === t); return tg ? `<span class="tagchip" style="--c:${tg.cor}">${esc(t)}</span>` : ''; }).join('')}${l.conciliado_fitid ? `<span class="pill green">${icon('ti-check')} Conciliado</span>` : ''}</div>
  <div class="kvs">${kv('Vencimento', fmtDate(l.vencimento))}${kv('Competência', l.competencia ? l.competencia.slice(0, 7).split('-').reverse().join('/') : '')}${kv(isTr ? 'De' : 'Conta', cta ? `<span class="inl">${bankIcon(cta, 18)} ${esc(cta.nome)}</span>` : '')}${isTr ? kv('Para', `<span class="inl">${bankIcon(C.conta(l.conta_destino_id), 18)} ${esc(C.conta(l.conta_destino_id)?.nome)}</span>`) : ''}${kv('Forma', FORMAS.find(f => f.id === l.forma_pagamento)?.nome)}${kv('Referência', esc(l.referencia))}${kv('Origem', esc({ manual: 'Manual', pagarme: 'Pagar.me', shopify: 'Shopify', nibo: 'Nibo', importacao: 'Importação', extrato: 'Extrato' }[l.origem || 'manual']))}${kv('Centro de custo', (l.rateio_centros || []).map(r => `${esc(C.centro(r.centro_id)?.nome)} ${r.percent}%`).join(', '))}</div>
  ${l.rateio_categorias?.length ? `<h5>Rateio</h5><div class="det-list">${l.rateio_categorias.map(r => `<div class="det-li">${catIcon(C.cat(r.categoria_id), 24)}<span>${esc(C.cat(r.categoria_id)?.nome)}${r.descricao ? ` <small class="muted">${esc(r.descricao)}</small>` : ''}</span><b>${money(r.valor)}</b></div>`).join('')}</div>` : ''}
  ${!isTr ? `<h5>Baixas <span class="muted">${money(liquidado(l))} de ${money(l.valor)}</span></h5><div class="det-list" data-baixas>${(l.baixas || []).map(b => `<div class="det-li">${bankIcon(C.conta(b.conta_id), 24)}<span>${fmtDate(b.data)} · ${esc(C.conta(b.conta_id)?.nome || '')}${b.juros || b.multa || b.desconto ? ` <small class="muted">${b.juros ? 'juros ' + money(b.juros) + ' ' : ''}${b.multa ? 'multa ' + money(b.multa) + ' ' : ''}${b.desconto ? 'desc. ' + money(b.desconto) : ''}</small>` : ''}${b.observacao ? ` <small class="muted">${esc(b.observacao)}</small>` : ''}</span><b>${money(b.valor)}</b><button class="ibtn" data-est="${b.id}" title="Estornar">${icon('ti-arrow-back-up')}</button></div>`).join('') || '<div class="muted sm">Nenhuma baixa ainda.</div>'}</div>` : ''}
  ${l.observacoes ? `<h5>Observações</h5><p class="muted">${esc(l.observacoes)}</p>` : ''}
  ${l.anexos?.length ? `<h5>Anexos</h5><div class="anexos-l">${l.anexos.map(a => `<a class="anexo" href="${esc(a.url)}" target="_blank">${icon('ti-paperclip')}${esc(a.nome || a.url)}</a>`).join('')}</div>` : ''}
  <div class="muted xs det-meta">Criado ${l.criado_em ? new Date(l.criado_em).toLocaleString('pt-BR') : ''}${l.atualizado_em ? ' · atualizado ' + new Date(l.atualizado_em).toLocaleString('pt-BR') : ''}</div>`;
  d.body.querySelectorAll('[data-est]').forEach(b => b.onclick = async () => { if (await estornarBaixa(l, b.dataset.est)) d.close(); });
  d.footer.innerHTML = '';
  const bDel = h(`<button class="btn ghost danger-t">${icon('ti-trash')}</button>`); bDel.onclick = async () => { if (await excluirLancamento(l)) d.close(); };
  const bDup = h(`<button class="btn ghost" title="Duplicar">${icon('ti-copy')}</button>`); bDup.onclick = () => { d.close(); abrirLancamento(null, { tipo: l.tipo, defaults: { ...l, id: undefined, baixas: [], status: 'aberto', parcela_num: null, parcela_total: null, grupo_parcelas_id: null, recorrencia_id: null, recorrencia: null, conciliado_fitid: null, vencimento: today() } }); };
  const bEdit = h(`<button class="btn secondary">${icon('ti-pencil')}Editar</button>`); bEdit.onclick = () => { d.close(); abrirLancamento(l); };
  d.footer.append(bDel, bDup, h('<span class="grow"></span>'), bEdit);
  if (!isTr && st !== 'pago' && st !== 'cancelado') { const bPay = h(`<button class="btn primary">${icon(l.tipo === 'receber' ? 'ti-arrow-down-left' : 'ti-check')}${l.tipo === 'receber' ? 'Receber' : 'Pagar'}</button>`); bPay.onclick = () => { d.close(); abrirBaixa(l); }; d.footer.append(bPay); }
  return d;
}
export function statusPill(l) {
  const s = statusOf(l); const map = { aberto: 'blue', parcial: 'amber', atrasado: 'red', pago: 'green', cancelado: 'gray' };
  const nome = s === 'pago' ? (l.tipo === 'receber' ? 'Recebido' : l.tipo === 'transferencia' ? 'Efetuada' : 'Pago') : { aberto: 'Em aberto', parcial: 'Parcial', atrasado: 'Atrasado', cancelado: 'Cancelado' }[s];
  return `<span class="pill ${map[s]}">${nome}</span>`;
}
