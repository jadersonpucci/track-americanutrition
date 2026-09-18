// Callback do Inter: { pix: [ { txid, endToEndId, valor, horario, ... } ] }. Nada e confiado do corpo: cada txid e
// verificado direto no Inter pelo /webhook/pix-inter-confirmar (que tambem cria o pedido na Shopify).
const BASE = 'https://n8n.americanutrition.com';
const self = this;
const root = $input.first().json || {};
const body = root.body || root;
let lista = [];
if (Array.isArray(body)) lista = body;
else if (body && Array.isArray(body.pix)) lista = body.pix;
else if (body && body.txid) lista = [body];
const out = [];
for (const p of lista) {
  const txid = String((p && p.txid) || '').replace(/[^a-zA-Z0-9]/g, '');
  if (!txid) continue;
  try {
    const r = await self.helpers.httpRequest({ method: 'POST', url: BASE + '/webhook/pix-inter-confirmar', json: true, timeout: 60000, body: { txid: txid, force: true } });
    out.push({ txid: txid, paid: !!(r && r.paid), status: r && r.status, erro: r && r.erro });
  } catch (e) { out.push({ txid: txid, erro: String(e && e.message || e).slice(0, 200) }); }
}
return [{ json: { recebidos: lista.length, resultados: out } }];
