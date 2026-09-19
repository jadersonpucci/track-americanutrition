// Callback do Inter (Cobranca v3): lista de eventos { codigoSolicitacao, seuNumero, situacao, ... }. Nada e confiado do corpo:
// cada codigo e verificado no Inter pelo /webhook/boleto-inter-confirmar (que cria o pedido e lanca no Nibo).
const BASE = 'https://n8n.americanutrition.com';
const self = this;
const root = $('BWebhook: Requisição').first().json || {};
const body = root.body || root;
let lista = [];
if (Array.isArray(body)) lista = body;
else if (body && Array.isArray(body.cobrancas)) lista = body.cobrancas;
else if (body && body.codigoSolicitacao) lista = [body];
const out = [];
for (const p of lista) {
  const cod = String((p && p.codigoSolicitacao) || '').replace(/[^a-zA-Z0-9-]/g, '');
  if (!cod) continue;
  const item = { codigo: cod, situacao: p.situacao || '' };
  try {
    const r = await self.helpers.httpRequest({ method: 'POST', url: BASE + '/webhook/boleto-inter-confirmar', json: true, timeout: 90000, body: { codigo: cod, force: true } });
    item.paid = !!(r && r.paid); item.status = r && r.status; item.erro = r && r.erro; item.nibo = r && r.nibo;
  } catch (e) { item.erro = String(e && e.message || e).slice(0, 200); }
  out.push(item);
}
return [{ json: { recebidos: lista.length, resultados: out } }];
