// Dados do painel. Dois modos com a mesma interface:
//  - servidor: webhook n8n "loja-api" → função loja_api no Postgres (login com os mesmos usuários do Financeiro)
//  - demonstração: IndexedDB do navegador, começando dos dados do último build (admin/dados.json)
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
    s.pedidos = s.pedidos || [];
    return s;
  }
  async semente() {
    const r = await fetch('/admin/dados.json', { cache: 'no-cache' });
    if (!r.ok) throw new Error('Sem dados do build (admin/dados.json).');
    const d = await r.json();
    const s = { config: d.config, home: d.home, redirects: d.redirects || [], pedidos: [] };
    for (const c of COLECOES) s[c] = d[c] || [];
    await idbSet('estado', s);
    return s;
  }
  async salvar(state) { await idbSet('estado', state); }
  async upsert(_t, _rows, state) { await this.salvar(state); }
  async remove(_t, _ids, state) { await this.salvar(state); }
  async setUnico(_k, _v, state) { await this.salvar(state); }
  async resetar() { await idbSet('estado', null); }
  async pedidos() { return null; }
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
    return j.data;
  }
  async upsert(t, rows) { for (let i = 0; i < rows.length; i += 50) await this.call('upsert', { table: t, rows: rows.slice(i, i + 50) }); }
  async remove(t, ids) { await this.call('remove', { table: t, ids }); }
  async setUnico(k, v) { await this.call('set', { chave: k, valor: v }); }
  async pedidos(f) { return (await this.call('pedidos', f)).pedidos; }
  async pedido(id) { return (await this.call('pedido', { id })).pedido; }
  async pedidoAtualizar(id, campos) { return (await this.call('pedido_atualizar', { id, ...campos })).pedido; }
  async resumo() { return (await this.call('resumo')).resumo; }
  async clientes(f) { return (await this.call('clientes', f)).clientes; }
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
    return this;
  },
  get demo() { return this.backend.modo === 'demo'; },
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
  pendente() { pref.set('alteracoes', (pref.get('alteracoes', 0) || 0) + 1); },
  // pacote no formato de loja/data/loja.json (o mesmo que o build lê)
  exportar() {
    const s = this.state;
    return { versao: 1, gerado_em: new Date().toISOString(), config: s.config, home: s.home, redirects: s.redirects, ...Object.fromEntries(COLECOES.map((c) => [c, s[c]])) };
  },
};
