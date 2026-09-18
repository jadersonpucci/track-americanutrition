// Proxy interno da API Empresas do Nibo (credencial "Nibo API" fica no no HTTP). Exige k = pix_admin_token.
// body: { k, method: GET|POST|PUT|DELETE, path: 'receipts' | 'accounts' | ..., query: {...}, body: {...} }
// Nota: sendQuery/sendBody do no HTTP ficam como true literal (com expressao o n8n esconde jsonQuery/body e manda vazio).
const cfg = ($input.first().json || {}).cfg || {};
const root = $('Nibo API: Requisição').first().json;
const b = root.body || root || {};
if (!cfg.pix_admin_token || String(b.k || '') !== cfg.pix_admin_token) return [{ json: { ok: false, erro: 'nao autorizado' } }];
const method = String(b.method || 'GET').toUpperCase();
if (['GET', 'POST', 'PUT', 'DELETE'].indexOf(method) < 0) return [{ json: { ok: false, erro: 'metodo invalido' } }];
const path = String(b.path || '').replace(/^\/+/, '').trim();
if (!path || path.indexOf('..') >= 0 || /[\s]/.test(path)) return [{ json: { ok: false, erro: 'path invalido' } }];
const query = (b.query && typeof b.query === 'object') ? b.query : {};
const corpo = (b.body && typeof b.body === 'object') ? b.body : null;
const temCorpo = method !== 'GET' && method !== 'DELETE' && corpo !== null;
return [{ json: {
  ok: true, method: method, path: path,
  temQuery: Object.keys(query).length > 0, query: query,
  temCorpo: temCorpo,
  corpo: temCorpo ? JSON.stringify(corpo) : ''
} }];
