// Cadastros: contas, categorias (plano de contas), centros de custo, contatos, tags.
import { app } from '../app.js';
import { db } from '../db.js';
import { h, icon, bankIcon, catIcon, avatar, drawer, modal, field, fieldEl, moneyInput, combobox, segmented, toggle, toast, confirm, menu, emptyState, on, prompt } from '../ui.js';
import { money, today, esc, uid, norm, fmtDoc, sum, round2 } from '../utils.js';
import { BANCOS, TIPOS_CONTA, banco } from '../bancos.js';
import { GRUPOS } from '../seed.js';
import { saldoConta, statusOf } from '../model.js';

const ABAS = [{ id: 'contas', label: 'Contas', icon: 'ti-building-bank' }, { id: 'categorias', label: 'Categorias', icon: 'ti-category' }, { id: 'contatos', label: 'Contatos', icon: 'ti-users' }, { id: 'centros', label: 'Centros de custo', icon: 'ti-target' }, { id: 'tags', label: 'Tags', icon: 'ti-tag' }];
let aba = 'contas'; let q = '';

export function render(root, { sub = null } = {}) {
  if (sub && ABAS.some(a => a.id === sub)) aba = sub;
  const E = app.empresaId; const C = app.ctx();
  root.innerHTML = `<div class="page cad"><header class="ph"><div><h1>Cadastros</h1></div><div class="ph-a"><button class="btn primary" data-novo>${icon('ti-plus')}${{ contas: 'Nova conta', categorias: 'Nova categoria', contatos: 'Novo contato', centros: 'Novo centro', tags: 'Nova tag' }[aba]}</button></div></header>
    <div class="rel-nav">${ABAS.map(a => `<a class="rel-tab ${aba === a.id ? 'on' : ''}" href="#/cadastros/${a.id}">${icon(a.icon)}${a.label}<b>${C[a.id].filter(x => !x.arquivada && !x.arquivado).length}</b></a>`).join('')}</div>
    <div class="toolbar"><div class="search">${icon('ti-search')}<input placeholder="Buscar…" value="${esc(q)}"></div></div>
    <div data-body></div></div>`;
  const si = root.querySelector('.search input'); si.oninput = () => { q = si.value; const p = si.selectionStart; paint(); };
  root.querySelector('[data-novo]').onclick = () => ({ contas: () => abrirConta(), categorias: () => abrirCategoria(), contatos: () => abrirContato(), centros: () => abrirCentro(), tags: () => abrirTag() }[aba]());
  const body = root.querySelector('[data-body]');
  const paint = () => { body.innerHTML = ''; ({ contas: paintContas, categorias: paintCategorias, contatos: paintContatos, centros: paintCentros, tags: paintTags }[aba])(body, C, E); };
  paint();
}
const match = (s) => !q || norm(s).includes(norm(q));

function paintContas(body, C, E) {
  const list = C.contas.filter(c => match(c.nome + ' ' + banco(c.banco).nome)).sort((a, b) => (a.arquivada - b.arquivada) || (a.ordem || 0) - (b.ordem || 0));
  if (!list.length) return body.appendChild(emptyState({ icon: 'ti-building-bank', title: 'Nenhuma conta', action: { label: 'Nova conta', icon: 'ti-plus', onClick: () => abrirConta() } }));
  body.innerHTML = `<div class="cards3">${list.map(c => `<div class="card conta-big ${c.arquivada ? 'arch' : ''}" data-id="${c.id}">${bankIcon(c, 48)}<div class="cb-i"><div class="cb-n">${esc(c.nome)}${c.arquivada ? '<span class="pill gray xs">arquivada</span>' : ''}</div><div class="muted sm">${banco(c.banco).nome} · ${TIPOS_CONTA.find(t => t.id === c.tipo)?.nome || ''}</div>${c.agencia || c.numero ? `<div class="muted xs">Ag ${esc(c.agencia || '—')} · Conta ${esc(c.numero || '—')}</div>` : ''}</div><div class="cb-v ${saldoConta(E, c.id) < 0 ? 'neg' : ''}">${money(saldoConta(E, c.id))}</div><button class="ibtn" data-menu>${icon('ti-dots-vertical')}</button></div>`).join('')}</div>`;
  on(body, 'click', '[data-menu]', (e, b) => { e.stopPropagation(); const c = db.get('contas', b.closest('[data-id]').dataset.id); menu(b, [{ label: 'Editar', icon: 'ti-pencil', onClick: () => abrirConta(c) }, { label: 'Ver extrato', icon: 'ti-list', onClick: () => location.hash = '#/extrato/' + c.id }, { label: c.arquivada ? 'Reativar' : 'Arquivar', icon: c.arquivada ? 'ti-archive-off' : 'ti-archive', onClick: () => db.upsert('contas', { ...c, arquivada: !c.arquivada }) }, '-', { label: 'Excluir', icon: 'ti-trash', danger: true, onClick: () => excluirConta(c) }]); });
  on(body, 'click', '.conta-big', (e, el) => { if (e.target.closest('button')) return; abrirConta(db.get('contas', el.dataset.id)); });
}
export function abrirConta(c = null) {
  const E = app.empresaId; const isEdit = !!c;
  const L = c ? { ...c } : { nome: '', banco: 'inter', tipo: 'corrente', agencia: '', numero: '', saldo_inicial: 0, data_saldo_inicial: today(), arquivada: false, ordem: (db.of('contas', E).length + 1), dia_fechamento: null, dia_vencimento: null };
  const d = drawer({ title: isEdit ? 'Editar conta' : 'Nova conta', size: 'md' });
  const f = h('<form class="lform"></form>'); d.body.appendChild(f);
  const preview = h(`<div class="conta-prev">${bankIcon(L, 56)}<div><div class="cb-n" data-pn>${esc(L.nome || 'Nome da conta')}</div><div class="muted sm" data-pb>${banco(L.banco).nome}</div></div></div>`); f.appendChild(preview);
  const bancoCb = combobox({ options: BANCOS.map(b => ({ id: b.id, label: b.nome, sub: b.compe ? 'cód. ' + b.compe : '', icon: bankIcon({ banco: b.id, nome: b.nome }, 24), keywords: b.compe })), value: L.banco, allowEmpty: false, onChange: v => { L.banco = v; const b = banco(v); if (b.tipo) tipo.set(b.tipo); if (!nome.value || nome.value === banco(prevBanco).nome) nome.value = b.nome; prevBanco = v; refresh(); } });
  let prevBanco = L.banco;
  const nome = h(`<input class="inp" value="${esc(L.nome)}" placeholder="Ex.: BTG principal" required>`); nome.oninput = refresh;
  const tipo = combobox({ options: TIPOS_CONTA.map(t => ({ id: t.id, label: t.nome, icon: icon(t.icone, 'oi') })), value: L.tipo, allowEmpty: false, onChange: v => { L.tipo = v; rowCartao.classList.toggle('hidden', v !== 'cartao'); } });
  f.appendChild(fieldEl('Banco / instituição', bancoCb));
  const r1 = h('<div class="row2"></div>'); r1.append(fieldEl('Nome da conta', nome, { req: true }), fieldEl('Tipo', tipo)); f.appendChild(r1);
  const ag = h(`<input class="inp" value="${esc(L.agencia || '')}" placeholder="0001">`), nu = h(`<input class="inp" value="${esc(L.numero || '')}" placeholder="12345-6">`);
  const r2 = h('<div class="row2"></div>'); r2.append(fieldEl('Agência', ag), fieldEl('Número da conta', nu)); f.appendChild(r2);
  const si = moneyInput({ value: L.saldo_inicial, allowNegative: true }); const sd = h(`<input class="inp" type="date" value="${L.data_saldo_inicial || today()}">`);
  const r3 = h('<div class="row2"></div>'); r3.append(fieldEl('Saldo inicial', si, { hint: 'Saldo real do banco nesta data. Os movimentos contam a partir daqui.' }), fieldEl('Na data', sd)); f.appendChild(r3);
  const fech = h(`<input class="inp" type="number" min="1" max="31" value="${L.dia_fechamento || ''}" placeholder="25">`), vencC = h(`<input class="inp" type="number" min="1" max="31" value="${L.dia_vencimento || ''}" placeholder="5">`);
  const rowCartao = h(`<div class="row2 ${L.tipo === 'cartao' ? '' : 'hidden'}"></div>`); rowCartao.append(fieldEl('Dia de fechamento', fech), fieldEl('Dia de vencimento', vencC)); f.appendChild(rowCartao);
  const cor = h(`<input type="color" class="inp color" value="${L.cor || banco(L.banco).cor}">`); f.appendChild(fieldEl('Cor (para contas sem logo)', cor));
  const arq = toggle({ label: 'Conta arquivada (não aparece nas listas)', checked: !!L.arquivada }); f.appendChild(arq);
  function refresh() { preview.querySelector('.bicon, .avatar')?.remove(); preview.insertAdjacentHTML('afterbegin', bankIcon({ ...L, nome: nome.value, banco: L.banco, cor: cor.value }, 56)); preview.querySelector('[data-pn]').textContent = nome.value || 'Nome da conta'; preview.querySelector('[data-pb]').textContent = banco(L.banco).nome; }
  d.footer.innerHTML = ''; const bc = h('<button class="btn ghost">Cancelar</button>'); bc.onclick = () => d.close(); const ok = h(`<button class="btn primary">${icon('ti-check')}Salvar</button>`);
  d.footer.append(bc, ok);
  ok.onclick = async () => { if (!nome.value.trim()) return toast('Informe o nome', 'err'); await db.upsert('contas', { ...L, empresa_id: E, nome: nome.value.trim(), banco: L.banco, tipo: tipo.get(), agencia: ag.value.trim(), numero: nu.value.trim(), saldo_inicial: si.get(), data_saldo_inicial: sd.value, dia_fechamento: Number(fech.value) || null, dia_vencimento: Number(vencC.value) || null, cor: cor.value !== banco(L.banco).cor ? cor.value : null, arquivada: arq.get() }); toast(isEdit ? 'Conta salva' : 'Conta criada'); d.close(true); };
  return d;
}
async function excluirConta(c) {
  const E = app.empresaId; const usada = db.of('lancamentos', E).some(l => l.conta_id === c.id || l.conta_destino_id === c.id || (l.baixas || []).some(b => b.conta_id === c.id));
  if (usada) return toast('Esta conta tem lançamentos. Arquive em vez de excluir.', 'warn', 4000);
  if (await confirm({ title: 'Excluir conta', msg: `Excluir "${esc(c.nome)}"?`, ok: 'Excluir', danger: true })) { await db.remove('contas', c.id); toast('Conta excluída'); }
}

function paintCategorias(body, C, E) {
  const cats = C.categorias.filter(c => match(c.nome + ' ' + (c.subgrupo || '') + ' ' + (c.codigo || ''))).sort((a, b) => (a.grupo - b.grupo) || (a.subgrupo || '').localeCompare(b.subgrupo || '') || (a.ordem - b.ordem));
  const uso = new Map(); for (const l of C.lancamentos) { uso.set(l.categoria_id, (uso.get(l.categoria_id) || 0) + 1); }
  let html = '';
  for (const g of GRUPOS) {
    const gc = cats.filter(c => Number(c.grupo) === g.id); if (!gc.length && q) continue;
    html += `<div class="cat-grp"><div class="cat-gh"><span class="gdot" style="background:${g.cor}"></span><b>${g.id}. ${g.nome}</b><span class="muted sm">${gc.length} categorias</span><button class="btn ghost xs" data-add-g="${g.id}">${icon('ti-plus')}</button></div>`;
    const subs = [...new Set(gc.map(c => c.subgrupo || 'Geral'))];
    for (const sg of subs) { html += `<div class="cat-sg">${esc(sg)}</div>` + gc.filter(c => (c.subgrupo || 'Geral') === sg).map(c => `<div class="row cat-r ${c.arquivada ? 'arch' : ''}" data-id="${c.id}">${catIcon(c, 32)}<div class="r-b"><div class="r-t">${esc(c.nome)}${c.arquivada ? '<span class="pill gray xs">arquivada</span>' : ''}</div><div class="r-s"><span class="mono">${esc(c.codigo || '')}</span><span>${c.tipo === 'in' ? 'Entrada' : 'Saída'}</span>${uso.get(c.id) ? `<span>${uso.get(c.id)} lançamentos</span>` : ''}</div></div><button class="ibtn" data-menu>${icon('ti-dots-vertical')}</button></div>`).join(''); }
    html += '</div>';
  }
  body.innerHTML = html;
  on(body, 'click', '[data-add-g]', (e, b) => abrirCategoria(null, { grupo: Number(b.dataset.addG) }));
  on(body, 'click', '[data-menu]', (e, b) => { e.stopPropagation(); const c = db.get('categorias', b.closest('[data-id]').dataset.id); menu(b, [{ label: 'Editar', icon: 'ti-pencil', onClick: () => abrirCategoria(c) }, { label: 'Ver lançamentos', icon: 'ti-list', onClick: () => location.hash = `#/relatorios?categoria=${c.id}` }, { label: c.arquivada ? 'Reativar' : 'Arquivar', icon: 'ti-archive', onClick: () => db.upsert('categorias', { ...c, arquivada: !c.arquivada }) }, '-', { label: 'Excluir', icon: 'ti-trash', danger: true, onClick: async () => { if (uso.get(c.id)) return toast('Categoria em uso. Arquive ou mova os lançamentos.', 'warn', 4000); if (await confirm({ title: 'Excluir categoria', msg: `Excluir "${esc(c.nome)}"?`, ok: 'Excluir', danger: true })) db.remove('categorias', c.id); } }]); });
  on(body, 'click', '.cat-r', (e, el) => { if (e.target.closest('button')) return; abrirCategoria(db.get('categorias', el.dataset.id)); });
}
const ICONES = ['ti-shopping-cart', 'ti-tool', 'ti-trending-up', 'ti-percentage', 'ti-flask', 'ti-package', 'ti-truck', 'ti-credit-card', 'ti-users', 'ti-user-star', 'ti-home', 'ti-bolt', 'ti-droplet', 'ti-wifi', 'ti-speakerphone', 'ti-ad', 'ti-printer', 'ti-video', 'ti-plane', 'ti-building-bank', 'ti-alert-triangle', 'ti-heart', 'ti-device-laptop', 'ti-cash-banknote', 'ti-chart-pie', 'ti-apps', 'ti-calculator', 'ti-microscope', 'ti-scale', 'ti-gift', 'ti-coins', 'ti-hammer', 'ti-tools', 'ti-paperclip', 'ti-file-percent', 'ti-building', 'ti-receipt-refund', 'ti-users-group', 'ti-arrows-exchange', 'ti-tag', 'ti-crane', 'ti-building-warehouse', 'ti-cash-off', 'ti-arrow-down-circle', 'ti-arrow-up-circle', 'ti-beach', 'ti-door-exit', 'ti-coin', 'ti-discount', 'ti-dots', 'ti-car', 'ti-phone', 'ti-book', 'ti-school', 'ti-shield', 'ti-briefcase', 'ti-world', 'ti-star'];
export function abrirCategoria(c = null, defaults = {}) {
  const E = app.empresaId; const isEdit = !!c; const C = app.ctx();
  const L = c ? { ...c } : { nome: '', tipo: defaults.grupo === 1 ? 'in' : 'out', grupo: 3, subgrupo: '', codigo: '', icone: 'ti-tag', cor: null, arquivada: false, ordem: C.categorias.length, ...defaults };
  const d = drawer({ title: isEdit ? 'Editar categoria' : 'Nova categoria', size: 'md' });
  const f = h('<form class="lform"></form>'); d.body.appendChild(f);
  const nome = h(`<input class="inp" value="${esc(L.nome)}" placeholder="Ex.: Tráfego pago" required>`);
  const tipo = segmented([{ id: 'out', label: 'Saída', icon: 'ti-arrow-up-right', cls: 'out' }, { id: 'in', label: 'Entrada', icon: 'ti-arrow-down-left', cls: 'in' }], L.tipo, v => L.tipo = v);
  const grupo = combobox({ options: GRUPOS.map(g => ({ id: String(g.id), label: `${g.id}. ${g.nome}` })), value: String(L.grupo), allowEmpty: false, onChange: v => { L.grupo = Number(v); sub.setOptions(subOpts()); } });
  const subOpts = () => [...new Set(C.categorias.filter(x => Number(x.grupo) === Number(L.grupo)).map(x => x.subgrupo).filter(Boolean))].map(s => ({ id: s, label: s }));
  const sub = combobox({ options: subOpts(), value: L.subgrupo || null, placeholder: 'Subgrupo (opcional)', allowCreate: async s => ({ id: s, label: s }), onChange: v => L.subgrupo = v });
  const codigo = h(`<input class="inp" value="${esc(L.codigo || '')}" placeholder="3.3.002">`);
  const icones = h(`<div class="icon-grid">${ICONES.map(i => `<button type="button" class="${i === L.icone ? 'on' : ''}" data-i="${i}">${icon(i)}</button>`).join('')}</div>`);
  icones.onclick = e => { const b = e.target.closest('button'); if (!b) return; L.icone = b.dataset.i; icones.querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b)); };
  const cor = h(`<input type="color" class="inp color" value="${L.cor || '#2F6BE0'}">`);
  const usarCor = toggle({ label: 'Usar cor personalizada', checked: !!L.cor });
  f.append(fieldEl('Nome', nome, { req: true }), fieldEl('Tipo', tipo), h('<div class="row2"></div>'));
  f.lastChild.append(fieldEl('Grupo do DRE', grupo), fieldEl('Subgrupo', sub));
  f.append(fieldEl('Código', codigo, { hint: 'Ordena o plano de contas e ajuda na exportação contábil.' }), fieldEl('Ícone', icones), h('<div class="row2"></div>'));
  f.lastChild.append(usarCor, fieldEl('Cor', cor));
  d.footer.innerHTML = ''; const bc = h('<button class="btn ghost">Cancelar</button>'); bc.onclick = () => d.close(); const ok = h(`<button class="btn primary">${icon('ti-check')}Salvar</button>`); d.footer.append(bc, ok);
  ok.onclick = async () => { if (!nome.value.trim()) return toast('Informe o nome', 'err'); await db.upsert('categorias', { ...L, empresa_id: E, nome: nome.value.trim(), tipo: L.tipo, grupo: Number(grupo.get()), subgrupo: sub.get() || '', codigo: codigo.value.trim(), icone: L.icone, cor: usarCor.get() ? cor.value : null }); toast('Categoria salva'); d.close(true); };
}

function paintContatos(body, C, E) {
  const list = C.contatos.filter(c => match(c.nome + ' ' + (c.documento || '') + ' ' + (c.email || ''))).sort((a, b) => (a.arquivado - b.arquivado) || a.nome.localeCompare(b.nome));
  const stats = new Map(); for (const l of C.lancamentos) { if (!l.contato_id || l.status === 'cancelado') continue; const s = stats.get(l.contato_id) || { n: 0, v: 0, aberto: 0 }; s.n++; s.v += l.valor; if (['aberto', 'parcial', 'atrasado'].includes(statusOf(l))) s.aberto += l.valor; stats.set(l.contato_id, s); }
  if (!list.length) return body.appendChild(emptyState({ icon: 'ti-users', title: 'Nenhum contato', action: { label: 'Novo contato', icon: 'ti-plus', onClick: () => abrirContato() } }));
  const tipoL = { cliente: 'Cliente', fornecedor: 'Fornecedor', ambos: 'Cliente e fornecedor', socio: 'Sócio', funcionario: 'Funcionário' };
  body.innerHTML = `<div class="listwrap">${list.map(c => { const s = stats.get(c.id); return `<div class="row ct-r ${c.arquivado ? 'arch' : ''}" data-id="${c.id}">${avatar(c.nome, 36)}<div class="r-b"><div class="r-t">${esc(c.nome)}</div><div class="r-s"><span>${tipoL[c.tipo] || ''}</span>${c.documento ? `<span class="mono">${fmtDoc(c.documento)}</span>` : ''}${c.email ? `<span>${esc(c.email)}</span>` : ''}${c.pix ? `<span>${icon('ti-bolt')} ${esc(c.pix)}</span>` : ''}</div></div>${s ? `<div class="r-v"><span>${money(s.v)}</span><small>${s.n} lanç.${s.aberto ? ` · ${money(s.aberto)} aberto` : ''}</small></div>` : ''}<button class="ibtn" data-menu>${icon('ti-dots-vertical')}</button></div>`; }).join('')}</div>`;
  on(body, 'click', '[data-menu]', (e, b) => { e.stopPropagation(); const c = db.get('contatos', b.closest('[data-id]').dataset.id); menu(b, [{ label: 'Editar', icon: 'ti-pencil', onClick: () => abrirContato(c) }, { label: 'Ver lançamentos', icon: 'ti-list', onClick: () => { location.hash = `#/relatorios`; } }, { label: c.arquivado ? 'Reativar' : 'Arquivar', icon: 'ti-archive', onClick: () => db.upsert('contatos', { ...c, arquivado: !c.arquivado }) }, '-', { label: 'Excluir', icon: 'ti-trash', danger: true, onClick: async () => { if (stats.get(c.id)) return toast('Contato com lançamentos. Arquive.', 'warn'); if (await confirm({ title: 'Excluir contato', msg: `Excluir "${esc(c.nome)}"?`, ok: 'Excluir', danger: true })) db.remove('contatos', c.id); } }]); });
  on(body, 'click', '.ct-r', (e, el) => { if (e.target.closest('button')) return; abrirContato(db.get('contatos', el.dataset.id)); });
}
export function abrirContato(c = null) {
  const E = app.empresaId; const isEdit = !!c;
  const L = c ? { ...c } : { nome: '', tipo: 'fornecedor', documento: '', email: '', telefone: '', pix: '', cidade: '', uf: '', observacoes: '', arquivado: false };
  const d = drawer({ title: isEdit ? 'Editar contato' : 'Novo contato', size: 'md' });
  const f = h('<form class="lform"></form>'); d.body.appendChild(f);
  const nome = h(`<input class="inp" value="${esc(L.nome)}" placeholder="Nome ou razão social" required>`);
  const tipo = combobox({ options: [['fornecedor', 'Fornecedor'], ['cliente', 'Cliente'], ['ambos', 'Cliente e fornecedor'], ['socio', 'Sócio'], ['funcionario', 'Funcionário']].map(([id, label]) => ({ id, label })), value: L.tipo, allowEmpty: false });
  const doc = h(`<input class="inp" value="${esc(L.documento || '')}" placeholder="CNPJ ou CPF" inputmode="numeric">`);
  const bBusca = h(`<button type="button" class="btn ghost sm">${icon('ti-search')}Buscar CNPJ</button>`);
  bBusca.onclick = async () => { const n = doc.value.replace(/\D/g, ''); if (n.length !== 14) return toast('Digite um CNPJ com 14 dígitos', 'warn'); bBusca.disabled = true; try { const r = await fetch('https://brasilapi.com.br/api/cnpj/v1/' + n); if (!r.ok) throw new Error('não encontrado'); const j = await r.json(); if (!nome.value) nome.value = j.nome_fantasia || j.razao_social; if (!email.value && j.email) email.value = j.email.toLowerCase(); if (!tel.value && j.ddd_telefone_1) tel.value = j.ddd_telefone_1; cidade.value = j.municipio || ''; uf.value = j.uf || ''; toast('Dados preenchidos pela Receita'); } catch (e) { toast('CNPJ não encontrado', 'err'); } bBusca.disabled = false; };
  const email = h(`<input class="inp" type="email" value="${esc(L.email || '')}">`), tel = h(`<input class="inp" value="${esc(L.telefone || '')}" placeholder="(13) 99999-9999">`), pix = h(`<input class="inp" value="${esc(L.pix || '')}" placeholder="Chave PIX">`);
  const cidade = h(`<input class="inp" value="${esc(L.cidade || '')}">`), uf = h(`<input class="inp" value="${esc(L.uf || '')}" maxlength="2">`);
  const obs = h(`<textarea class="inp" rows="3">${esc(L.observacoes || '')}</textarea>`);
  f.append(fieldEl('Nome', nome, { req: true }), h('<div class="row2"></div>')); f.lastChild.append(fieldEl('Tipo', tipo), (() => { const fd = fieldEl('CNPJ / CPF', doc); fd.appendChild(bBusca); return fd; })());
  f.append(h('<div class="row2"></div>')); f.lastChild.append(fieldEl('E-mail', email), fieldEl('Telefone / WhatsApp', tel));
  f.append(fieldEl('Chave PIX', pix), h('<div class="row2"></div>')); f.lastChild.append(fieldEl('Cidade', cidade), fieldEl('UF', uf));
  f.append(fieldEl('Observações', obs));
  d.footer.innerHTML = ''; const bc = h('<button class="btn ghost">Cancelar</button>'); bc.onclick = () => d.close(); const ok = h(`<button class="btn primary">${icon('ti-check')}Salvar</button>`); d.footer.append(bc, ok);
  ok.onclick = async () => { if (!nome.value.trim()) return toast('Informe o nome', 'err'); await db.upsert('contatos', { ...L, empresa_id: E, nome: nome.value.trim(), tipo: tipo.get(), documento: doc.value.replace(/\D/g, ''), email: email.value.trim(), telefone: tel.value.trim(), pix: pix.value.trim(), cidade: cidade.value.trim(), uf: uf.value.trim().toUpperCase(), observacoes: obs.value.trim() }); toast('Contato salvo'); d.close(true); };
}

function paintCentros(body, C, E) {
  const list = C.centros.filter(c => match(c.nome));
  const uso = new Map(); for (const l of C.lancamentos) for (const r of l.rateio_centros || []) { const u = uso.get(r.centro_id) || { n: 0, v: 0 }; u.n++; u.v += l.valor * r.percent / 100; uso.set(r.centro_id, u); }
  if (!list.length) return body.appendChild(emptyState({ icon: 'ti-target', title: 'Nenhum centro de custo', text: 'Use centros de custo para separar unidades, projetos ou países (ex.: Brasil / Estados Unidos).', action: { label: 'Novo centro', icon: 'ti-plus', onClick: () => abrirCentro() } }));
  body.innerHTML = `<div class="listwrap">${list.map(c => `<div class="row ${c.arquivado ? 'arch' : ''}" data-id="${c.id}"><span class="cicon" style="--s:36px;--c:${c.cor || '#5B667E'}">${icon('ti-target')}</span><div class="r-b"><div class="r-t">${esc(c.nome)}</div><div class="r-s">${uso.get(c.id) ? `${uso.get(c.id).n} lançamentos · ${money(uso.get(c.id).v)}` : 'Sem uso'}</div></div><button class="ibtn" data-menu>${icon('ti-dots-vertical')}</button></div>`).join('')}</div>`;
  on(body, 'click', '[data-menu]', (e, b) => { e.stopPropagation(); const c = db.get('centros', b.closest('[data-id]').dataset.id); menu(b, [{ label: 'Editar', icon: 'ti-pencil', onClick: () => abrirCentro(c) }, { label: c.arquivado ? 'Reativar' : 'Arquivar', icon: 'ti-archive', onClick: () => db.upsert('centros', { ...c, arquivado: !c.arquivado }) }, '-', { label: 'Excluir', icon: 'ti-trash', danger: true, onClick: async () => { if (uso.get(c.id)) return toast('Centro em uso. Arquive.', 'warn'); if (await confirm({ title: 'Excluir', msg: `Excluir "${esc(c.nome)}"?`, ok: 'Excluir', danger: true })) db.remove('centros', c.id); } }]); });
  on(body, 'click', '.row', (e, el) => { if (e.target.closest('button')) return; abrirCentro(db.get('centros', el.dataset.id)); });
}
export function abrirCentro(c = null) {
  const E = app.empresaId; const L = c ? { ...c } : { nome: '', cor: '#07388E', arquivado: false };
  const m = modal({ title: c ? 'Editar centro de custo' : 'Novo centro de custo', size: 'sm', body: `<div class="row2"><label class="fld"><span class="fl">Nome</span><input class="inp" value="${esc(L.nome)}" placeholder="Ex.: Estados Unidos" data-n></label><label class="fld"><span class="fl">Cor</span><input type="color" class="inp color" value="${L.cor || '#07388E'}" data-c></label></div>`, footer: `<button class="btn ghost" data-x>Cancelar</button><button class="btn primary" data-ok>Salvar</button>` });
  m.footer.querySelector('[data-x]').onclick = () => m.close(); m.footer.querySelector('[data-ok]').onclick = async () => { const nome = m.body.querySelector('[data-n]').value.trim(); if (!nome) return toast('Informe o nome', 'err'); await db.upsert('centros', { ...L, empresa_id: E, nome, cor: m.body.querySelector('[data-c]').value }); m.close(); toast('Salvo'); };
}
function paintTags(body, C, E) {
  const list = C.tags.filter(t => match(t.nome)); const uso = new Map(); for (const l of C.lancamentos) for (const t of l.tags || []) uso.set(t, (uso.get(t) || 0) + 1);
  if (!list.length) return body.appendChild(emptyState({ icon: 'ti-tag', title: 'Nenhuma tag', text: 'Tags marcam lançamentos livremente: "Urgente", "USA", "Revisar"…', action: { label: 'Nova tag', icon: 'ti-plus', onClick: () => abrirTag() } }));
  body.innerHTML = `<div class="listwrap">${list.map(t => `<div class="row" data-id="${t.id}"><span class="tagchip lg" style="--c:${t.cor}">${esc(t.nome)}</span><div class="r-b"><div class="r-s">${uso.get(t.nome) || 0} lançamentos</div></div><button class="ibtn" data-menu>${icon('ti-dots-vertical')}</button></div>`).join('')}</div>`;
  on(body, 'click', '[data-menu]', (e, b) => { e.stopPropagation(); const t = db.get('tags', b.closest('[data-id]').dataset.id); menu(b, [{ label: 'Editar', icon: 'ti-pencil', onClick: () => abrirTag(t) }, { label: 'Excluir', icon: 'ti-trash', danger: true, onClick: async () => { if (await confirm({ title: 'Excluir tag', msg: 'A tag some dos lançamentos que a usam.', ok: 'Excluir', danger: true })) { await db.remove('tags', t.id); const ls = C.lancamentos.filter(l => (l.tags || []).includes(t.nome)); if (ls.length) await db.upsert('lancamentos', ls.map(l => ({ ...l, tags: l.tags.filter(x => x !== t.nome) }))); } } }]); });
}
export function abrirTag(t = null) {
  const E = app.empresaId; const L = t ? { ...t } : { nome: '', cor: '#2F6BE0' };
  const m = modal({ title: t ? 'Editar tag' : 'Nova tag', size: 'sm', body: `<div class="row2"><label class="fld"><span class="fl">Nome</span><input class="inp" value="${esc(L.nome)}" data-n></label><label class="fld"><span class="fl">Cor</span><input type="color" class="inp color" value="${L.cor}" data-c></label></div>`, footer: `<button class="btn ghost" data-x>Cancelar</button><button class="btn primary" data-ok>Salvar</button>` });
  m.footer.querySelector('[data-x]').onclick = () => m.close(); m.footer.querySelector('[data-ok]').onclick = async () => { const nome = m.body.querySelector('[data-n]').value.trim(); if (!nome) return toast('Informe o nome', 'err'); const old = L.nome; await db.upsert('tags', { ...L, empresa_id: E, nome, cor: m.body.querySelector('[data-c]').value }); if (t && old !== nome) { const ls = db.of('lancamentos', E).filter(l => (l.tags || []).includes(old)); if (ls.length) await db.upsert('lancamentos', ls.map(l => ({ ...l, tags: l.tags.map(x => x === old ? nome : x) }))); } m.close(); toast('Salvo'); };
}
