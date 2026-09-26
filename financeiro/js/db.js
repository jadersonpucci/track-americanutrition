// Camada de dados. Dois backends com a mesma interface:
//  - local:    localStorage (funciona offline, sem servidor; ideal pra começar e pra testar)
//  - supabase: PostgREST + Auth do Supabase self-hosted (multiusuário, backup, integrações via n8n)
// O app trabalha sempre em memória (db.state) e cada escrita vai pro backend.
import { uid } from './utils.js';

export const TABLES = ['empresas', 'contas', 'categorias', 'centros', 'contatos', 'tags', 'lancamentos', 'extrato_itens'];
const LS_PREFIX = 'fin:v1:';

export const prefs = {
  get(k, d = null) { try { const v = localStorage.getItem(LS_PREFIX + 'pref:' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(LS_PREFIX + 'pref:' + k, JSON.stringify(v)); } catch {} },
  del(k) { try { localStorage.removeItem(LS_PREFIX + 'pref:' + k); } catch {} },
};

class LocalBackend {
  name = 'local';
  async load() {
    const s = {};
    for (const t of TABLES) { try { s[t] = JSON.parse(localStorage.getItem(LS_PREFIX + t) || '[]'); } catch { s[t] = []; } }
    return s;
  }
  async upsert(table, rows, state) { this._save(table, state[table]); }
  async remove(table, ids, state) { this._save(table, state[table]); }
  _save(table, rows) { try { localStorage.setItem(LS_PREFIX + table, JSON.stringify(rows)); } catch (e) { console.error(e); throw new Error('Sem espaço no navegador pra salvar. Exporte um backup e limpe os dados de exemplo.'); } }
  async wipe() { for (const t of TABLES) localStorage.removeItem(LS_PREFIX + t); }
}

class SupabaseBackend {
  name = 'supabase';
  constructor(cfg) { this.url = cfg.url.replace(/\/$/, ''); this.key = cfg.anonKey; this.session = prefs.get('sb:session'); }
  headers(json = true) {
    const h = { apikey: this.key, Authorization: 'Bearer ' + (this.session?.access_token || this.key) };
    if (json) h['Content-Type'] = 'application/json';
    return h;
  }
  async login(email, password) {
    const r = await fetch(`${this.url}/auth/v1/token?grant_type=password`, { method: 'POST', headers: { apikey: this.key, 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) });
    const j = await r.json(); if (!r.ok) throw new Error(j.error_description || j.msg || j.error || 'Falha no login');
    this.session = j; prefs.set('sb:session', j); return j;
  }
  async refresh() {
    if (!this.session?.refresh_token) return false;
    const r = await fetch(`${this.url}/auth/v1/token?grant_type=refresh_token`, { method: 'POST', headers: { apikey: this.key, 'Content-Type': 'application/json' }, body: JSON.stringify({ refresh_token: this.session.refresh_token }) });
    if (!r.ok) { this.session = null; prefs.del('sb:session'); return false; }
    this.session = await r.json(); prefs.set('sb:session', this.session); return true;
  }
  logout() { this.session = null; prefs.del('sb:session'); }
  get user() { return this.session?.user || null; }
  async req(path, opts = {}, retry = true) {
    const r = await fetch(`${this.url}/rest/v1/${path}`, { ...opts, headers: { ...this.headers(), ...(opts.headers || {}) } });
    if (r.status === 401 && retry && await this.refresh()) return this.req(path, opts, false);
    if (!r.ok) { let m = r.statusText; try { const j = await r.json(); m = j.message || j.hint || j.error || m; } catch {} throw new Error(`Supabase: ${m}`); }
    if (r.status === 204) return null;
    const txt = await r.text(); return txt ? JSON.parse(txt) : null;
  }
  async fetchTable(t) {
    const out = []; const page = 1000;
    for (let from = 0; ; from += page) {
      const rows = await this.req(`${t}?select=*&order=id&deletado_em=is.null`, { headers: { Range: `${from}-${from + page - 1}`, 'Range-Unit': 'items' } }).catch(async e => {
        if (/deletado_em/.test(e.message)) return this.req(`${t}?select=*&order=id`, { headers: { Range: `${from}-${from + page - 1}`, 'Range-Unit': 'items' } });
        throw e;
      });
      out.push(...(rows || [])); if (!rows || rows.length < page) break;
    }
    return out;
  }
  async load() { const s = {}; await Promise.all(TABLES.map(async t => { s[t] = await this.fetchTable(t); })); return s; }
  async upsert(table, rows) {
    await this.req(table, { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify(rows) });
  }
  async remove(table, ids) {
    for (const id of ids) await this.req(`${table}?id=eq.${id}`, { method: 'DELETE', headers: { Prefer: 'return=minimal' } });
  }
  async wipe() { throw new Error('Não é possível apagar tudo no Supabase por aqui. Use o SQL Editor.'); }
}

export const db = {
  state: Object.fromEntries(TABLES.map(t => [t, []])),
  backend: null,
  ready: false,
  listeners: new Set(),
  onChange(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); },
  emit(table) { for (const fn of this.listeners) { try { fn(table); } catch (e) { console.error(e); } } },

  async init() {
    const cfg = prefs.get('backend');
    this.backend = cfg?.type === 'supabase' && cfg.url && cfg.anonKey ? new SupabaseBackend(cfg) : new LocalBackend();
    try { this.state = await this.backend.load(); }
    catch (e) { console.error(e); this.loadError = e; if (this.backend.name === 'supabase') { this.state = Object.fromEntries(TABLES.map(t => [t, []])); } }
    for (const t of TABLES) if (!Array.isArray(this.state[t])) this.state[t] = [];
    this.index = {}; for (const t of TABLES) this.reindex(t);
    this.ready = true; return this;
  },
  reindex(t) { this.index[t] = new Map(this.state[t].map(r => [r.id, r])); },
  all(t) { return this.state[t]; },
  get(t, id) { return this.index[t]?.get(id) || null; },
  // rows escopadas na empresa ativa
  of(t, empresaId) { return t === 'empresas' ? this.state[t] : this.state[t].filter(r => r.empresa_id === empresaId && !r.deletado_em); },

  async upsert(t, rowOrRows) {
    const rows = (Array.isArray(rowOrRows) ? rowOrRows : [rowOrRows]).map(r => ({ ...r, id: r.id || uid(), atualizado_em: new Date().toISOString() }));
    for (const r of rows) {
      const i = this.state[t].findIndex(x => x.id === r.id);
      if (i >= 0) this.state[t][i] = r; else this.state[t].push(r);
    }
    this.reindex(t);
    await this.backend.upsert(t, rows, this.state);
    this.emit(t);
    return Array.isArray(rowOrRows) ? rows : rows[0];
  },
  async remove(t, idOrIds) {
    const ids = Array.isArray(idOrIds) ? idOrIds : [idOrIds];
    this.state[t] = this.state[t].filter(r => !ids.includes(r.id));
    this.reindex(t);
    await this.backend.remove(t, ids, this.state);
    this.emit(t);
  },
  async replaceAll(data) {
    for (const t of TABLES) { this.state[t] = data[t] || []; this.reindex(t); await this.backend.upsert(t, this.state[t], this.state); }
    this.emit('*');
  },
  export() { return { versao: 1, exportado_em: new Date().toISOString(), ...Object.fromEntries(TABLES.map(t => [t, this.state[t]])) }; },
};
