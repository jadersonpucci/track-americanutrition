// Configurações: empresas, dados (backup / importação / exemplos), conexão Supabase, integrações, aparência.
import { app } from '../app.js';
import { db, prefs, TABLES } from '../db.js';
import { h, icon, modal, drawer, field, fieldEl, toggle, segmented, toast, confirm, on, copy, combobox, avatar } from '../ui.js';
import { esc, uid, download, readFile, today, fmtDateTime, parseMoney, norm, monthStart } from '../utils.js';
import { seedCadastros, seedLancamentos, seedEmpresa } from '../seed.js';
import { CONFIG } from '../config.js';

const SECS = [{ id: 'empresa', label: 'Empresas', icon: 'ti-building' }, { id: 'dados', label: 'Dados e backup', icon: 'ti-database' }, { id: 'conexao', label: 'Conexão', icon: 'ti-cloud' }, { id: 'integracoes', label: 'Integrações', icon: 'ti-plug' }, { id: 'aparencia', label: 'Aparência', icon: 'ti-palette' }, { id: 'atalhos', label: 'Atalhos', icon: 'ti-keyboard' }];
let sec = 'empresa';
export function render(root, { sub = null } = {}) {
  if (sub && SECS.some(s => s.id === sub)) sec = sub;
  root.innerHTML = `<div class="page cfg"><header class="ph"><div><h1>Configurações</h1></div></header>
    <div class="cfg-wrap"><nav class="cfg-nav">${SECS.map(s => `<a href="#/config/${s.id}" class="${sec === s.id ? 'on' : ''}">${icon(s.icon)}${s.label}</a>`).join('')}</nav><div class="cfg-body" data-body></div></div></div>`;
  const body = root.querySelector('[data-body]');
  ({ empresa: secEmpresa, dados: secDados, conexao: secConexao, integracoes: secIntegracoes, aparencia: secAparencia, atalhos: secAtalhos })[sec](body);
}

function secEmpresa(body) {
  const emps = db.all('empresas');
  body.innerHTML = `<div class="card"><div class="card-h"><h3>Empresas</h3><button class="btn secondary sm" data-nova>${icon('ti-plus')}Nova empresa</button></div><p class="muted sm">Cada empresa tem contas, categorias, contatos e lançamentos próprios. Troque de empresa pelo seletor no topo.</p>
    <div class="listwrap">${emps.map(e => `<div class="row ${e.id === app.empresaId ? 'sel' : ''}" data-id="${e.id}">${avatar(e.nome, 36, e.cor)}<div class="r-b"><div class="r-t">${esc(e.nome)}${e.id === app.empresaId ? '<span class="pill blue xs">ativa</span>' : ''}</div><div class="r-s">${e.cnpj ? `<span class="mono">${esc(e.cnpj)}</span>` : ''}<span>${db.of('lancamentos', e.id).length} lançamentos</span></div></div><div class="r-a">${e.id !== app.empresaId ? `<button class="btn ghost xs" data-ativar="${e.id}">Usar</button>` : ''}<button class="btn ghost xs" data-edit="${e.id}">${icon('ti-pencil')}</button><button class="btn ghost xs danger-t" data-del="${e.id}">${icon('ti-trash')}</button></div></div>`).join('')}</div></div>`;
  body.querySelector('[data-nova]').onclick = () => editarEmpresa(null);
  on(body, 'click', '[data-edit]', (e, b) => editarEmpresa(db.get('empresas', b.dataset.edit)));
  on(body, 'click', '[data-ativar]', (e, b) => app.setEmpresa(b.dataset.ativar));
  on(body, 'click', '[data-del]', async (e, b) => { const emp = db.get('empresas', b.dataset.del); if (emps.length === 1) return toast('Precisa existir ao menos uma empresa', 'warn'); if (!await confirm({ title: `Excluir ${emp.nome}`, msg: 'Apaga TODOS os dados desta empresa: contas, lançamentos, contatos. Não tem volta.', ok: 'Excluir tudo', danger: true })) return; for (const t of TABLES) { if (t === 'empresas') continue; const ids = db.all(t).filter(r => r.empresa_id === emp.id).map(r => r.id); if (ids.length) await db.remove(t, ids); } await db.remove('empresas', emp.id); if (app.empresaId === emp.id) app.setEmpresa(db.all('empresas')[0].id); toast('Empresa excluída'); });
}
export function editarEmpresa(e) {
  const L = e ? { ...e } : { nome: '', cnpj: '', cor: '#07388E' };
  const m = modal({ title: e ? 'Editar empresa' : 'Nova empresa', size: 'sm', body: `<label class="fld"><span class="fl">Nome</span><input class="inp" value="${esc(L.nome)}" data-n placeholder="Ex.: Abbazion"></label><div class="row2"><label class="fld"><span class="fl">CNPJ</span><input class="inp" value="${esc(L.cnpj || '')}" data-c></label><label class="fld"><span class="fl">Cor</span><input type="color" class="inp color" value="${L.cor || '#07388E'}" data-cor></label></div>${e ? '' : `<label class="tgl"><input type="checkbox" checked data-seed><span class="tgl-k"></span><span class="tgl-l">Criar plano de contas padrão e contas iniciais</span></label>`}`, footer: `<button class="btn ghost" data-x>Cancelar</button><button class="btn primary" data-ok>Salvar</button>` });
  m.footer.querySelector('[data-x]').onclick = () => m.close();
  m.footer.querySelector('[data-ok]').onclick = async () => { const nome = m.body.querySelector('[data-n]').value.trim(); if (!nome) return toast('Informe o nome', 'err'); const row = { ...L, id: L.id || uid(), nome, cnpj: m.body.querySelector('[data-c]').value.trim(), cor: m.body.querySelector('[data-cor]').value, criado_em: L.criado_em || new Date().toISOString() }; await db.upsert('empresas', row); if (!e && m.body.querySelector('[data-seed]')?.checked) { const s = seedCadastros(row.id); await db.upsert('categorias', s.categorias); await db.upsert('contas', s.contas.slice(0, 1).map(c => ({ ...c, nome: 'Conta principal', saldo_inicial: 0 }))); await db.upsert('tags', s.tags); } m.close(); if (!e) app.setEmpresa(row.id); toast('Empresa salva'); };
}

function secDados(body) {
  const E = app.empresaId; const nEx = db.of('lancamentos', E).filter(l => l.exemplo).length;
  body.innerHTML = `
  <div class="card"><div class="card-h"><h3>Backup</h3></div><p class="muted sm">O backup é um arquivo JSON com todas as empresas e dados. Guarde no iCloud Drive ou Google Drive. Recomendado: exporte toda semana enquanto usar o modo local.</p><div class="btns"><button class="btn secondary" data-export>${icon('ti-download')}Exportar backup</button><label class="btn ghost">${icon('ti-upload')}Restaurar backup<input type="file" hidden accept=".json" data-import></label></div><p class="muted xs">${prefs.get('lastBackup') ? 'Último backup exportado em ' + fmtDateTime(prefs.get('lastBackup')) : 'Nenhum backup exportado ainda.'}</p></div>
  <div class="card"><div class="card-h"><h3>Importar do Nibo</h3></div><p class="muted sm">Migre contas, categorias, contatos e lançamentos (pagos e em aberto). Rode o script <code>scripts/importar-nibo.py</code> no Mac com o token da API do Nibo: ele gera um arquivo JSON já no formato deste sistema. Depois importe aqui.</p><pre class="code">python3 scripts/importar-nibo.py --token SEU_APITOKEN --saida nibo.json</pre><div class="btns"><label class="btn secondary">${icon('ti-file-import')}Importar arquivo do Nibo<input type="file" hidden accept=".json" data-nibo></label></div></div>
  <div class="card"><div class="card-h"><h3>Importar lançamentos por CSV</h3></div><p class="muted sm">Colunas aceitas: <b>data, descricao, valor, tipo</b> (pagar/receber), <i>categoria, contato, conta, pago_em, competencia, referencia</i>. Categorias, contatos e contas são casados pelo nome e criados quando não existem.</p><div class="btns"><label class="btn secondary">${icon('ti-file-spreadsheet')}Importar CSV<input type="file" hidden accept=".csv,.txt" data-csv></label><button class="btn ghost" data-modelo>${icon('ti-download')}Baixar modelo</button></div></div>
  <div class="card ${nEx ? 'warn-card' : ''}"><div class="card-h"><h3>Dados de exemplo</h3></div><p class="muted sm">${nEx ? `Há <b>${nEx}</b> lançamentos de exemplo nesta empresa (criados no primeiro acesso para você conhecer o sistema). Quando for usar de verdade, remova.` : 'Nenhum lançamento de exemplo nesta empresa.'}</p><div class="btns">${nEx ? `<button class="btn danger" data-limpar-ex>${icon('ti-trash')}Remover lançamentos de exemplo</button>` : `<button class="btn ghost" data-gerar-ex>${icon('ti-sparkles')}Gerar lançamentos de exemplo</button>`}</div></div>
  <div class="card danger-card"><div class="card-h"><h3>Zona de perigo</h3></div><div class="btns"><button class="btn ghost danger-t" data-limpar-lanc>${icon('ti-eraser')}Apagar todos os lançamentos desta empresa</button><button class="btn ghost danger-t" data-reset>${icon('ti-bomb')}Apagar tudo e recomeçar</button></div></div>`;
  body.querySelector('[data-export]').onclick = () => { download(`financeiro-backup-${today()}.json`, JSON.stringify(db.export(), null, 1), 'application/json'); prefs.set('lastBackup', new Date().toISOString()); toast('Backup exportado'); };
  body.querySelector('[data-import]').onchange = async e => { const f = e.target.files[0]; if (!f) return; try { const j = JSON.parse(await readFile(f)); if (!j.empresas) throw new Error('Arquivo inválido'); if (!await confirm({ title: 'Restaurar backup', msg: `O backup tem ${j.empresas.length} empresa(s) e ${(j.lancamentos || []).length} lançamentos. Isso SUBSTITUI os dados atuais. Continuar?`, ok: 'Restaurar', danger: true })) return; await db.replaceAll(j); app.setEmpresa(db.all('empresas')[0]?.id); toast('Backup restaurado'); } catch (err) { toast(err.message, 'err'); } };
  body.querySelector('[data-nibo]').onchange = async e => { const f = e.target.files[0]; if (!f) return; try { const j = JSON.parse(await readFile(f)); await importarNibo(j); } catch (err) { toast(err.message, 'err', 5000); } };
  body.querySelector('[data-csv]').onchange = async e => { const f = e.target.files[0]; if (!f) return; try { await importarCSV(await readFile(f)); } catch (err) { toast(err.message, 'err', 5000); } };
  body.querySelector('[data-modelo]').onclick = () => download('modelo-lancamentos.csv', '﻿data;descricao;valor;tipo;categoria;contato;conta;pago_em;competencia;referencia\n2026-09-05;Meta Ads · setembro;1250,00;pagar;Tráfego pago;Meta Ads;Clara · Cartão;2026-09-05;2026-09;\n2026-09-10;Repasse Mercado Livre;3400,50;receber;Vendas;Mercado Livre;BTG;;2026-09;\n');
  body.querySelector('[data-limpar-ex]')?.addEventListener('click', async () => { if (!await confirm({ title: 'Remover exemplos', msg: `Remove os ${nEx} lançamentos de exemplo. Contas, categorias e contatos ficam.`, ok: 'Remover', danger: true })) return; const ids = db.of('lancamentos', E).filter(l => l.exemplo).map(l => l.id); await db.remove('lancamentos', ids); toast('Exemplos removidos'); });
  body.querySelector('[data-gerar-ex]')?.addEventListener('click', async () => { const C = app.ctx(); if (!C.contas.length || !C.categorias.length) return toast('Precisa ter contas e categorias cadastradas', 'warn'); await db.upsert('lancamentos', seedLancamentos(E, { contas: C.contas, categorias: C.categorias, contatos: C.contatos, centros: C.centros })); toast('Exemplos gerados'); });
  body.querySelector('[data-limpar-lanc]').onclick = async () => { if (!await confirm({ title: 'Apagar lançamentos', msg: 'Apaga todos os lançamentos e itens de extrato desta empresa. Cadastros ficam. Sem volta.', ok: 'Apagar', danger: true })) return; await db.remove('lancamentos', db.of('lancamentos', E).map(l => l.id)); await db.remove('extrato_itens', db.of('extrato_itens', E).map(l => l.id)); toast('Lançamentos apagados'); };
  body.querySelector('[data-reset]').onclick = async () => { if (!await confirm({ title: 'Apagar tudo', msg: 'Apaga todas as empresas e dados deste navegador e volta ao início. Exporte um backup antes!', ok: 'Apagar tudo', danger: true })) return; try { await db.backend.wipe(); for (const k of Object.keys(localStorage)) if (k.startsWith('fin:v1:pref:') && !k.includes('backend')) localStorage.removeItem(k); location.reload(); } catch (e) { toast(e.message, 'err'); } };
}

// importa o JSON gerado por scripts/importar-nibo.py (formato: {empresa, contas, categorias, centros, contatos, lancamentos})
export async function importarNibo(j) {
  const E = app.empresaId; const C = app.ctx();
  const n = { contas: 0, categorias: 0, contatos: 0, centros: 0, lancamentos: 0 };
  const mapConta = new Map(), mapCat = new Map(), mapCt = new Map(), mapCC = new Map();
  const byName = (arr, nome) => arr.find(x => norm(x.nome) === norm(nome));
  const contas = [], cats = [], cts = [], ccs = [];
  for (const c of j.contas || []) { const ex = byName(C.contas, c.nome); if (ex) { mapConta.set(c.nibo_id, ex.id); continue; } const row = { id: uid(), empresa_id: E, nome: c.nome, banco: c.banco || 'outro', tipo: c.tipo || 'corrente', agencia: c.agencia || '', numero: c.numero || '', saldo_inicial: Number(c.saldo_inicial) || 0, data_saldo_inicial: c.data_saldo_inicial || today(), arquivada: !!c.arquivada, ordem: C.contas.length + contas.length + 1, nibo_id: c.nibo_id }; contas.push(row); mapConta.set(c.nibo_id, row.id); n.contas++; }
  for (const c of j.categorias || []) { const ex = byName(C.categorias.filter(x => x.tipo === c.tipo), c.nome) || byName(C.categorias, c.nome); if (ex) { mapCat.set(c.nibo_id, ex.id); continue; } const row = { id: uid(), empresa_id: E, nome: c.nome, tipo: c.tipo, grupo: Number(c.grupo) || (c.tipo === 'in' ? 1 : 3), subgrupo: c.subgrupo || '', codigo: c.codigo || '', icone: c.tipo === 'in' ? 'ti-arrow-down-left' : 'ti-tag', arquivada: false, ordem: C.categorias.length + cats.length, nibo_id: c.nibo_id }; cats.push(row); mapCat.set(c.nibo_id, row.id); n.categorias++; }
  for (const c of j.contatos || []) { const ex = byName(C.contatos, c.nome); if (ex) { mapCt.set(c.nibo_id, ex.id); continue; } const row = { id: uid(), empresa_id: E, nome: c.nome, tipo: c.tipo || 'fornecedor', documento: c.documento || '', email: c.email || '', telefone: c.telefone || '', pix: '', cidade: c.cidade || '', uf: c.uf || '', observacoes: '', arquivado: !!c.arquivado, nibo_id: c.nibo_id }; cts.push(row); mapCt.set(c.nibo_id, row.id); n.contatos++; }
  for (const c of j.centros || []) { const ex = byName(C.centros, c.nome); if (ex) { mapCC.set(c.nibo_id, ex.id); continue; } const row = { id: uid(), empresa_id: E, nome: c.nome, cor: '#B26A00', arquivado: false, nibo_id: c.nibo_id }; ccs.push(row); mapCC.set(c.nibo_id, row.id); n.centros++; }
  if (contas.length) await db.upsert('contas', contas); if (cats.length) await db.upsert('categorias', cats); if (cts.length) await db.upsert('contatos', cts); if (ccs.length) await db.upsert('centros', ccs);
  const existentes = new Set(C.lancamentos.map(l => l.origem_ref).filter(Boolean));
  const contaPadrao = (db.of('contas', E).find(c => !c.arquivada) || {}).id;
  const rows = [];
  for (const l of j.lancamentos || []) {
    if (existentes.has(l.nibo_id)) continue;
    const row = { id: uid(), empresa_id: E, tipo: l.tipo, descricao: l.descricao || '(sem descrição)', valor: Number(l.valor) || 0, vencimento: l.vencimento, competencia: l.competencia || monthStart(l.vencimento), categoria_id: mapCat.get(l.categoria_nibo_id) || null, contato_id: mapCt.get(l.contato_nibo_id) || null, conta_id: mapConta.get(l.conta_nibo_id) || contaPadrao, forma_pagamento: 'outro', status: 'aberto', tags: [], anexos: [], observacoes: l.observacoes || '', referencia: l.referencia || '', rateio_categorias: (l.rateio_categorias || []).map(r => ({ categoria_id: mapCat.get(r.categoria_nibo_id) || null, valor: Number(r.valor) || 0, descricao: r.descricao || '' })).filter(r => r.categoria_id), rateio_centros: (l.rateio_centros || []).map(r => ({ centro_id: mapCC.get(r.centro_nibo_id), percent: Number(r.percent) || 100 })).filter(r => r.centro_id), parcela_num: l.parcela_num || null, parcela_total: l.parcela_total || null, grupo_parcelas_id: l.grupo_parcelas_id || null, baixas: (l.baixas || []).map(b => ({ id: uid(), data: b.data, valor: Number(b.valor) || 0, conta_id: mapConta.get(b.conta_nibo_id) || mapConta.get(l.conta_nibo_id) || contaPadrao, juros: 0, multa: 0, desconto: 0 })), origem: 'nibo', origem_ref: l.nibo_id, criado_em: l.criado_em || new Date().toISOString() };
    if (row.rateio_categorias.length === 1) row.rateio_categorias = [];
    if (!row.categoria_id && row.rateio_categorias.length) row.categoria_id = row.rateio_categorias[0].categoria_id;
    rows.push(row); n.lancamentos++;
  }
  for (let i = 0; i < rows.length; i += 500) await db.upsert('lancamentos', rows.slice(i, i + 500));
  toast(`Importado do Nibo: ${n.lancamentos} lançamentos, ${n.contas} contas, ${n.categorias} categorias, ${n.contatos} contatos`, 'ok', 6000);
}

async function importarCSV(text) {
  const E = app.empresaId; const C = app.ctx();
  const lines = text.replace(/\r/g, '').split('\n').filter(l => l.trim()); if (lines.length < 2) throw new Error('CSV vazio');
  const sep = (lines[0].match(/;/g) || []).length >= (lines[0].match(/,/g) || []).length ? ';' : ',';
  const split = l => { const out = []; let cur = '', q = false; for (const c of l) { if (c === '"') q = !q; else if (c === sep && !q) { out.push(cur); cur = ''; } else cur += c; } out.push(cur); return out.map(s => s.trim()); };
  const head = split(lines[0]).map(norm); const col = (...names) => head.findIndex(h => names.includes(h));
  const iD = col('data', 'vencimento'), iDesc = col('descricao', 'descrição', 'historico'), iV = col('valor'), iT = col('tipo'), iCat = col('categoria'), iCt = col('contato', 'fornecedor', 'cliente'), iC = col('conta'), iP = col('pago_em', 'pagamento'), iComp = col('competencia', 'competência'), iRef = col('referencia', 'referência');
  if (iD < 0 || iDesc < 0 || iV < 0) throw new Error('O CSV precisa das colunas data, descricao e valor');
  const novos = { cats: [], cts: [], contas: [] }; const rows = [];
  const dt = s => { const m = /^(\d{2})[\/-](\d{2})[\/-](\d{4})/.exec(s); return m ? `${m[3]}-${m[2]}-${m[1]}` : s.slice(0, 10); };
  const find = (arr, nome, mk) => { if (!nome) return null; let x = arr.find(a => norm(a.nome) === norm(nome)); if (!x) { x = mk(nome); arr.push(x); } return x; };
  for (const line of lines.slice(1)) {
    const c = split(line); if (!c[iD]) continue; let valor = parseMoney(c[iV]); if (!valor) continue;
    let tipo = iT >= 0 ? norm(c[iT]) : (valor < 0 ? 'pagar' : 'receber'); tipo = /rec|entrada|in/.test(tipo) ? 'receber' : 'pagar'; valor = Math.abs(valor);
    const cat = iCat >= 0 ? find(C.categorias, c[iCat], nome => { const r = { id: uid(), empresa_id: E, nome, tipo: tipo === 'receber' ? 'in' : 'out', grupo: tipo === 'receber' ? 1 : 3, subgrupo: 'Importadas', codigo: '', icone: 'ti-tag', arquivada: false, ordem: 999 }; novos.cats.push(r); return r; }) : null;
    const ct = iCt >= 0 ? find(C.contatos, c[iCt], nome => { const r = { id: uid(), empresa_id: E, nome, tipo: tipo === 'receber' ? 'cliente' : 'fornecedor', documento: '', email: '', telefone: '', pix: '', cidade: '', uf: '', observacoes: '', arquivado: false }; novos.cts.push(r); return r; }) : null;
    const conta = (iC >= 0 ? find(C.contas, c[iC], nome => { const r = { id: uid(), empresa_id: E, nome, banco: 'outro', tipo: 'corrente', agencia: '', numero: '', saldo_inicial: 0, data_saldo_inicial: today(), arquivada: false, ordem: 99 }; novos.contas.push(r); return r; }) : null) || C.contas.find(x => !x.arquivada);
    const venc = dt(c[iD]); const pago = iP >= 0 && c[iP] ? dt(c[iP]) : null;
    rows.push({ id: uid(), empresa_id: E, tipo, descricao: c[iDesc], valor, vencimento: venc, competencia: iComp >= 0 && c[iComp] ? c[iComp].slice(0, 7) + '-01' : monthStart(venc), categoria_id: cat?.id || null, contato_id: ct?.id || null, conta_id: conta?.id || null, forma_pagamento: 'outro', status: 'aberto', tags: [], anexos: [], observacoes: '', referencia: iRef >= 0 ? c[iRef] : '', rateio_categorias: [], rateio_centros: [], baixas: pago ? [{ id: uid(), data: pago, valor, conta_id: conta?.id, juros: 0, multa: 0, desconto: 0 }] : [], origem: 'importacao', criado_em: new Date().toISOString() });
  }
  if (novos.cats.length) await db.upsert('categorias', novos.cats); if (novos.cts.length) await db.upsert('contatos', novos.cts); if (novos.contas.length) await db.upsert('contas', novos.contas);
  for (let i = 0; i < rows.length; i += 500) await db.upsert('lancamentos', rows.slice(i, i + 500));
  toast(`${rows.length} lançamentos importados`, 'ok', 5000);
}

function secConexao(body) {
  const cfg = prefs.get('backend') || (CONFIG.gateway ? { type: 'gateway' } : { type: 'local' }); const isGw = db.backend.name === 'supabase'; const user = isGw ? db.backend.user : null;
  body.innerHTML = `<div class="card"><div class="card-h"><h3>Onde os dados ficam</h3>${isGw ? '<span class="pill green">Conectado ao servidor</span>' : '<span class="pill gray">Modo local</span>'}</div>
    <div class="modes"><label class="mode ${cfg.type === 'gateway' ? 'on' : ''}"><input type="radio" name="mode" value="gateway" ${cfg.type === 'gateway' ? 'checked' : ''}><div>${icon('ti-cloud-check')}<b>${esc(CONFIG.nomeServidor || 'Servidor')} (recomendado)</b><p>Banco Supabase da America Nutrition via n8n. Multiusuário, acessível do Mac e do iPhone, com integrações automáticas.</p></div></label><label class="mode ${cfg.type !== 'gateway' ? 'on' : ''}"><input type="radio" name="mode" value="local" ${cfg.type !== 'gateway' ? 'checked' : ''}><div>${icon('ti-device-laptop')}<b>Neste navegador</b><p>Sem servidor. Os dados ficam só neste aparelho: faça backup.</p></div></label></div>
    ${isGw ? `<div class="sb-user">${user ? `${avatar(user.nome || user.email, 28)}<span>Logado como <b>${esc(user.nome || '')}</b> ${esc(user.email)}</span><button class="btn ghost xs" data-logout>Sair</button>` : '<span class="muted">Não autenticado.</span>'}</div>` : ''}
    <div class="btns"><button class="btn primary" data-save>${icon('ti-check')}Salvar</button>${isGw ? `<button class="btn ghost" data-migrar>${icon('ti-cloud-upload')}Enviar dados locais deste navegador pro servidor</button>` : ''}</div>${db.loadError ? `<div class="alert red">${icon('ti-alert-circle')}Erro ao carregar: ${esc(db.loadError.message)}</div>` : ''}
    <p class="muted xs">Usuários são criados no banco com <code>select fin_criar_usuario('email', 'Nome', 'senha')</code> (workflow "Financeiro · Setup" no n8n ou SQL Editor do Supabase).</p></div>`;
  body.querySelectorAll('input[name=mode]').forEach(r => r.onchange = () => body.querySelectorAll('.mode').forEach(m => m.classList.toggle('on', m.querySelector('input').checked)));
  body.querySelector('[data-save]').onclick = () => { const mode = body.querySelector('input[name=mode]:checked').value; prefs.set('backend', { type: mode }); location.reload(); };
  body.querySelector('[data-logout]')?.addEventListener('click', async () => { await db.backend.logout(); location.reload(); });
  body.querySelector('[data-migrar]')?.addEventListener('click', async () => {
    const local = {}; for (const t of TABLES) { try { local[t] = JSON.parse(localStorage.getItem('fin:v1:' + t) || '[]'); } catch { local[t] = []; } }
    const n = (local.lancamentos || []).length; if (!n && !(local.empresas || []).length) return toast('Não há dados locais neste navegador', 'warn');
    if (!await confirm({ title: 'Enviar dados locais', msg: `Envia ${(local.empresas || []).length} empresa(s) e ${n} lançamentos deste navegador para o servidor (mescla por id).`, ok: 'Enviar' })) return;
    try { for (const t of TABLES) { const rows = local[t] || []; if (rows.length) await db.backend.upsert(t, rows); } toast('Dados enviados. Recarregando…'); setTimeout(() => location.reload(), 800); } catch (e) { toast(e.message, 'err', 6000); }
  });
}

function secIntegracoes(body) {
  const E = app.empresaId; const C = app.ctx();
  const contaPg = C.contas.find(c => c.banco === 'pagarme'); const catVendas = C.categorias.find(c => /^vendas$/i.test(c.nome)); const catTaxa = C.categorias.find(c => /gateway|taxa/i.test(c.nome)); const ctPg = C.contatos.find(c => /pagar\.?me/i.test(c.nome));
  const ex = (tipo, desc, valor, cat, ct, conta) => `select fin_api('{
  "op": "upsert", "token": "<token de serviço>",
  "payload": { "table": "lancamentos", "rows": [{
    "id": "<uuid novo>", "empresa_id": "${E}", "tipo": "${tipo}", "descricao": "${desc}",
    "valor": ${valor}, "vencimento": "2026-09-26", "competencia": "2026-09-01",
    "categoria_id": "${cat || '<id da categoria>'}", "contato_id": "${ct || '<id do contato>'}", "conta_id": "${conta || '<id da conta>'}",
    "forma_pagamento": "cartao", "referencia": "AN-15541", "origem": "pagarme", "origem_ref": "ch_xxxxx",
    "baixas": [{ "id": "<uuid>", "data": "2026-09-26", "valor": ${valor}, "conta_id": "${conta || '<id da conta>'}", "juros": 0, "multa": 0, "desconto": 0 }]
  }] }
}'::jsonb);`;
  body.innerHTML = `<div class="card"><div class="card-h"><h3>Lançamentos automáticos via n8n</h3></div>
    <p class="muted sm">Qualquer workflow do n8n (Shopify pedido pago, Pagar.me repasse/taxa, Mercado Livre, PIX do Inter) pode gravar lançamentos direto no banco, sem passar pelo Nibo. Duas formas:</p>
    <ul class="muted sm"><li><b>Nó Postgres</b> (credencial "Postgres account") chamando a função <code>fin_api</code>, ou um <code>insert into lancamentos …</code> direto.</li><li><b>HTTP Request</b> para o webhook <code>${esc(CONFIG.gateway || '')}</code> com o mesmo JSON (precisa de um token de sessão: faça login com um usuário "n8n" via <code>op: login</code>).</li></ul>
    <p class="muted sm">Marque <code>origem</code> e <code>origem_ref</code> pra não duplicar: o índice único <code>(empresa_id, origem, origem_ref)</code> rejeita repetições.</p>
    <div class="kvs"><div class="kv"><span>Empresa ativa</span><b class="mono">${E} <button class="ibtn xs" data-copy="${E}">${icon('ti-copy')}</button></b></div></div>
    <h5>Exemplo · venda aprovada no Pagar.me (receita já recebida na conta Pagar.me)</h5><pre class="code">${esc(ex('receber', 'Pedido AN-15541 · Pagar.me cartão 3x', 489.9, catVendas?.id, ctPg?.id, contaPg?.id))}</pre>
    <h5>Exemplo · taxa do gateway (despesa já paga)</h5><pre class="code">${esc(ex('pagar', 'Taxa Pagar.me · Pedido AN-15541', 19.06, catTaxa?.id, ctPg?.id, contaPg?.id))}</pre>
    <p class="muted xs">Pra lançar em aberto (a receber no futuro), mande <code>"baixas": []</code> e o vencimento previsto. Pra repasse consolidado do dia, some as vendas e mande um único registro.</p></div>
    <div class="card"><div class="card-h"><h3>IDs úteis para os workflows</h3></div><div class="ids"><h6>Contas</h6>${C.contas.map(c => `<div class="id-r"><span>${esc(c.nome)}</span><code>${c.id}</code><button class="ibtn xs" data-copy="${c.id}">${icon('ti-copy')}</button></div>`).join('')}<h6>Categorias mais usadas</h6>${C.categorias.filter(c => /vendas|gateway|fretes|chargeback|tráfego|trafego|comiss|taxa/i.test(c.nome)).map(c => `<div class="id-r"><span>${esc(c.nome)}</span><code>${c.id}</code><button class="ibtn xs" data-copy="${c.id}">${icon('ti-copy')}</button></div>`).join('')}<h6>Contatos de plataforma</h6>${C.contatos.filter(c => /pagar|inter|mercado|shopify|stone/i.test(c.nome)).map(c => `<div class="id-r"><span>${esc(c.nome)}</span><code>${c.id}</code><button class="ibtn xs" data-copy="${c.id}">${icon('ti-copy')}</button></div>`).join('')}</div></div>
    <div class="card"><div class="card-h"><h3>Extrato bancário</h3></div><p class="muted sm">Inter, BTG e Stone exportam OFX pelo internet banking. Importe em <a href="#/extrato">Contas → Conciliação</a>. O n8n também pode inserir na tabela <code>extrato_itens</code> (ex.: webhook de PIX recebido do Inter) e a conciliação sugere o lançamento sozinha.</p></div>`;
  on(body, 'click', '[data-copy]', (e, b) => copy(b.dataset.copy));
}

function secAparencia(body) {
  const tema = prefs.get('tema', 'auto'); const dens = prefs.get('densidade', 'normal'); const inicio = prefs.get('inicio', '#/');
  body.innerHTML = `<div class="card"><div class="card-h"><h3>Tema</h3></div><div data-tema></div></div><div class="card"><div class="card-h"><h3>Densidade das listas</h3></div><div data-dens></div></div><div class="card"><div class="card-h"><h3>Tela inicial</h3></div><div data-ini></div></div><div class="card"><div class="card-h"><h3>Nome</h3></div><p class="muted sm">Aparece na saudação da visão geral.</p><input class="inp" data-nome value="${esc(prefs.get('nome', ''))}" placeholder="Seu nome"></div>`;
  body.querySelector('[data-tema]').appendChild(segmented([{ id: 'auto', label: 'Automático', icon: 'ti-device-desktop' }, { id: 'light', label: 'Claro', icon: 'ti-sun' }, { id: 'dark', label: 'Escuro', icon: 'ti-moon' }], tema, v => { prefs.set('tema', v); app.applyTheme(); }));
  body.querySelector('[data-dens]').appendChild(segmented([{ id: 'normal', label: 'Confortável' }, { id: 'compacta', label: 'Compacta' }], dens, v => { prefs.set('densidade', v); document.documentElement.dataset.dens = v; }));
  body.querySelector('[data-ini]').appendChild(combobox({ options: [{ id: '#/', label: 'Visão geral' }, { id: '#/pagar', label: 'Contas a pagar' }, { id: '#/receber', label: 'Contas a receber' }, { id: '#/extrato', label: 'Contas e extrato' }, { id: '#/fluxo', label: 'Fluxo de caixa' }], value: inicio, allowEmpty: false, onChange: v => prefs.set('inicio', v) }));
  body.querySelector('[data-nome]').onchange = e => { prefs.set('nome', e.target.value.trim()); app.userName = e.target.value.trim(); toast('Salvo'); };
}
function secAtalhos(body) {
  const k = s => `<kbd>${s}</kbd>`;
  body.innerHTML = `<div class="card"><div class="card-h"><h3>Atalhos de teclado</h3></div><div class="kvs">
    <div class="kv"><span>Busca e comandos</span><b>${k('⌘')} ${k('K')}</b></div><div class="kv"><span>Nova despesa</span><b>${k('N')}</b></div><div class="kv"><span>Nova receita</span><b>${k('R')}</b></div><div class="kv"><span>Transferência</span><b>${k('T')}</b></div>
    <div class="kv"><span>Ir para visão geral</span><b>${k('G')} depois ${k('H')}</b></div><div class="kv"><span>Ir para contas a pagar</span><b>${k('G')} depois ${k('P')}</b></div><div class="kv"><span>Ir para contas a receber</span><b>${k('G')} depois ${k('R')}</b></div><div class="kv"><span>Ir para extrato</span><b>${k('G')} depois ${k('E')}</b></div><div class="kv"><span>Ir para fluxo de caixa</span><b>${k('G')} depois ${k('F')}</b></div><div class="kv"><span>Ir para DRE</span><b>${k('G')} depois ${k('D')}</b></div>
    <div class="kv"><span>Fechar painel / modal</span><b>${k('Esc')}</b></div></div></div>
    <div class="card"><div class="card-h"><h3>Sobre</h3></div><p class="muted sm">Financeiro America Nutrition · substitui o Nibo com contas a pagar e receber, extrato e conciliação, fluxo de caixa, DRE gerencial, centros de custo, rateios, parcelamentos, recorrências, anexos, multiempresa e integrações via Supabase + n8n.</p></div>`;
}
