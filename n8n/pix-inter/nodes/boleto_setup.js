// GET /webhook/boleto-inter-setup?t=TOKEN: registra o webhook da Cobranca v3 (boleto/PIX) no Inter.
const BASE = 'https://n8n.americanutrition.com';
const self = this;
const cfg = ($input.first().json || {}).cfg || {};
const q = $('BSetup: Requisição').first().json.query || {};
if (!cfg.pix_admin_token || String(q.t || '') !== cfg.pix_admin_token) return [{ json: { ok: false, erro: 'nao autorizado' } }];
const url = BASE + '/webhook/boleto-inter-webhook';
const api = async (method, path, body) => self.helpers.httpRequest({ method: 'POST', url: BASE + '/webhook/inter-api', json: true, timeout: 60000, body: { k: cfg.pix_admin_token, escopo: 'boleto', method: method, path: path, body: body || null } });
try {
  const r = await api('PUT', 'cobranca/v3/cobrancas/webhook', { webhookUrl: url });
  let atual = null;
  try { const g = await api('GET', 'cobranca/v3/cobrancas/webhook'); atual = g && g.body; } catch (e) { }
  return [{ json: { ok: !!(r && r.ok), http: r && r.statusCode, webhookUrl: url, resposta_inter: r && r.body, webhook_atual: atual, dica: (r && r.ok) ? 'Webhook de boleto registrado. O Inter avisa cada boleto/PIX recebido nessa URL.' : 'Falhou; veja resposta_inter.' } }];
} catch (e) { return [{ json: { ok: false, erro: String(e && e.message || e).slice(0, 300) } }]; }
