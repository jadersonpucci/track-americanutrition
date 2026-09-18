// Registra no Inter a URL que recebe as notificacoes de PIX recebido (PUT /pix/v2/webhook/{chave}).
const BASE = 'https://n8n.americanutrition.com';
const self = this;
const cfg = ($input.first().json || {}).cfg || {};
const q = $('Setup: Requisição').first().json.query || {};
const t = String(q.t || '').trim();
if (!cfg.pix_admin_token || t !== cfg.pix_admin_token) return [{ json: { ok: false, registrar: false, erro: 'nao autorizado' } }];
if (!cfg.inter_chave_pix) return [{ json: { ok: false, registrar: false, erro: 'inter_chave_pix nao configurada' } }];
let tk;
try {
  tk = await self.helpers.httpRequest({ method: 'POST', url: BASE + '/webhook/pix-inter-token', json: true, timeout: 30000, body: { k: cfg.pix_admin_token } });
  if (!tk || !tk.ok || !tk.token) throw new Error((tk && tk.erro) || 'token Inter indisponivel');
} catch (e) { return [{ json: { ok: false, registrar: false, erro: 'token: ' + String(e && e.message || e).slice(0, 200) } }]; }
return [{ json: { ok: true, registrar: true, token: tk.token, base: tk.base, conta: String(cfg.inter_conta_corrente || '').trim(), chave: String(cfg.inter_chave_pix).trim(), webhookUrl: BASE + '/webhook/pix-inter-webhook' } }];
