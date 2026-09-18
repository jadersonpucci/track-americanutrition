// AN-PIX-INTER (set/2026): order_id "inter_<txid>" e cobranca do Banco Inter -> consulta /webhook/pix-inter-status
// e devolve o MESMO contrato ({ order_id, status, paid, order_number }). Qualquer outro order_id segue no Pagar.me.
const item = $input.first();
const q = (item.json && item.json.query) || {};
const oid = String(q.order_id || '');
if (oid.indexOf('inter_') !== 0) { return [{ json: item.json }]; }
let out = { order_id: oid, status: 'pending', paid: false, order_number: null, _via_inter: true };
try {
  const r = await this.helpers.httpRequest({ method: 'GET', url: 'https://n8n.americanutrition.com/webhook/pix-inter-status', qs: { order_id: oid }, json: true, timeout: 50000 });
  if (r && typeof r === 'object') { out.status = r.status || 'pending'; out.paid = r.paid === true; out.order_number = r.order_number || null; }
} catch (e) { }
return [{ json: out }];
