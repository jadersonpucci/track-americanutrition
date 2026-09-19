// Mesmo contrato do /webhook/pagarme-status: { order_id, status, paid, order_number }. order_id = interb_<codigoSolicitacao>.
const BASE = 'https://n8n.americanutrition.com';
const self = this;
const row = ($input.first().json || {}).cobranca || null;
const q = $('BStatus: Requisição').first().json.query || {};
const oid = String(q.order_id || '');
const cod = oid.replace(/^interb_/, '');
if (!row) return [{ json: { order_id: oid, status: 'not_found', paid: false, order_number: null, salvar: '', codigo: cod } }];
let paid = !!row.confirmado_em;
if (!paid) {
  try {
    const r = await self.helpers.httpRequest({ method: 'POST', url: BASE + '/webhook/boleto-inter-confirmar', json: true, timeout: 45000, body: { codigo: cod } });
    paid = !!(r && r.paid);
  } catch (e) { paid = false; }
}
let numero = row.pedido_shopify || null;
if (paid && !numero) {
  try {
    const desde = new Date(Date.now() - 12 * 3600000).toISOString();
    const email = String(row.email || '').replace(/["\\]/g, '');
    const filtro = 'created_at:>' + desde + (email ? ' email:' + email : '');
    const query = '{ orders(first: 25, sortKey: CREATED_AT, reverse: true, query: ' + JSON.stringify(filtro) + ') { nodes { name customAttributes { key value } } } }';
    const r = await self.helpers.httpRequest({ method: 'POST', url: BASE + '/webhook/shopify-admin', json: true, timeout: 15000, body: { acao: 'atualizar_pedido', endpoint: 'graphql.json', metodo: 'POST', payload: { query: query } } });
    const nodes = (r && r.dados && r.dados.data && r.dados.data.orders && r.dados.data.orders.nodes) || [];
    const hit = nodes.find(o => (o.customAttributes || []).some(a => a.key === 'pagarme_order' && a.value === 'interb_' + cod));
    if (hit && hit.name) numero = hit.name;
  } catch (e) { }
}
return [{ json: { order_id: oid, status: paid ? 'paid' : 'pending', paid: paid, order_number: numero, codigo: cod, salvar: (paid && numero && !row.pedido_shopify) ? numero : '' } }];
