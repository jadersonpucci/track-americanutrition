// Proxy interno da API do Banco Inter (mTLS fica no no HTTP). Exige k = pix_admin_token.
// body: { k, escopo: 'cob'|'boleto'|'extrato'|'pagamento', method: GET|POST|PUT|DELETE|PATCH, path: 'cobranca/v3/cobrancas', query: {...}, body: {...} }
const BASE = 'https://n8n.americanutrition.com';
const self = this;
const cfg = ($input.first().json || {}).cfg || {};
const root = $('Inter API: Requisição').first().json;
const b = root.body || root || {};
if (!cfg.pix_admin_token || String(b.k || '') !== cfg.pix_admin_token) return [{ json: { ok: false, erro: 'nao autorizado' } }];
const method = String(b.method || 'GET').toUpperCase();
if (['GET', 'POST', 'PUT', 'DELETE', 'PATCH'].indexOf(method) < 0) return [{ json: { ok: false, erro: 'metodo invalido' } }];
const path = String(b.path || '').replace(/^\/+/, '').trim();
if (!path || path.indexOf('..') >= 0 || /[\s]/.test(path)) return [{ json: { ok: false, erro: 'path invalido' } }];
const escopo = String(b.escopo || 'boleto');
let tk;
try {
  tk = await self.helpers.httpRequest({ method: 'POST', url: BASE + '/webhook/pix-inter-token', json: true, timeout: 30000, body: { k: cfg.pix_admin_token, escopo: escopo } });
  if (!tk || !tk.ok || !tk.token) throw new Error((tk && tk.erro) || 'token indisponivel');
} catch (e) { return [{ json: { ok: false, erro: 'token ' + escopo + ': ' + String(e && e.message || e).slice(0, 200) } }]; }
const query = (b.query && typeof b.query === 'object') ? b.query : {};
const corpo = (b.body && typeof b.body === 'object') ? b.body : null;
const temCorpo = method !== 'GET' && method !== 'DELETE' && corpo !== null;
const headers = { Authorization: 'Bearer ' + tk.token, 'Content-Type': 'application/json', Accept: 'application/json' };
const conta = String(cfg.inter_conta_corrente || '').trim();
if (conta) headers['x-conta-corrente'] = conta;
return [{ json: { ok: true, url: tk.base + '/' + path, method: method, query: query, headers: headers, corpo: temCorpo ? JSON.stringify(corpo) : '' } }];
