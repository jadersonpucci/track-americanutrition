// Token OAuth2 do Inter com cache em staticData (validade ~1h). Endpoint interno: exige k = pix_admin_token.
const cfg = ($input.first().json || {}).cfg || {};
const root = $('Token: Requisição').first().json;
const body = root.body || root || {};
const k = String(body.k || '');
if (!cfg.pix_admin_token || k !== cfg.pix_admin_token) {
  return [{ json: { ok: false, precisa: false, erro: 'nao autorizado' } }];
}
if (!cfg.inter_client_id || !cfg.inter_client_secret) {
  return [{ json: { ok: false, precisa: false, erro: 'inter_client_id / inter_client_secret nao configurados em checkout_config' } }];
}
const base = String(cfg.inter_ambiente || 'producao') === 'sandbox'
  ? 'https://cdpj-sandbox.partners.uatinter.co'
  : 'https://cdpj.partners.bancointer.com.br';
const sd = $getWorkflowStaticData('global');
if (sd.inter_token && sd.inter_token_base === base && Number(sd.inter_token_exp || 0) > Date.now() + 60000) {
  return [{ json: { ok: true, precisa: false, token: sd.inter_token, base: base } }];
}
return [{ json: { ok: true, precisa: true, base: base, client_id: String(cfg.inter_client_id).trim(), client_secret: String(cfg.inter_client_secret).trim() } }];
