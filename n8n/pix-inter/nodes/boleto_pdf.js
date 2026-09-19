// GET /webhook/inter-boleto-pdf?c=<codigoSolicitacao>: baixa o PDF do boleto hibrido no Inter (base64) e devolve como arquivo.
const BASE = 'https://n8n.americanutrition.com';
const self = this;
const cfg = ($input.first().json || {}).cfg || {};
const q = $('BPdf: Requisição').first().json.query || {};
const cod = String(q.c || '').replace(/[^a-zA-Z0-9-]/g, '').slice(0, 60);
if (!cod || !cfg.pix_admin_token) return [{ json: { ok: false, erro: 'codigo invalido' } }];
try {
  const r = await self.helpers.httpRequest({ method: 'POST', url: BASE + '/webhook/inter-api', json: true, timeout: 60000, body: { k: cfg.pix_admin_token, escopo: 'boleto', method: 'GET', path: 'cobranca/v3/cobrancas/' + cod + '/pdf' } });
  const b64 = r && r.ok && r.body && r.body.pdf;
  if (!b64) return [{ json: { ok: false, erro: 'Inter PDF ' + (r && r.statusCode) + ': ' + JSON.stringify(r && (r.body || r.erro)).slice(0, 200) } }];
  const bin = await self.helpers.prepareBinaryData(Buffer.from(String(b64), 'base64'), 'boleto-' + cod.slice(0, 8) + '.pdf', 'application/pdf');
  return [{ json: { ok: true, codigo: cod }, binary: { data: bin } }];
} catch (e) { return [{ json: { ok: false, erro: String(e && e.message || e).slice(0, 200) } }]; }
