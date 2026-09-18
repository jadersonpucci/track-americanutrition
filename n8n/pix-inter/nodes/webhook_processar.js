// Callback do Inter: { pix: [ { txid, endToEndId, valor, horario, infoPagador, ... } ] }. Nada e confiado do corpo: cada txid e
// verificado direto no Inter pelo /webhook/pix-inter-confirmar (que tambem cria o pedido na Shopify). Cada PIX recebido
// tambem vai para o Nibo via /webhook/inter-nibo-lancar (dedupe por endToEndId).
const BASE = 'https://n8n.americanutrition.com';
const self = this;
const cfg = ($input.first().json || {}).cfg || {};
const root = $('Inter Webhook: Requisição').first().json || {};
const body = root.body || root;
let lista = [];
if (Array.isArray(body)) lista = body;
else if (body && Array.isArray(body.pix)) lista = body.pix;
else if (body && body.txid) lista = [body];
const out = [];
for (const p of lista) {
  const txid = String((p && p.txid) || '').replace(/[^a-zA-Z0-9]/g, '');
  const e2e = String((p && p.endToEndId) || '').trim();
  const item = { txid: txid, e2e: e2e };
  if (txid) {
    try {
      const r = await self.helpers.httpRequest({ method: 'POST', url: BASE + '/webhook/pix-inter-confirmar', json: true, timeout: 60000, body: { txid: txid, force: true } });
      item.paid = !!(r && r.paid); item.status = r && r.status; item.erro = r && r.erro;
    } catch (e) { item.erro = String(e && e.message || e).slice(0, 200); }
  }
  if (e2e && Number(p.valor) > 0 && cfg.pix_admin_token) {
    try {
      const pg = (p.pagador && typeof p.pagador === 'object') ? p.pagador : {};
      const l = await self.helpers.httpRequest({ method: 'POST', url: BASE + '/webhook/inter-nibo-lancar', json: true, timeout: 45000, body: {
        k: cfg.pix_admin_token, chave: 'pix:' + e2e, origem: 'pix_webhook', tipo: 'PIX', valor: Number(p.valor), data: p.horario || '',
        nome: pg.nome || '', documento: pg.cpf || pg.cnpj || '', descricao: String(p.infoPagador || '').slice(0, 140),
        referencia: e2e, txid: txid, end_to_end_id: e2e, detalhes: { chave: p.chave || '' }
      } });
      item.nibo = (l && (l.lancado ? 'lancado' : l.duplicado ? 'duplicado' : l.ignorado ? 'ignorado' : ('erro: ' + (l.erro || '')))) || 'sem resposta';
    } catch (e) { item.nibo = 'erro: ' + String(e && e.message || e).slice(0, 150); }
  }
  out.push(item);
}
return [{ json: { recebidos: lista.length, resultados: out } }];
