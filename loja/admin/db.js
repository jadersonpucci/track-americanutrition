// Dados do painel. Dois modos com a mesma interface:
//  - servidor: webhook n8n "loja-api" → função loja_api no Postgres (login com os mesmos usuários do Financeiro)
//  - demonstração: IndexedDB do navegador, começando dos dados do último build (admin/dados.json)
import * as demo from './demo-pedidos.js';
import * as est from './estoque-logica.js';

export const CONFIG = {
  gateway: '', // ex.: 'https://n8n.americanutrition.com/webhook/loja-api' (deixe vazio para o modo demonstração)
};

export const COLECOES = ['produtos', 'colecoes', 'paginas', 'artigos', 'blogs', 'depoimentos', 'cupons'];
export const UNICOS = ['config', 'home', 'redirects'];

const pref = {
  get(k, d = null) { try { const v = localStorage.getItem('loja:' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('loja:' + k, JSON.stringify(v)); } catch {} },
  del(k) { try { localStorage.removeItem('loja:' + k); } catch {} },
};
export { pref };

// ------------------------------------------------------------------ IndexedDB (modo demonstração)
function idb() {
  return new Promise((ok, err) => {
    const r = indexedDB.open('loja-admin', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('kv');
    r.onsuccess = () => ok(r.result); r.onerror = () => err(r.error);
  });
}
async function idbGet(k) { const d = await idb(); return new Promise((ok, err) => { const r = d.transaction('kv').objectStore('kv').get(k); r.onsuccess = () => ok(r.result); r.onerror = () => err(r.error); }); }
async function idbSet(k, v) { const d = await idb(); return new Promise((ok, err) => { const t = d.transaction('kv', 'readwrite'); t.objectStore('kv').put(v, k); t.oncomplete = () => ok(); t.onerror = () => err(t.error); }); }

class Demo {
  modo = 'demo'; user = { nome: 'Demonstração', email: 'local' };
  async load() {
    let s = await idbGet('estado').catch(() => null);
    if (!s) s = await this.semente();
    // pedidos e cupons FICTÍCIOS, só para ver o painel funcionando (marcados com a tag "demonstração")
    // versão 2 dos fictícios: numeração AN-157xx/158xx (a anterior usava 50001…)
    if (!s.pedidos?.length || (s.pedidos.some((p) => (p.tags || []).includes('demonstração')) && s.demoVersao !== 2)) {
      s.demoVersao = 2;
      s.pedidos = demo.gerarPedidos(s.produtos || []);
      if (!(s.cupons || []).length) s.cupons = [
        { id: 'demo-c1', codigo: 'BEMVINDO10', descricao: 'Primeira compra (exemplo)', tipo: 'percentual', valor: 10, minimo: 100, ativo: true, usos: s.pedidos.filter((p) => p.cupom === 'BEMVINDO10').length, criado_em: '2026-09-01T12:00:00Z' },
        { id: 'demo-c2', codigo: 'OUTUBRO15', descricao: 'Outubro Rosa (exemplo)', tipo: 'percentual', valor: 15, minimo: null, fim: '2026-10-31T23:59:00-03:00', ativo: true, usos: s.pedidos.filter((p) => p.cupom === 'OUTUBRO15').length, criado_em: '2026-10-01T12:00:00Z' },
        { id: 'demo-c3', codigo: 'VOLTA10', descricao: 'Recompra (exemplo)', tipo: 'percentual', valor: 10, limite: 200, ativo: true, usos: s.pedidos.filter((p) => p.cupom === 'VOLTA10').length, criado_em: '2026-08-15T12:00:00Z' },
        { id: 'demo-c4', codigo: 'FRETEGRATIS', descricao: 'Frete grátis (exemplo)', tipo: 'frete', valor: 0, minimo: 150, ativo: false, usos: 0, criado_em: '2026-07-10T12:00:00Z' },
      ];
      await idbSet('estado', s);
    }
    // estoque (locais e quantidades reais da Shopify); estados antigos do navegador ganham na primeira abertura
    if (!s.locais) await this.migrarEstoque(s);
    if (s.pedidos.some((p) => p.estoque_estado === undefined)) {
      for (const p of [...s.pedidos].reverse()) {
        if (p.estoque_estado !== undefined) continue;
        if (['enviado', 'entregue', 'devolvido'].includes(p.status_entrega)) p.estoque_estado = 'importado';   // histórico: já saiu antes do saldo atual
        else est.pedidoEstoque(s, p, 'Demonstração');
      }
      await idbSet('estado', s);
    }
    this.s = s;
    return s;
  }
  async semente() {
    const r = await fetch('/admin/dados.json', { cache: 'no-cache' });
    if (!r.ok) throw new Error('Sem dados do build (admin/dados.json).');
    const d = await r.json();
    const s = { config: d.config, home: d.home, redirects: d.redirects || [], pedidos: [] };
    for (const c of COLECOES) s[c] = d[c] || [];
    s.locais = d.locais || []; s.estoque = d.estoque || []; s.estoque_mov = [];
    await idbSet('estado', s);
    return s;
  }
  async migrarEstoque(s) {
    const d = await fetch('/admin/dados.json', { cache: 'no-cache' }).then((r) => r.json()).catch(() => ({}));
    s.locais = d.locais || []; s.estoque = d.estoque || []; s.estoque_mov = [];
    const orig = new Map((d.produtos || []).flatMap((p) => p.variantes || []).map((v) => [String(v.id), v]));
    for (const p of s.produtos || []) for (const v of p.variantes || []) {
      const o = orig.get(String(v.id)); if (!o) continue;
      for (const k of ['rastrear', 'vender_sem_estoque', 'custo', 'estoque_minimo']) if (v[k] === undefined && o[k] !== undefined) v[k] = o[k];
    }
    est.sincronizar(s);
    await idbSet('estado', s);
  }
  async salvar(state) { await idbSet('estado', state); }
  async upsert(t, rows, state) { this.registrar('upsert', `Salvou ${t}: ${rows.map((r) => r.titulo || r.codigo || r.handle || r.id).join(', ')}`); await this.salvar(state); }
  async remove(t, ids, state) { this.registrar('remove', `Excluiu ${t}: ${ids.join(', ')}`); await this.salvar(state); }
  async setUnico(k, _v, state) { this.registrar('set', `Alterou ${k}`); await this.salvar(state); }
  async resetar() { await idbSet('estado', null); }
  async pedidos(f) { return demo.filtrarPedidos(this.s.pedidos, f); }
  async pedido(id) { return this.s.pedidos.find((p) => p.id === id); }
  async pedidoAtualizar(id, c) {
    const p = this.s.pedidos.find((x) => x.id === id); if (!p) throw new Error('Pedido não encontrado');
    const ev = (t) => p.eventos.push({ em: new Date().toISOString(), texto: t, por: 'Demonstração' });
    if (c.status_entrega && c.status_entrega !== p.status_entrega) ev('Entrega: ' + c.status_entrega);
    if (c.status_pagamento && c.status_pagamento !== p.status_pagamento) ev('Pagamento: ' + c.status_pagamento);
    if ('rastreio' in c && c.rastreio !== p.rastreio && c.rastreio) ev('Rastreio: ' + c.rastreio);
    Object.assign(p, c, { atualizado_em: new Date().toISOString() });
    est.pedidoEstoque(this.s, p, 'Demonstração');
    this.registrar('pedido_atualizar', `Pedido AN-${p.numero}: ${Object.entries(c).filter(([k]) => ['status_entrega', 'status_pagamento', 'rastreio'].includes(k)).map(([k, v]) => `${k.replace('status_', '')} ${v || '—'}`).join(', ')}`);
    await this.salvar(this.s); return p;
  }
  async resumo() { return demo.resumo(this.s.pedidos); }
  async pedidoCriar(payload) { const p = demo.criar(this.s.pedidos, payload, this.s.produtos); est.pedidoEstoque(this.s, p, 'Demonstração'); await this.salvar(this.s); return p; }
  // estoque: aqui o estado do navegador é o próprio db.state, então as funções já atualizam a tela
  async estoque() { this.s.vendas_30d = est.vendas(this.s, 30); return { locais: this.s.locais, niveis: this.s.estoque, vendas_30d: this.s.vendas_30d }; }
  async relatorio({ desde, ate } = {}) {
    const a = desde ? new Date(desde) : new Date(Date.now() - 30 * 864e5), b = ate ? new Date(ate) : new Date(Date.now() + 864e5);
    return this.s.pedidos.filter((p) => new Date(p.criado_em) >= a && new Date(p.criado_em) < b).map((p) => ({ ...p, uf: p.endereco?.uf, cliente: (p.cliente?.email || p.cliente?.cpf || p.id || '').toLowerCase() }));
  }
  async usuarios() { return { eu: 'demo', papel_padrao: 'dono', usuarios: [{ id: 'demo', nome: 'Demonstração', email: 'local', ativo: true, papel: 'dono', ultimo_acesso: new Date().toISOString() }, { id: 'demo-2', nome: 'Expedição (exemplo)', email: 'expedicao@exemplo.com', ativo: true, papel: 'expedicao' }, { id: 'demo-3', nome: 'Marketing (exemplo)', email: 'marketing@exemplo.com', ativo: true, papel: 'conteudo' }] }; }
  async usuariosGravar() { throw new Error('No modo demonstração os papéis não são gravados.'); }
  async atividade() { return (this.s.atividade || []).slice(0, 300); }
  registrar(op, resumo) { this.s.atividade = [{ em: new Date().toISOString(), usuario: 'Demonstração', op, resumo }, ...(this.s.atividade || [])].slice(0, 1000); }
  async estoqueAjustar(itens) { this.registrar('estoque_ajustar', `Ajustou estoque de ${itens.length} item(ns)`); const mudou = est.ajustar(this.s, itens, 'Demonstração'); await this.salvar(this.s); return { mudou }; }
  async estoqueTransferir(t) { const mudou = est.transferir(this.s, t, 'Demonstração'); await this.salvar(this.s); return { mudou }; }
  async estoqueMov(f = {}) {
    return (this.s.estoque_mov || []).filter((m) => (!f.variante_id || m.variante_id === String(f.variante_id)) && (!f.local_id || m.local_id === f.local_id)).slice(0, f.limite || 200);
  }
  async locaisGravar(locais) { this.s.locais = locais; const mudou = est.sincronizar(this.s); await this.salvar(this.s); return { mudou }; }
  async clientes(f) { return demo.clientes(this.s.pedidos, f); }
}

// ------------------------------------------------------------------ servidor (n8n → loja_api)
class Servidor {
  modo = 'servidor';
  constructor(url) { this.url = url; this.sess = pref.get('sessao'); }
  get user() { return this.sess?.user; }
  async call(op, payload = {}, { auth = true } = {}) {
    const ac = new AbortController(); const tm = setTimeout(() => ac.abort(), 90000);
    let r;
    try { r = await fetch(this.url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ op, token: auth ? this.sess?.token : undefined, payload }), signal: ac.signal }); }
    catch (e) { throw new Error(e.name === 'AbortError' ? 'O servidor demorou demais para responder.' : 'Sem conexão com o servidor.'); }
    finally { clearTimeout(tm); }
    if (!r.ok) throw new Error('Servidor respondeu ' + r.status);
    let j = await r.json(); if (Array.isArray(j)) j = j[0]; if (j && j.r && !('ok' in j)) j = j.r;
    if (!j || j.ok !== true) { const e = new Error(j?.erro === 'sessao_invalida' ? 'Sessão expirada. Entre de novo.' : j?.erro || 'Erro no servidor'); e.code = j?.erro; throw e; }
    return j;
  }
  async login(email, senha) { const j = await this.call('login', { email, senha, origem: 'loja ' + navigator.userAgent.slice(0, 60) }, { auth: false }); this.sess = { token: j.token, user: j.user }; pref.set('sessao', this.sess); }
  async logout() { try { await this.call('logout'); } catch {} this.sess = null; pref.del('sessao'); }
  async load() {
    if (!this.sess?.token) { const e = new Error('login'); e.code = 'login'; throw e; }
    const j = await this.call('load');
    if (j.user) { this.sess.user = j.user; pref.set('sessao', this.sess); }   // traz o papel atualizado
    return j.data;
  }
  async upsert(t, rows) { for (let i = 0; i < rows.length; i += 50) await this.call('upsert', { table: t, rows: rows.slice(i, i + 50) }); }
  async remove(t, ids) { await this.call('remove', { table: t, ids }); }
  async setUnico(k, v) { await this.call('set', { chave: k, valor: v }); }
  async pedidos(f) { return (await this.call('pedidos', f)).pedidos; }
  async pedido(id) { return (await this.call('pedido', { id })).pedido; }
  async pedidoAtualizar(id, campos) { return (await this.call('pedido_atualizar', { id, ...campos })).pedido; }
  async resumo() { return (await this.call('resumo')).resumo; }
  async pedidoCriar(payload) { return this.call('pedido_criar', payload); }
  async clientes(f) { return (await this.call('clientes', f)).clientes; }
  async estoque() { const j = await this.call('estoque'); return { locais: j.locais, niveis: j.niveis, variantes: j.variantes, vendas_30d: j.vendas_30d }; }
  async relatorio(f) { return (await this.call('relatorio', f)).pedidos; }
  async usuarios() { return this.call('usuarios'); }
  async usuariosGravar(usuario_id, papel) { return this.call('usuarios_gravar', { usuario_id, papel }); }
  async atividade(f = {}) { return (await this.call('atividade', f)).itens; }
  async estoqueAjustar(itens) { return this.call('estoque_ajustar', { itens }); }
  async estoqueTransferir(t) { return this.call('estoque_transferir', t); }
  async estoqueMov(f = {}) { return (await this.call('estoque_mov', f)).itens; }
  async locaisGravar(locais) { return this.call('locais_gravar', { locais }); }
  async publicar(nota) { return this.call('publicar', { nota }); }
  async publicacoes() { return (await this.call('publicacoes')).itens; }
}

export const db = {
  state: null, backend: null, ouvintes: new Set(),
  on(fn) { this.ouvintes.add(fn); return () => this.ouvintes.delete(fn); },
  emit(t) { for (const f of this.ouvintes) try { f(t); } catch (e) { console.error(e); } },
  async init() {
    this.backend = CONFIG.gateway ? new Servidor(CONFIG.gateway) : new Demo();
    this.state = await this.backend.load();
    for (const c of COLECOES) this.state[c] = this.state[c] || [];
    this.state.locais = this.state.locais || []; this.state.estoque = this.state.estoque || [];
    return this;
  },
  get demo() { return this.backend.modo === 'demo'; },
  // papel do usuário no painel: dono | gerente | expedicao | conteudo (o servidor confere cada operação)
  // texto quando a disponibilidade de um produto muda: no servidor a publicação é automática (fila de eventos)
  get avisoVitrine() { return this.demo ? 'Publique a loja para atualizar o site.' : 'O site se atualiza sozinho em cerca de 1 minuto.'; },
  get papel() { return this.backend.user?.papel || 'dono'; },
  all(t) { return this.state[t] || []; },
  get(t, id) { return this.all(t).find((x) => String(x.id) === String(id)) || null; },
  async upsert(t, row) {
    const rows = Array.isArray(row) ? row : [row];
    const agora = new Date().toISOString();
    for (const r of rows) {
      if (!r.id) r.id = (crypto.randomUUID?.() || String(Date.now()) + Math.random().toString(36).slice(2));
      r.atualizado_em = agora;
      const i = this.state[t].findIndex((x) => String(x.id) === String(r.id));
      if (i >= 0) this.state[t][i] = r; else this.state[t].push(r);
    }
    // estoque/disponível das variantes vêm do saldo (controle de estoque), não do formulário
    if (t === 'produtos') est.sincronizar(this.state, rows.flatMap((r) => (r.variantes || []).map((v) => String(v.id))));
    await this.backend.upsert(t, rows, this.state);
    this.pendente(); this.emit(t);
    return row;
  },
  async remove(t, ids) {
    ids = (Array.isArray(ids) ? ids : [ids]).map(String);
    this.state[t] = this.state[t].filter((x) => !ids.includes(String(x.id)));
    await this.backend.remove(t, ids, this.state);
    this.pendente(); this.emit(t);
  },
  async set(k, v) { this.state[k] = v; await this.backend.setUnico(k, v, this.state); this.pendente(); this.emit(k); },
  // estoque: busca o saldo atual e aplica (no servidor também atualiza estoque/disponível das variantes)
  async recarregarEstoque() { this.aplicarEstoque(await this.backend.estoque()); return this.state; },
  aplicarEstoque(r) {
    if (r?.vendas_30d) this.state.vendas_30d = r.vendas_30d;
    if (!r || this.demo) return r;
    if (r.locais) this.state.locais = r.locais;
    if (r.niveis) {
      const ids = new Set((r.variantes_afetadas || r.niveis.map((n) => n.variante_id)).map(String));
      this.state.estoque = r.variantes_afetadas ? [...(this.state.estoque || []).filter((n) => !ids.has(String(n.variante_id))), ...r.niveis] : r.niveis;
    }
    const vs = new Map((r.variantes || []).map((v) => [String(v.id), v]));
    if (vs.size) for (const p of this.state.produtos) for (const v of p.variantes || []) { const x = vs.get(String(v.id)); if (x) Object.assign(v, { estoque: x.estoque, disponivel: x.disponivel }); }
    return r;
  },
  async estoqueAjustar(itens) { const r = this.aplicarEstoque(await this.backend.estoqueAjustar(itens)); this.pendenteSe(r); this.emit('estoque'); return r; },
  async estoqueTransferir(t) { const r = this.aplicarEstoque(await this.backend.estoqueTransferir(t)); this.pendenteSe(r); this.emit('estoque'); return r; },
  async locaisGravar(l) { const r = this.aplicarEstoque(await this.backend.locaisGravar(l)); if (!this.demo) this.state.locais = l; this.pendenteSe(r); this.emit('estoque'); return r; },
  // a vitrine é estática: quando um produto esgota ou volta, precisa publicar de novo
  pendenteSe(r) { if (r?.mudou?.length) this.pendente(); },
  pendente() { pref.set('alteracoes', (pref.get('alteracoes', 0) || 0) + 1); },
  // pacote no formato de loja/data/loja.json (o mesmo que o build lê)
  exportar() {
    const s = this.state;
    return { versao: 1, gerado_em: new Date().toISOString(), config: s.config, home: s.home, redirects: s.redirects, ...Object.fromEntries(COLECOES.map((c) => [c, s[c]])) };
  },
};
