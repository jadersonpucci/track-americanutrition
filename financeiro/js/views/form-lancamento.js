// Formulário de lançamento (despesa / receita / transferência) + baixa (pagar/receber) + estorno.
import { db } from '../db.js';
import { drawer, modal, field, fieldEl, moneyInput, combobox, segmented, toggle, toast, confirm, icon, h, bankIcon, catIcon, avatar, on, centrosPicker } from '../ui.js';
import { today, addDays, addMonths, monthStart, uid, esc, money, round2, fmtDate, sum, readFile } from '../utils.js';
import { FORMAS, gerarParcelas, gerarRecorrencia, emAberto, statusOf, liquidado } from '../model.js';
import { app } from '../app.js';
import { ehLinha, soDigitos, parseCodigos, codigosTexto, lerBoletoArquivo, ehArquivoLegivel, motivoLeitura, modalBoleto, fmtLinha } from '../boleto.js';

const contaOpt = c => ({ id: c.id, label: c.nome, sub: c.tipo === 'cartao' ? 'Cartão' : undefined, icon: bankIcon(c, 24), group: c.arquivada ? 'Arquivadas' : undefined });
const catOpts = (cats, tipo) => cats.filter(c => !c.arquivada && (!tipo || c.tipo === tipo)).sort((a, b) => (a.grupo - b.grupo) || (a.ordem - b.ordem)).map(c => ({ id: c.id, label: c.nome, sub: c.codigo, icon: catIcon(c, 24), group: `${c.grupo} · ${c.subgrupo || ''}`, keywords: c.subgrupo }));
const contatoOpts = (contatos, tipo) => contatos.filter(c => !c.arquivado).sort((a, b) => a.nome.localeCompare(b.nome)).map(c => ({ id: c.id, label: c.nome, sub: c.tipo === 'socio' ? 'Sócio' : c.tipo === 'cliente' ? 'Cliente' : c.tipo === 'fornecedor' ? 'Fornecedor' : c.tipo === 'funcionario' ? 'Funcionário' : '', icon: avatar(c.nome, 24) }));

// jaPago: abre com "Já foi pago/recebido" marcado e a data da baixa acompanhando o vencimento (usado pela tela da conta)
export function abrirLancamento(existing = null, { tipo = 'pagar', defaults = {}, jaPago = false } = {}) {
  const E = app.empresaId; const C = app.ctx();
  const isEdit = !!existing;
  // centro de custo padrão: o do contato (se cadastrado) ou "Brasil" (tudo que não é marcado como outro centro)
  const centrosPadrao = contatoId => { const ct = contatoId ? C.contatos.find(c => c.id === contatoId) : null; if (ct && Array.isArray(ct.rateio_centros_padrao) && ct.rateio_centros_padrao.length) return ct.rateio_centros_padrao.map(r => ({ ...r })); const br = C.centros.find(c => !c.arquivado && /^brasil$/i.test(c.nome)); return br ? [{ centro_id: br.id, percent: 100 }] : []; };
  const L = existing ? JSON.parse(JSON.stringify(existing)) : { tipo, descricao: '', valor: 0, vencimento: today(), categoria_id: null, contato_id: null, conta_id: tipo === 'transferencia' ? (C.contas.find(c => !c.arquivada && c.tipo !== 'cartao')?.id || null) : null, forma_pagamento: 'pix', tags: [], anexos: [], rateio_categorias: [], rateio_centros: centrosPadrao(defaults.contato_id || null), observacoes: '', referencia: '', baixas: [], status: 'aberto', ...defaults };
  let ccPick = null, ccTocado = false;
  const d = drawer({ title: isEdit ? 'Editar lançamento' : 'Novo lançamento', size: 'lg', cls: 'form-lanc' });
  const body = d.body; body.innerHTML = '';
  const f = h(`<form class="lform" autocomplete="off"></form>`); body.appendChild(f);

  // tipo
  const segTipo = segmented([{ id: 'pagar', label: 'Despesa', icon: 'ti-arrow-up-right', cls: 'out' }, { id: 'receber', label: 'Receita', icon: 'ti-arrow-down-left', cls: 'in' }, { id: 'transferencia', label: 'Transferência', icon: 'ti-arrows-exchange', cls: 'tr' }], L.tipo, v => { L.tipo = v; repaintTipo(); }, 'big');
  if (isEdit) segTipo.querySelectorAll('button').forEach(b => { if (b.dataset.v !== L.tipo) b.disabled = true; });
  f.appendChild(segTipo);

  // Arraste o boleto aqui: anexa e, em conta a pagar, lê valor/vencimento/código antes de qualquer outro campo.
  // Aceita arrastar sobre a zona ou sobre o formulário inteiro, clique e colar (Cmd+V) um arquivo ou print.
  const drop = h(`<div class="dropzone" tabindex="0" role="button" aria-label="Anexar boleto ou nota"><input type="file" hidden accept="image/*,.pdf" multiple>${icon('ti-cloud-upload')}<div class="dz-t"><b>Arraste o boleto aqui</b><span> ou clique para anexar</span><div class="dz-h muted sm">PDF ou foto · em despesa, valor, vencimento e código são preenchidos sozinhos</div></div><div class="dz-s"></div></div>`);
  const dzStatus = (txt = '', cls = '') => { const el = drop.querySelector('.dz-s'); el.textContent = txt; el.className = 'dz-s ' + cls; drop.classList.toggle('has', !!txt); };
  const dzInput = drop.querySelector('input');
  drop.onclick = e => { if (e.target !== dzInput) dzInput.click(); };
  drop.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); dzInput.click(); } };
  dzInput.onchange = async e => { const files = [...e.target.files]; e.target.value = ''; for (const file of files) await anexarArquivo(file); };
  const dzFiles = async dt => { const files = [...(dt?.files || [])].filter(x => x && x.size); for (const file of files) await anexarArquivo(file); };
  let dragN = 0;
  f.addEventListener('dragenter', e => { if ([...(e.dataTransfer?.types || [])].includes('Files')) { e.preventDefault(); dragN++; drop.classList.add('over'); } });
  f.addEventListener('dragover', e => { if ([...(e.dataTransfer?.types || [])].includes('Files')) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; } });
  f.addEventListener('dragleave', () => { dragN = Math.max(0, dragN - 1); if (!dragN) drop.classList.remove('over'); });
  f.addEventListener('drop', e => { if (!(e.dataTransfer?.files || []).length) return; e.preventDefault(); dragN = 0; drop.classList.remove('over'); dzFiles(e.dataTransfer); });
  f.addEventListener('paste', e => { const files = [...(e.clipboardData?.files || [])]; if (files.length) { e.preventDefault(); dzFiles(e.clipboardData); } });
  if (isEdit && L.anexos?.length) drop.classList.add('compact');
  f.appendChild(drop);

  // linha valor + descrição
  const valor = moneyInput({ value: L.valor, cls: 'xl' });
  const descr = h(`<input class="inp" list="dl-desc" placeholder="Ex.: Meta Ads · setembro" value="${esc(L.descricao)}" required>`);
  const dl = h(`<datalist id="dl-desc">${[...new Set(C.lancamentos.map(l => l.descricao).filter(Boolean))].slice(0, 300).map(s => `<option value="${esc(s)}">`).join('')}</datalist>`);
  f.appendChild(h('<div class="row2 top"></div>')).append(fieldEl('Valor', valor, { req: true }), fieldEl('Descrição', descr, { req: true }), dl);

  // datas
  const venc = h(`<input class="inp" type="date" value="${L.vencimento}" required>`);
  const quick = h(`<div class="quick"><button type="button" tabindex="-1" data-d="0">Hoje</button><button type="button" tabindex="-1" data-d="1">Amanhã</button><button type="button" tabindex="-1" data-d="7">+7 dias</button><button type="button" tabindex="-1" data-d="30">+30 dias</button></div>`);
  quick.onclick = e => { const b = e.target.closest('button'); if (!b) return; venc.value = addDays(today(), Number(b.dataset.d)); };
  const rowDatas = h('<div class="row2"></div>'); const fv = fieldEl('Vencimento', venc, { req: true }); fv.appendChild(quick); rowDatas.append(fv); f.appendChild(rowDatas);

  // contato + categoria
  const contato = combobox({ options: contatoOpts(C.contatos), value: L.contato_id, placeholder: 'Cliente, fornecedor…', onChange: v => { if (ccPick && !ccTocado) ccPick.set(centrosPadrao(v)); }, allowCreate: async nome => { const c = await db.upsert('contatos', { id: uid(), empresa_id: E, nome, tipo: L.tipo === 'receber' ? 'cliente' : 'fornecedor', documento: '', email: '', telefone: '', pix: '', cidade: '', uf: '', observacoes: '', arquivado: false }); toast('Contato criado'); return { id: c.id, label: c.nome, icon: avatar(c.nome, 24) }; } });
  const categoria = combobox({ options: catOpts(C.categorias, L.tipo === 'receber' ? 'in' : 'out'), value: L.categoria_id, placeholder: 'Categoria', allowEmpty: false });
  // o botão de rateio fica fora do <label>: dentro dele, o clique no seletor (uma div) acionava o botão
  const catCol = h('<div class="fld-col"></div>'); catCol.appendChild(fieldEl('Categoria', categoria, { req: true }));
  // novo contato sem sair do lançamento (o "+ Novo" da barra fica atrás do fundo do formulário)
  const ctCol = h('<div class="fld-col"></div>'); ctCol.appendChild(fieldEl('Contato', contato));
  const novoCt = h(`<button type="button" class="linkbtn" tabindex="-1" data-novo-contato>${icon('ti-user-plus')}Cadastrar ${L.tipo === 'receber' ? 'cliente' : 'fornecedor'}</button>`);
  novoCt.onclick = async () => { const { abrirContato } = await import('./cadastros.js'); abrirContato(null, { tipo: L.tipo === 'receber' ? 'cliente' : 'fornecedor', onSaved: c => { contato.setOptions(contatoOpts(app.ctx().contatos)); contato.set(c.id); if (ccPick && !ccTocado) ccPick.set(centrosPadrao(c.id)); } }); };
  ctCol.appendChild(novoCt);
  const rowCC = h('<div class="row2"></div>'); rowCC.append(ctCol, catCol); f.appendChild(rowCC);
  // rateio de categorias
  const rateioBox = h(`<div class="rateio hidden"><div class="rateio-h"><span>Rateio por categoria</span><button type="button" class="btn ghost xs" data-add>${icon('ti-plus')}Linha</button></div><div class="rateio-l"></div><div class="rateio-t"></div></div>`);
  const rateioBtn = h(`<button type="button" class="linkbtn" tabindex="-1">${icon('ti-layout-list')}Dividir em mais de uma categoria</button>`);
  catCol.appendChild(rateioBtn); f.appendChild(rateioBox);
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
  const conta = combobox({ options: C.contas.filter(c => !c.arquivada || c.id === L.conta_id).map(contaOpt), value: L.conta_id, placeholder: 'Definir na baixa', allowEmpty: true });
  const contaDest = combobox({ options: C.contas.filter(c => !c.arquivada || c.id === L.conta_destino_id).map(contaOpt), value: L.conta_destino_id || null, placeholder: 'Conta de destino', allowEmpty: false });
  const forma = combobox({ options: FORMAS.map(x => ({ id: x.id, label: x.nome, icon: icon(x.icone, 'oi') })), value: L.forma_pagamento || 'pix', allowEmpty: false });
  const rowConta = h('<div class="row2"></div>'); const fConta = fieldEl('Conta', conta); const fDest = fieldEl('Para a conta', contaDest, { req: true }); const fForma = fieldEl('Forma', forma);
  rowConta.append(fConta, fDest, fForma); f.appendChild(rowConta);

  // centro de custo (rateio %)
  const ccBox = h(`<div class="ccbox"><div class="fl">Centro de custo</div></div>`);
  ccPick = centrosPicker({ centros: C.centros, value: L.rateio_centros || [], total: L.valor, onChange: () => { ccTocado = true; } });
  valor.addEventListener('money', e => ccPick.setTotal(e.detail));
  ccBox.appendChild(ccPick.el); f.appendChild(ccBox);

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
  const tglPago = toggle({ label: L.tipo === 'receber' ? 'Já foi recebido' : 'Já foi pago', checked: !isEdit && jaPago });
  const pagoOpts = h(`<div class="row2 ${!isEdit && jaPago ? '' : 'hidden'}"><label class="fld"><span class="fl">Data</span><input class="inp" type="date" value="${jaPago ? L.vencimento : today()}" data-dt></label></div>`);
  let dtPagoTocada = false; pagoOpts.querySelector('[data-dt]').addEventListener('change', () => dtPagoTocada = true);
  venc.addEventListener('change', () => { if (jaPago && !dtPagoTocada && tglPago.get()) pagoOpts.querySelector('[data-dt]').value = venc.value; });
  quick.addEventListener('click', () => setTimeout(() => { if (jaPago && !dtPagoTocada && tglPago.get()) pagoOpts.querySelector('[data-dt]').value = venc.value; }, 0));
  const pagoConta = combobox({ options: C.contas.filter(c => !c.arquivada).map(contaOpt), value: L.conta_id, placeholder: 'Conta', allowEmpty: false }); pagoOpts.appendChild(fieldEl('Na conta', pagoConta));
  tglPago.querySelector('input').onchange = e => { pagoOpts.classList.toggle('hidden', !e.target.checked); avisoVenc(); };
  // data já passou e não está marcado como pago: lembra que, sem baixa, não entra no extrato
  const vencHint = h('<div class="venc-hint hidden"></div>'); pagoBox.appendChild(vencHint);
  const avisoVenc = () => { const passou = venc.value && venc.value < today() && !tglPago.get() && !isEdit && L.tipo !== 'transferencia'; vencHint.classList.toggle('hidden', !passou); if (passou) vencHint.innerHTML = `${icon('ti-info-circle')} A data já passou. Se ${L.tipo === 'receber' ? 'já recebeu' : 'já pagou'}, marque acima: sem baixa o lançamento fica em aberto e não entra no extrato da conta.`; };
  venc.addEventListener('change', avisoVenc); venc.addEventListener('input', avisoVenc); quick.addEventListener('click', () => setTimeout(avisoVenc, 0));
  conta.addEventListener('change', e => { pagoConta.set(e.detail); });
  // transferência: descrição padrão "Transferência Origem → Destino", trocada junto com as contas enquanto o usuário não escrever a sua
  let descrAuto = '';
  const nomeConta = id => C.conta(id)?.nome || '';
  const descrTransf = () => { if (L.tipo !== 'transferencia') return; const de = nomeConta(conta.get()), para = nomeConta(contaDest.get()); const txt = 'Transferência' + (de || para ? ` ${de || '…'} → ${para || '…'}` : ''); if (!descr.value.trim() || descr.value === descrAuto) descr.value = txt; descrAuto = txt; };
  conta.addEventListener('change', descrTransf); contaDest.addEventListener('change', descrTransf);
  if (!isEdit) { pagoBox.prepend(tglPago, pagoOpts); f.appendChild(pagoBox); avisoVenc(); }

  // observações sempre visíveis no formulário; na lista não aparecem, só ao abrir o lançamento
  const more = h(`<details class="more" ${L.tags?.length || L.referencia || L.anexos?.length || L.boleto_linha || L.pix_codigo ? 'open' : ''}><summary>${icon('ti-chevron-right')}Mais detalhes <span class="muted">tags, referência, anexos</span></summary><div class="more-b"></div></details>`);
  const mb = more.querySelector('.more-b');
  const tagsEl = h(`<div class="chips"></div>`); const selTags = new Set(L.tags || []);
  const paintTags = () => { tagsEl.innerHTML = C.tags.map(t => `<button type="button" class="chip ${selTags.has(t.nome) ? 'on' : ''}" style="--c:${t.cor}" data-t="${esc(t.nome)}">${esc(t.nome)}</button>`).join('') + `<button type="button" class="chip add" data-new>${icon('ti-plus')}Nova tag</button>`; };
  paintTags(); tagsEl.onclick = async e => { const b = e.target.closest('button'); if (!b) return; if (b.dataset.new) { const nome = window.prompt('Nome da tag'); if (nome) { await db.upsert('tags', { id: uid(), empresa_id: E, nome, cor: ['#2F6BE0', '#17924A', '#B26A00', '#8E44AD', '#E8262C'][C.tags.length % 5] }); C.tags = db.of('tags', E); selTags.add(nome); paintTags(); } return; } selTags.has(b.dataset.t) ? selTags.delete(b.dataset.t) : selTags.add(b.dataset.t); paintTags(); };
  const ref = h(`<input class="inp" placeholder="Nº da nota, pedido, contrato…" value="${esc(L.referencia || '')}">`);
  const obs = h(`<textarea class="inp" rows="2" placeholder="Ex.: combinado desconto se pagar até o dia 10">${esc(L.observacoes || '')}</textarea>`);
  // linha digitável do boleto e/ou PIX copia e cola (uma por linha); preenchido sozinho ao anexar o PDF do boleto
  const codigo = h(`<textarea class="inp mono cod-pag" rows="2" placeholder="Cole a linha digitável do boleto ou o PIX copia e cola">${esc(codigosTexto(L))}</textarea>`);
  const aplicarLeitura = (r, { silencioso = false } = {}) => {
    if (!r || (!r.linha && !r.pix)) { if (!silencioso || r?.motivo === 'linha_invalida') toast(motivoLeitura(r), 'warn', 7000); return false; }
    const atual = parseCodigos(codigo.value); const linhas = [];
    if (r.linha && !atual.boleto_linha) linhas.push(fmtLinha(r.linha)); else if (atual.boleto_linha) linhas.push(fmtLinha(atual.boleto_linha));
    if (r.pix && !atual.pix_codigo) linhas.push(r.pix); else if (atual.pix_codigo) linhas.push(atual.pix_codigo);
    codigo.value = linhas.join('\n');
    if (r.valor > 0 && !(valor.get() > 0)) valor.set(r.valor);
    if (r.vencimento && !isEdit && !L.baixas?.length) venc.value = r.vencimento;
    if (!forma.get() || forma.get() === 'pix') forma.set('boleto');
    more.open = true;
    if (r.beneficiario && !descr.value.trim()) descr.value = 'Boleto ' + r.beneficiario.replace(/\s+/g, ' ').trim().slice(0, 60);
    // beneficiário do boleto → contato já cadastrado com nome parecido
    if (r.beneficiario && !contato.get()) { const hit = acharContato(r.beneficiario); if (hit) contato.set(hit.id); }
    toast(`Boleto lido${r.fonte === 'visao' ? ' pela imagem' : ''}${r.valor ? ': ' + money(r.valor) : ''}${r.vencimento ? ' · vence ' + fmtDate(r.vencimento) : ''}`);
    return true;
  };
  const anexos = [...(L.anexos || [])];
  const anexBox = h(`<div class="anexos"><div class="anexos-l"></div><div class="anexos-a"><label class="btn ghost sm">${icon('ti-paperclip')}Anexar arquivo<input type="file" multiple hidden accept="image/*,.pdf"></label><label class="btn ghost sm cam">${icon('ti-camera')}Foto<input type="file" hidden accept="image/*" capture="environment"></label><button type="button" class="btn ghost sm" data-link>${icon('ti-link')}Link</button></div></div>`);
  const paintAnex = () => { anexBox.querySelector('.anexos-l').innerHTML = anexos.map((a, i) => `<span class="anexo ${a.enviando ? 'busy' : ''}">${icon(anexoIcone(a))}<a href="${a.url && !a.id ? esc(a.url) : '#'}" ${a.id ? `data-open="${i}"` : 'target="_blank"'}>${esc(a.nome || a.url)}</a>${a.tamanho ? `<small class="muted">${fmtBytes(a.tamanho)}</small>` : ''}<button type="button" class="ibtn xs" data-rm="${i}" title="Remover">${icon('ti-x')}</button></span>`).join('') || '<span class="muted sm">Boleto, nota fiscal, comprovante…</span>'; };
  paintAnex(); anexBox.addEventListener('click', async e => { const rm = e.target.closest('[data-rm]'); if (rm) { const a = anexos.splice(Number(rm.dataset.rm), 1)[0]; if (a?.id && db.temAnexosServidor) db.backend.anexoRemove(a.id).catch(() => {}); paintAnex(); return; } const op = e.target.closest('[data-open]'); if (op) { e.preventDefault(); abrirAnexo(anexos[Number(op.dataset.open)]); } });
  const onFiles = async e => { const files = [...e.target.files]; e.target.value = ''; for (const file of files) { await anexarArquivo(file); } };
  async function anexarArquivo(file) {
    if (!db.temAnexosServidor) { if (file.size > 800 * 1024) { toast(`"${file.name}" é grande demais pra guardar no navegador (máx. 800 KB). Use um link.`, 'warn', 5000); return; } const url = await readFile(file, 'data'); anexos.push({ nome: file.name, url, tipo: file.type, tamanho: file.size }); paintAnex(); return; }
    if (file.size > 12 * 1024 * 1024) { toast(`"${file.name}" passa de 12 MB.`, 'warn', 5000); return; }
    const tmp = { nome: file.name, tipo: file.type, tamanho: file.size, enviando: true }; anexos.push(tmp); paintAnex(); dzStatus('Enviando ' + file.name + '…', 'busy');
    try {
      const { base64, tipo, tamanho, nome } = await prepararArquivo(file);
      const a = await db.backend.anexoPut({ empresa_id: E, lancamento_id: L.id || null, nome, tipo, base64 });
      Object.assign(tmp, a, { enviando: false }); delete tmp.enviando;
      dzStatus(`${anexos.filter(x => x.id || x.url).length} anexo${anexos.length > 1 ? 's' : ''}`, 'ok');
      // PDF ou foto numa conta a pagar: tenta ler a linha digitável / PIX do boleto (texto do PDF, senão visão)
      if (L.tipo === 'pagar' && ehArquivoLegivel(tipo, nome) && !parseCodigos(codigo.value).boleto_linha) {
        paintAnex(); dzStatus('Lendo o boleto…', 'busy');
        try { const r = await lerBoletoArquivo({ base64, nome, tipo }); const ok = aplicarLeitura(r, { silencioso: true }); dzStatus(ok ? `Boleto lido${r.valor ? ': ' + money(r.valor) : ''}${r.vencimento ? ' · vence ' + fmtDate(r.vencimento) : ''}` : 'Anexado, mas não achei o código do boleto', ok ? 'ok' : 'warn'); }
        catch (e) { console.warn('leitura do boleto', e); dzStatus('Anexado; a leitura do boleto falhou', 'warn'); }
      }
    } catch (err) { anexos.splice(anexos.indexOf(tmp), 1); dzStatus('', ''); toast('Falha ao enviar o anexo: ' + err.message, 'err', 5000); }
    paintAnex();
  }
  anexBox.querySelectorAll('input[type=file]').forEach(i => i.onchange = onFiles);
  anexBox.querySelector('[data-link]').onclick = () => { const url = window.prompt('URL do anexo (nota fiscal, comprovante…)'); if (url) { anexos.push({ nome: url.split('/').pop().slice(0, 40) || url, url }); paintAnex(); } };
  mb.append(h('<div class="row2"></div>')); mb.lastChild.append(fieldEl('Tags', tagsEl), fieldEl('Referência', ref));
  if (L.tipo === 'pagar') mb.append(fieldEl('Código do boleto ou PIX', codigo, { hint: 'Ao anexar o boleto (PDF ou foto) o sistema lê sozinho. Pode colar os dois, um por linha.' }));
  mb.append(fieldEl('Anexos', anexBox));
  f.appendChild(fieldEl('Observações', obs, { hint: 'Aparecem só ao abrir o lançamento.' }));
  f.appendChild(more);

  // footer
  const foot = d.footer; foot.innerHTML = '';
  const bCancel = h('<button type="button" class="btn ghost">Cancelar</button>'); bCancel.onclick = () => d.close();
  const bSave = h(`<button type="submit" form="_" class="btn primary">${icon('ti-check')}${isEdit ? 'Salvar' : 'Salvar lançamento'}</button>`);
  const bMore = h(`<button type="button" class="btn ghost sm">${icon('ti-dots')}</button>`);
  // o menu só tem ações para lançamento existente (duplicar/excluir): em lançamento novo o botão não aparece
  if (!isEdit) bMore.classList.add('hidden');
  foot.append(bMore, h('<span class="grow"></span>'), bCancel, bSave);
  if (!isEdit) { const bAgain = h('<button type="button" class="btn secondary">Salvar e novo</button>'); bAgain.onclick = () => submit(true); foot.insertBefore(bAgain, bSave); }
  bMore.onclick = e => { import('../ui.js').then(({ menu }) => menu(bMore, [isEdit ? { label: 'Duplicar', icon: 'ti-copy', onClick: () => { d.close(); abrirLancamento(null, { tipo: L.tipo, defaults: { ...L, id: undefined, baixas: [], status: 'aberto', parcela_num: null, parcela_total: null, grupo_parcelas_id: null, recorrencia_id: null, recorrencia: null, conciliado_fitid: null } }); } } : null, isEdit ? { label: 'Excluir', icon: 'ti-trash', danger: true, onClick: async () => { if (await excluirLancamento(L)) d.close(); } } : null].filter(Boolean), { align: 'left' })); };
  bSave.onclick = e => { e.preventDefault(); submit(false); };
  f.onsubmit = e => { e.preventDefault(); submit(false); };

  function repaintTipo() {
    const tr = L.tipo === 'transferencia';
    f.classList.toggle('is-tr', tr); drop.classList.toggle('hidden', tr);
    fDest.classList.toggle('hidden', !tr); fForma.classList.toggle('hidden', tr); rowCC.classList.toggle('hidden', tr); rateioBox.classList.toggle('hidden', tr || !rateio.length); ccBox.classList.toggle('hidden', tr); pagoBox.classList.toggle('hidden', tr); repBox.classList.toggle('hidden', tr);
    fConta.querySelector('.fl').textContent = tr ? 'Da conta' : 'Conta (opcional)';
    if (!isEdit) avisoVenc();
    if (!tr) { categoria.setOptions(catOpts(C.categorias, L.tipo === 'receber' ? 'in' : 'out')); const cat = db.get('categorias', categoria.get()); if (cat && cat.tipo !== (L.tipo === 'receber' ? 'in' : 'out')) categoria.set(null); tglPago.querySelector('.tgl-l').textContent = L.tipo === 'receber' ? 'Já foi recebido' : 'Já foi pago'; }
    descr.placeholder = tr ? 'Ex.: Saque Pagar.me → BTG' : L.tipo === 'receber' ? 'Ex.: Repasse Mercado Livre' : 'Ex.: Meta Ads · setembro';
    if (tr && !isEdit) descrTransf(); else if (!tr && descrAuto && descr.value === descrAuto) { descr.value = ''; descrAuto = ''; }
  }
  repaintTipo();

  async function submit(again) {
    const v = valor.get(); if (!v) { toast('Informe o valor', 'err'); valor.input.focus(); return; }
    if (!descr.value.trim()) { toast('Informe a descrição', 'err'); descr.focus(); return; }
    if (!venc.value) { toast('Informe a data', 'err'); return; }
    const tr = L.tipo === 'transferencia';
    if (tr && !conta.get()) { toast('Escolha a conta de origem', 'err'); return; }
    if (!tr && !isEdit && tglPago.get() && !pagoConta.get()) { toast(L.tipo === 'receber' ? 'Escolha a conta em que recebeu' : 'Escolha a conta que pagou', 'err'); return; }
    if (tr && (!contaDest.get() || contaDest.get() === conta.get())) { toast('Escolha uma conta de destino diferente da origem', 'err'); return; }
    if (!tr && !categoria.get() && !rateio.length) { toast('Escolha a categoria', 'err'); return; }
    if (!tr && rateio.length) { const t = sum(rateio, r => r.valor); if (Math.abs(t - v) > 0.005) { toast('O rateio precisa somar o valor total', 'err'); return; } if (rateio.some(r => !r.categoria_id)) { toast('Escolha a categoria de cada linha do rateio', 'err'); return; } }
    const centros = ccPick ? ccPick.get() : [];
    const pctTot = sum(centros, c => c.percent); if (centros.length && Math.abs(pctTot - 100) > 0.01) { toast('Os centros de custo precisam somar 100%', 'err'); return; }
    if (anexos.some(a => a.enviando)) { toast('Aguarde o envio dos anexos', 'warn'); return; }
    const base = { ...L, empresa_id: E, tipo: L.tipo, descricao: descr.value.trim(), valor: v, vencimento: venc.value, competencia: monthStart(venc.value), contato_id: tr ? null : contato.get(), categoria_id: tr ? null : (rateio.length ? rateio[0].categoria_id : categoria.get()), rateio_categorias: tr ? [] : (rateio.length > 1 ? rateio.map(r => ({ categoria_id: r.categoria_id, valor: round2(r.valor), descricao: r.descricao || '' })) : []), rateio_centros: tr ? [] : ccPick.get(), conta_id: conta.get(), conta_destino_id: tr ? contaDest.get() : null, forma_pagamento: tr ? 'transferencia' : forma.get(), tags: [...selTags], referencia: ref.value.trim(), observacoes: obs.value.trim(), anexos, origem: L.origem || 'manual', criado_em: L.criado_em || new Date().toISOString() };
    if (tr) base.status = 'pago';
    if (L.tipo === 'pagar') { const cod = parseCodigos(codigo.value); base.boleto_linha = cod.boleto_linha; base.pix_codigo = cod.pix_codigo; const bruto = codigo.value.trim(); if (bruto && !cod.boleto_linha && !cod.pix_codigo) return toast('Código do boleto/PIX inválido. Confira os dígitos ou deixe em branco.', 'err', 5000); } else { base.boleto_linha = null; base.pix_codigo = null; }
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
export function abrirBaixa(lancs, { onDone, conta_id = null, escolherConta = false } = {}) {
  const list = Array.isArray(lancs) ? lancs : [lancs]; const C = app.ctx();
  const isRec = list.every(l => l.tipo === 'receber'); const multi = list.length > 1;
  if (multi) return abrirBaixaLote(list.filter(l => emAberto(l) > 0), { onDone, isRec });
  const total = round2(sum(list, emAberto));
  const m = modal({ title: isRec ? 'Registrar recebimento' : 'Registrar pagamento', size: 'md' });
  const b = m.body;
  const l0 = list[0];
  b.innerHTML = `<div class="baixa-head"><div class="baixa-t">${esc(l0.descricao)}</div><div class="muted sm">${C.contato(l0.contato_id)?.nome || ''} · venc. ${fmtDate(l0.vencimento)}${liquidado(l0) ? ` · já ${isRec ? 'recebido' : 'pago'} ${money(liquidado(l0))}` : ''}</div></div>`;
  const dt = h(`<input class="inp" type="date" value="${today()}">`);
  // escolherConta: sem conta pré-selecionada (pagamento por PIX pode sair de qualquer banco); o Confirmar exige a escolha
  const conta = combobox({ options: C.contas.filter(c => !c.arquivada).map(contaOpt), value: escolherConta ? null : (conta_id || l0.conta_id || C.contas[0]?.id), allowEmpty: false, placeholder: 'Escolha a conta de onde saiu' });
  const val = moneyInput({ value: total, cls: 'lg' });
  const juros = moneyInput({ value: 0 }), multa = moneyInput({ value: 0 }), desc = moneyInput({ value: 0 });
  const r1 = h('<div class="row2"></div>'); r1.append(fieldEl('Data', dt), fieldEl('Conta', conta)); b.appendChild(r1);
  b.appendChild(fieldEl(`Valor ${isRec ? 'recebido' : 'pago'}`, val, { hint: 'Menor que o em aberto = baixa parcial.' }));
  const det = h(`<details class="more"><summary>${icon('ti-chevron-right')}Juros, multa e desconto</summary><div class="row3"></div></details>`); det.querySelector('.row3').append(fieldEl('Juros', juros), fieldEl('Multa', multa), fieldEl('Desconto', desc)); b.appendChild(det);
  const resumo = h('<div class="baixa-res muted sm"></div>'); b.appendChild(resumo);
  const calc = () => { const principal = round2(val.get() - juros.get() - multa.get() + desc.get()); const rest = round2(total - principal); resumo.innerHTML = `Abate ${money(principal)} do principal${rest > 0.005 ? ` · fica em aberto ${money(rest)}` : rest < -0.005 ? ` · <b class="neg">excede em ${money(-rest)}</b>` : ' · quita tudo'}`; };
  b.addEventListener('money', calc); calc();
  const obs = h('<input class="inp" placeholder="Observação (opcional)">'); b.appendChild(fieldEl('Observação', obs));
  m.footer.innerHTML = ''; const bc = h('<button class="btn ghost">Cancelar</button>'); bc.onclick = () => m.close(); const ok = h(`<button class="btn primary">${icon('ti-check')}Confirmar</button>`); m.footer.append(bc, ok);
  ok.onclick = async () => {
    const v = val.get(); if (v <= 0) { toast('Informe o valor', 'err'); return; }
    if (!conta.get()) { toast('Escolha a conta', 'err'); return; }
    const bx = { id: uid(), data: dt.value, valor: round2(v), conta_id: conta.get(), juros: juros.get(), multa: multa.get(), desconto: desc.get(), observacao: obs.value.trim() };
    await db.upsert('lancamentos', [{ ...l0, baixas: [...(l0.baixas || []), bx] }]);
    toast(isRec ? 'Recebimento registrado' : 'Pagamento registrado'); m.close(true); onDone && onDone();
  };
}

// Baixa em lote: um campo de valor por lançamento (parcial quando menor que o em aberto)
function abrirBaixaLote(list, { onDone, isRec }) {
  const C = app.ctx();
  if (!list.length) { toast('Nada em aberto nos selecionados'); return; }
  const m = modal({ title: `${isRec ? 'Receber' : 'Pagar'} ${list.length} lançamentos`, size: 'lg' });
  const b = m.body;
  const dt = h(`<input class="inp" type="date" value="${today()}">`);
  const contaPadrao = list.find(l => l.conta_id)?.conta_id || C.contas.find(c => !c.arquivada && c.tipo !== 'cartao')?.id || C.contas[0]?.id;
  const conta = combobox({ options: C.contas.filter(c => !c.arquivada).map(contaOpt), value: contaPadrao, allowEmpty: false });
  const r1 = h('<div class="row2"></div>'); r1.append(fieldEl('Data', dt), fieldEl('Conta', conta)); b.appendChild(r1);
  const wrap = h(`<div class="bx-lote"><div class="bx-h"><span>Lançamento</span><span class="r">Em aberto</span><span class="r">${isRec ? 'Valor a receber' : 'Valor a pagar'}</span><span></span></div><div class="bx-rows"></div><div class="bx-tot"><span data-n></span><b data-t></b></div></div>`);
  b.appendChild(wrap);
  const rowsEl = wrap.querySelector('.bx-rows');
  const itens = list.map(l => ({ l, aberto: round2(emAberto(l)), valor: round2(emAberto(l)), fora: false }));
  const paintTot = () => {
    const ativos = itens.filter(i => !i.fora && i.valor > 0); const t = round2(sum(ativos, i => i.valor));
    wrap.querySelector('[data-n]').textContent = `${ativos.length} de ${itens.length} lançamento${itens.length === 1 ? '' : 's'}`;
    wrap.querySelector('[data-t]').textContent = money(t);
    for (const i of itens) { const r = i.el; if (!r) continue; const st = r.querySelector('.bx-st'); const rest = round2(i.aberto - i.valor); r.classList.toggle('fora', i.fora); r.classList.toggle('parcial', !i.fora && i.valor > 0 && rest > 0.005); r.classList.toggle('excede', !i.fora && rest < -0.005);
      st.textContent = i.fora ? 'não entra' : i.valor <= 0 ? 'não entra' : rest > 0.005 ? `parcial · fica ${money(rest)}` : rest < -0.005 ? `excede em ${money(-rest)}` : 'quita'; }
  };
  for (const it of itens) {
    const l = it.l; const ct = C.contato(l.contato_id);
    const r = h(`<div class="bx-r"><div class="bx-d">${catIcon(C.cat(l.categoria_id), 26)}<div class="bx-dt"><b>${esc(l.descricao)}</b><small>${ct ? esc(ct.nome) + ' · ' : ''}venc. ${fmtDate(l.vencimento)}${l.parcela_total ? ` · ${l.parcela_num}/${l.parcela_total}` : ''}</small></div></div><div class="bx-ab r">${money(it.aberto)}</div><div class="bx-v"></div><div class="bx-x"><button type="button" class="ibtn" title="Tirar da lista">${icon('ti-x')}</button></div><div class="bx-st muted"></div></div>`);
    const mi = moneyInput({ value: it.valor }); mi.addEventListener('money', e => { it.valor = round2(e.detail); paintTot(); });
    mi.input.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); const all = [...rowsEl.querySelectorAll('.minp input')]; const n = all[all.indexOf(mi.input) + 1]; if (n) n.focus(); else ok.focus(); } });
    r.querySelector('.bx-v').appendChild(mi);
    r.querySelector('.bx-x button').onclick = () => { it.fora = !it.fora; r.querySelector('.bx-x button').innerHTML = icon(it.fora ? 'ti-arrow-back-up' : 'ti-x'); paintTot(); };
    it.el = r; rowsEl.appendChild(r);
  }
  const obs = h('<input class="inp" placeholder="Observação (opcional, vale para todas)">'); b.appendChild(fieldEl('Observação', obs));
  m.footer.innerHTML = ''; const bc = h('<button class="btn ghost">Cancelar</button>'); bc.onclick = () => m.close(); const ok = h(`<button class="btn primary">${icon('ti-check')}Confirmar</button>`); m.footer.append(bc, ok);
  paintTot();
  ok.onclick = async () => {
    if (!conta.get()) { toast('Escolha a conta', 'err'); return; }
    const ativos = itens.filter(i => !i.fora && i.valor > 0);
    if (!ativos.length) { toast('Informe pelo menos um valor', 'err'); return; }
    const exc = ativos.find(i => i.valor - i.aberto > 0.005); if (exc) { toast(`"${exc.l.descricao}" está acima do em aberto`, 'err'); return; }
    const rows = ativos.map(i => ({ ...i.l, baixas: [...(i.l.baixas || []), { id: uid(), data: dt.value, valor: round2(i.valor), conta_id: conta.get(), juros: 0, multa: 0, desconto: 0, observacao: obs.value.trim() }] }));
    await db.upsert('lancamentos', rows);
    const parciais = ativos.filter(i => i.aberto - i.valor > 0.005).length;
    toast(`${rows.length} ${isRec ? 'recebimento' : 'pagamento'}${rows.length === 1 ? '' : 's'} registrado${rows.length === 1 ? '' : 's'}${parciais ? ` (${parciais} parcial${parciais === 1 ? '' : 'is'})` : ''}`); m.close(true); onDone && onDone();
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
  <div class="kvs">${kv('Vencimento', fmtDate(l.vencimento))}${kv(isTr ? 'De' : 'Conta', cta ? `<span class="inl">${bankIcon(cta, 18)} ${esc(cta.nome)}</span>` : '')}${isTr ? kv('Para', `<span class="inl">${bankIcon(C.conta(l.conta_destino_id), 18)} ${esc(C.conta(l.conta_destino_id)?.nome)}</span>`) : ''}${kv('Forma', FORMAS.find(f => f.id === l.forma_pagamento)?.nome)}${l.tipo === 'pagar' && ct?.pix ? kv('Chave PIX', `<span class="mono">${esc(ct.pix)}</span>`) : ''}${l.tipo === 'pagar' && (l.boleto_linha || ehLinha(l.referencia)) ? kv('Boleto', `<span class="mono sm">${fmtLinha(l.boleto_linha || soDigitos(l.referencia))}</span>`) : ''}${kv('Referência', esc(l.referencia))}${kv('Origem', esc({ manual: 'Manual', pagarme: 'Pagar.me', shopify: 'Shopify', nibo: 'Nibo', importacao: 'Importação', extrato: 'Extrato' }[l.origem || 'manual']))}${kv('Centro de custo', (l.rateio_centros || []).map(r => `${esc(C.centro(r.centro_id)?.nome)} ${r.percent}%`).join(', '))}</div>
  ${l.rateio_categorias?.length ? `<h5>Rateio</h5><div class="det-list">${l.rateio_categorias.map(r => `<div class="det-li">${catIcon(C.cat(r.categoria_id), 24)}<span>${esc(C.cat(r.categoria_id)?.nome)}${r.descricao ? ` <small class="muted">${esc(r.descricao)}</small>` : ''}</span><b>${money(r.valor)}</b></div>`).join('')}</div>` : ''}
  ${!isTr ? `<h5>Baixas <span class="muted">${money(liquidado(l))} de ${money(l.valor)}</span></h5><div class="det-list" data-baixas>${(l.baixas || []).map(b => `<div class="det-li">${bankIcon(C.conta(b.conta_id), 24)}<span>${fmtDate(b.data)} · ${esc(C.conta(b.conta_id)?.nome || '')}${b.juros || b.multa || b.desconto ? ` <small class="muted">${b.juros ? 'juros ' + money(b.juros) + ' ' : ''}${b.multa ? 'multa ' + money(b.multa) + ' ' : ''}${b.desconto ? 'desc. ' + money(b.desconto) : ''}</small>` : ''}${b.observacao ? ` <small class="muted">${esc(b.observacao)}</small>` : ''}</span><b>${money(b.valor)}</b><button class="ibtn" data-est="${b.id}" title="Estornar">${icon('ti-arrow-back-up')}</button></div>`).join('') || '<div class="muted sm">Nenhuma baixa ainda.</div>'}</div>` : ''}
  ${l.observacoes ? `<h5>Observações</h5><p class="det-obs">${esc(l.observacoes)}</p>` : ''}
  ${l.anexos?.length ? `<h5>Anexos</h5><div class="anexos-l">${l.anexos.map((a, i) => `<a class="anexo" href="${a.id ? '#' : esc(a.url)}" ${a.id ? `data-anexo="${i}"` : 'target="_blank"'}>${icon(anexoIcone(a))}${esc(a.nome || a.url)}${a.tamanho ? ` <small class="muted">${fmtBytes(a.tamanho)}</small>` : ''}</a>`).join('')}</div>` : ''}
  ${sugestaoHtml(l, C)}
  <div class="muted xs det-meta">Criado ${l.criado_em ? new Date(l.criado_em).toLocaleString('pt-BR') : ''}${l.atualizado_em ? ' · atualizado ' + new Date(l.atualizado_em).toLocaleString('pt-BR') : ''}</div>
  ${db.temHistorico ? '<details class="hist"><summary>' + icon('ti-history') + 'Histórico de alterações</summary><div class="hist-b" data-hist><span class="muted sm">Carregando…</span></div></details>' : ''}`;
  d.body.querySelectorAll('[data-sug-ok]').forEach(b => b.onclick = () => aceitarSugestao(l, d));
  d.body.querySelectorAll('[data-sug-outra]').forEach(b => b.onclick = () => { d.close(); abrirLancamento({ ...l, sugestao: null }); });
  const histEl = d.body.querySelector('[data-hist]'); if (histEl) { const det = histEl.closest('details'); det.addEventListener('toggle', () => { if (det.open && !det.dataset.ok) { det.dataset.ok = '1'; carregarHistorico(histEl, 'lancamentos', l, C, d); } }, { once: false }); }
  d.body.querySelectorAll('[data-anexo]').forEach(a => a.onclick = e => { e.preventDefault(); abrirAnexo(l.anexos[Number(a.dataset.anexo)]); });
  d.body.querySelectorAll('[data-est]').forEach(b => b.onclick = async () => { if (await estornarBaixa(l, b.dataset.est)) d.close(); });
  d.footer.innerHTML = '';
  const bDel = h(`<button class="btn ghost danger-t">${icon('ti-trash')}</button>`); bDel.onclick = async () => { if (await excluirLancamento(l)) d.close(); };
  const bDup = h(`<button class="btn ghost" title="Duplicar">${icon('ti-copy')}</button>`); bDup.onclick = () => { d.close(); abrirLancamento(null, { tipo: l.tipo, defaults: { ...l, id: undefined, baixas: [], status: 'aberto', parcela_num: null, parcela_total: null, grupo_parcelas_id: null, recorrencia_id: null, recorrencia: null, conciliado_fitid: null, vencimento: today() } }); };
  const bEdit = h(`<button class="btn secondary">${icon('ti-pencil')}Editar</button>`); bEdit.onclick = () => { d.close(); abrirLancamento(l); };
  d.footer.append(bDel, bDup, h('<span class="grow"></span>'), bEdit);
  if (!isTr && st !== 'pago' && st !== 'cancelado') {
    // fornecedor com chave PIX: QR Code / copia e cola com o valor em aberto. O PIX pode sair de qualquer banco: a conta é escolhida na baixa, sem pré-seleção.
    // boleto: linha digitável salva (ou na referência, nos que vieram pelo Telegram) ou PDF anexado que ainda não foi lido
    const linhaBol = l.boleto_linha || (ehLinha(l.referencia) ? soDigitos(l.referencia) : null); const pdfAnexo = (l.anexos || []).find(a => a.id && ehArquivoLegivel(a.tipo || '', a.nome || ''));
    if (l.tipo === 'pagar' && (linhaBol || l.pix_codigo || pdfAnexo)) {
      const bBol = h(`<button type="button" class="btn secondary" title="Pagar boleto">${icon('ti-barcode')}Boleto</button>`);
      bBol.onclick = () => modalBoleto({ lanc: l, linha: linhaBol, pix: l.pix_codigo || null, onPago: () => { d.close(); abrirBaixa(l, { escolherConta: true }); },
        onLer: pdfAnexo && !linhaBol && !l.pix_codigo ? async () => { const x = await db.backend.anexoGet(pdfAnexo.id); const r = await lerBoletoArquivo({ base64: x.base64, nome: x.nome, tipo: x.tipo || pdfAnexo.tipo || '' }); if (r?.linha || r?.pix) { await db.upsert('lancamentos', { ...l, boleto_linha: r.linha || null, pix_codigo: r.pix || null }); l.boleto_linha = r.linha || null; l.pix_codigo = r.pix || null; } return r; } : null });
      d.footer.append(bBol);
    }
    if (l.tipo === 'pagar' && ct?.pix) { const bPix = h(`<button class="btn secondary" title="Pagar com PIX">${icon('ti-qrcode')}PIX</button>`); bPix.onclick = async () => { const { modalPix } = await import('../pix.js'); modalPix({ lanc: l, contato: ct, valor: emAberto(l), onPago: () => { d.close(); abrirBaixa(l, { escolherConta: true }); } }); }; d.footer.append(bPix); }
    const bPay = h(`<button class="btn primary">${icon(l.tipo === 'receber' ? 'ti-arrow-down-left' : 'ti-check')}${l.tipo === 'receber' ? 'Receber' : 'Pagar'}</button>`); bPay.onclick = () => { d.close(); abrirBaixa(l); }; d.footer.append(bPay);
  }
  return d;
}
export function statusPill(l) {
  const s = statusOf(l); const map = { aberto: 'blue', parcial: 'amber', atrasado: 'red', pago: 'green', cancelado: 'gray' };
  const nome = s === 'pago' ? (l.tipo === 'receber' ? 'Recebido' : l.tipo === 'transferencia' ? 'Efetuada' : 'Pago') : { aberto: 'Em aberto', parcial: 'Parcial', atrasado: 'Atrasado', cancelado: 'Cancelado' }[s];
  return `<span class="pill ${map[s]}">${nome}</span>`;
}

// ---------- anexos ----------
function anexoIcone(a) { const t = a.tipo || ''; const n = a.nome || a.url || ''; return t.startsWith('image/') || /\.(png|jpe?g|webp|heic)$/i.test(n) || (a.url || '').startsWith('data:image') ? 'ti-photo' : t === 'application/pdf' || /\.pdf$/i.test(n) ? 'ti-file-type-pdf' : a.url && !a.id ? 'ti-link' : 'ti-file'; }
function fmtBytes(b) { return b > 1048576 ? (b / 1048576).toFixed(1) + ' MB' : b > 1024 ? Math.round(b / 1024) + ' KB' : b + ' B'; }
// fotos do iPhone vêm com 3-5 MB: reduz pra no máx. 1800px / JPEG 85% antes de subir
async function prepararArquivo(file) {
  let nome = file.name, tipo = file.type || 'application/octet-stream';
  if (tipo.startsWith('image/') && file.size > 700 * 1024 && typeof createImageBitmap === 'function') {
    try {
      const bmp = await createImageBitmap(file); const max = 1800; const k = Math.min(1, max / Math.max(bmp.width, bmp.height));
      const cv = document.createElement('canvas'); cv.width = Math.round(bmp.width * k); cv.height = Math.round(bmp.height * k);
      cv.getContext('2d').drawImage(bmp, 0, 0, cv.width, cv.height);
      const base64 = cv.toDataURL('image/jpeg', 0.85); nome = nome.replace(/\.[^.]+$/, '') + '.jpg';
      return { base64, tipo: 'image/jpeg', tamanho: Math.round((base64.length - 23) * 3 / 4), nome };
    } catch {}
  }
  const base64 = await readFile(file, 'data'); return { base64, tipo, tamanho: file.size, nome };
}
export async function abrirAnexo(a) {
  if (!a) return;
  if (a.url && !a.id) { window.open(a.url, '_blank'); return; }
  if (!db.temAnexosServidor) return toast('Anexo indisponível neste modo', 'warn');
  const w = window.open('', '_blank'); // abre já no gesto do toque (Safari bloqueia depois do await)
  try {
    const x = await db.backend.anexoGet(a.id);
    const bin = atob(x.base64); const buf = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
    const url = URL.createObjectURL(new Blob([buf], { type: x.tipo || 'application/octet-stream' }));
    if (w) w.location = url; else window.open(url, '_blank');
    setTimeout(() => URL.revokeObjectURL(url), 120000);
  } catch (e) { if (w) w.close(); toast('Não foi possível abrir o anexo: ' + e.message, 'err', 5000); }
}

// ---------- sugestão da IA ----------
function sugestaoHtml(l, C) {
  const sg = l.sugestao; if (!sg || !sg.categoria_id || l.categoria_id === sg.categoria_id) return '';
  const cat = C.cat(sg.categoria_id); if (!cat) return '';
  const pct = Math.round((Number(sg.confianca) || 0) * 100);
  return `<div class="sug"><div class="sug-h">${icon('ti-sparkles')}<b>Sugestão da IA</b><span class="pill ${pct >= 80 ? 'green' : 'gray'}">${pct}%</span></div><div class="sug-b">${catIcon(cat, 26)}<div><div class="sug-c">${esc(cat.nome)}</div>${sg.motivo ? `<div class="muted xs">${esc(sg.motivo)}</div>` : ''}</div></div><div class="sug-a"><button class="btn primary sm" data-sug-ok>${icon('ti-check')}Aceitar</button><button class="btn ghost sm" data-sug-outra>Escolher outra</button></div></div>`;
}
export async function aceitarSugestao(l, d = null) {
  const C = app.ctx(); const sg = l.sugestao; const cat = C.cat(sg?.categoria_id); if (!cat) return;
  await db.upsert('lancamentos', { ...l, categoria_id: cat.id, sugestao: null });
  toast(`Classificado como ${cat.nome}`);
  if (d) d.close();
  if (l.contato_id && !C.regras.some(r => r.contato_id === l.contato_id && !r.padrao)) {
    const ct = C.contato(l.contato_id);
    if (ct && await confirm({ title: 'Criar regra?', msg: `Sempre classificar <b>${esc(ct.nome)}</b> como <b>${esc(cat.nome)}</b>? Vale para os próximos lançamentos desse fornecedor.`, ok: 'Criar regra', cancel: 'Só este' })) {
      await db.upsert('regras', { id: uid(), empresa_id: l.empresa_id, nome: `${ct.nome} → ${cat.nome}`, tipo: l.tipo, contato_id: ct.id, padrao: null, categoria_id: cat.id, rateio_centros: null, prioridade: 150, ativa: true, origem: 'manual', acertos: 0 });
      toast('Regra criada');
    }
  }
}

// ---------- histórico de alterações ----------
const ROTULOS = { descricao: 'Descrição', valor: 'Valor', vencimento: 'Vencimento', categoria_id: 'Categoria', contato_id: 'Contato', conta_id: 'Conta', conta_destino_id: 'Conta destino', status: 'Status', baixas: 'Baixas', tags: 'Tags', observacoes: 'Observações', referencia: 'Referência', forma_pagamento: 'Forma de pagamento', rateio_centros: 'Centros de custo', rateio_categorias: 'Rateio', anexos: 'Anexos', deletado_em: 'Excluído', sugestao: 'Sugestão da IA', recorrencia: 'Recorrência', tipo: 'Tipo', nome: 'Nome', ativa: 'Ativa', padrao: 'Padrão', prioridade: 'Prioridade' };
function fmtCampo(k, v, C) {
  if (v === null || v === undefined || v === '') return '—';
  if (k === 'valor') return money(Number(v));
  if (k === 'vencimento') return fmtDate(String(v).slice(0, 10));
  if (k === 'categoria_id') return C.cat(v)?.nome || '?';
  if (k === 'contato_id') return C.contato(v)?.nome || '?';
  if (k === 'conta_id' || k === 'conta_destino_id') return C.conta(v)?.nome || '?';
  if (k === 'baixas') return Array.isArray(v) ? (v.length ? v.map(b => `${fmtDate(b.data)} ${money(b.valor)}`).join(', ') : 'nenhuma') : String(v);
  if (k === 'rateio_centros') return Array.isArray(v) ? v.map(r => `${C.centro(r.centro_id)?.nome || '?'} ${r.percent}%`).join(', ') : String(v);
  if (k === 'anexos') return Array.isArray(v) ? `${v.length} arquivo${v.length === 1 ? '' : 's'}` : String(v);
  if (k === 'tags') return Array.isArray(v) ? (v.join(', ') || 'nenhuma') : String(v);
  if (k === 'deletado_em') return v ? 'sim' : 'não';
  if (typeof v === 'object') return JSON.stringify(v).slice(0, 80);
  return String(v);
}
export function itemHistoricoHtml(it, C, { comTitulo = false } = {}) {
  const quando = new Date(it.em).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  const quem = it.quem && it.quem !== 'sistema' ? esc(it.quem) : (it.origem ? `sistema · ${esc(it.origem)}` : 'sistema');
  const verbo = { criou: 'criou', alterou: 'alterou', excluiu: 'excluiu', restaurou: 'restaurou' }[it.acao] || it.acao;
  let detalhe = '';
  if (it.acao === 'alterou' && it.campos) detalhe = `<ul class="hist-d">${it.campos.filter(k => k !== 'atualizado_em' && k !== 'competencia').map(k => `<li><span>${esc(ROTULOS[k] || k)}</span> ${esc(fmtCampo(k, it.de?.[k], C))} <i class="ti ti-arrow-right"></i> <b>${esc(fmtCampo(k, it.para?.[k], C))}</b></li>`).join('')}</ul>`;
  return `<div class="hist-i" data-aud="${it.id}"><div class="hist-t"><b>${quem}</b> ${verbo}${comTitulo && it.titulo ? ` <span class="muted">${esc(it.titulo)}${it.valor ? ' · ' + money(Number(it.valor)) : ''}</span>` : ''} <small class="muted">${quando}</small>${it.acao !== 'restaurou' ? `<button class="btn ghost xs" data-undo="${it.id}" title="Desfazer">${icon('ti-arrow-back-up')}Desfazer</button>` : ''}</div>${detalhe}</div>`;
}
async function carregarHistorico(el, tabela, l, C, d) {
  try {
    const itens = await db.backend.historico(tabela, l.id);
    el.innerHTML = itens.length ? itens.map(it => itemHistoricoHtml(it, C)).join('') : '<span class="muted sm">Nenhuma alteração registrada ainda.</span>';
    el.querySelectorAll('[data-undo]').forEach(b => b.onclick = () => desfazerAlteracao(Number(b.dataset.undo), tabela, d));
  } catch (e) { el.innerHTML = `<span class="neg sm">${esc(e.message)}</span>`; }
}
export async function desfazerAlteracao(id, tabela, d = null) {
  if (!await confirm({ title: 'Desfazer alteração', msg: 'O registro volta ao estado anterior a esta alteração. Isso também fica no histórico.', ok: 'Desfazer' })) return false;
  try {
    const r = await db.backend.desfazer(id);
    if (r.registro) db.aplicarLocal(tabela, r.registro);
    toast(r.removido ? 'Registro arquivado' : 'Alteração desfeita');
    if (d) d.close();
    return true;
  } catch (e) { toast(e.message, 'err', 5000); return false; }
}

// Procura um contato pelo nome do beneficiário do boleto (sem acentos/pontuação; aceita nome contido no outro)
function acharContato(nome) {
  const norm = x => String(x || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/\b(LTDA|ME|EPP|EIRELI|SA|S A|CIA)\b/g, ' ').replace(/[^A-Z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
  const b = norm(nome); if (b.length < 4) return null;
  const cts = app.ctx().contatos.filter(c => !c.arquivado && c.deletado_em == null);
  return cts.find(c => norm(c.nome) === b) || cts.find(c => { const n = norm(c.nome); return n.length >= 5 && (b.includes(n) || n.includes(b)); }) || null;
}
