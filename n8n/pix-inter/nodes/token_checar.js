// Token OAuth2 do Inter com cache em staticData (validade ~1h), um cache por escopo. Endpoint interno: exige k = pix_admin_token.
// escopo: 'cob' (padrao, cobranca PIX) | 'extrato' (Banking API extrato) | 'pagamento' (Pix out). Cada um precisa estar liberado no app do Inter.
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
const ESCOPOS = { cob: 'cob.write cob.read pix.read webhook.write webhook.read', extrato: 'extrato.read', pagamento: 'pagamento-pix.write pagamento-pix.read', boleto: 'boleto-cobranca.write boleto-cobranca.read' };
const escopo = ESCOPOS[String(body.escopo || 'cob')] ? String(body.escopo || 'cob') : 'cob';
const base = String(cfg.inter_ambiente || 'producao') === 'sandbox'
  ? 'https://cdpj-sandbox.partners.uatinter.co'
  : 'https://cdpj.partners.bancointer.com.br';
const sd = $getWorkflowStaticData('global');
sd.inter_tokens = sd.inter_tokens || {};
const cache = sd.inter_tokens[escopo];
if (cache && cache.base === base && Number(cache.exp || 0) > Date.now() + 60000) {
  return [{ json: { ok: true, precisa: false, escopo: escopo, token: cache.token, base: base } }];
}
return [{ json: { ok: true, precisa: true, escopo: escopo, scope: ESCOPOS[escopo], base: base, client_id: String(cfg.inter_client_id).trim(), client_secret: String(cfg.inter_client_secret).trim() } }];
