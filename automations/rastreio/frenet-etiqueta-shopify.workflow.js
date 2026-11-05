// n8n Workflow SDK — [Rastreio] Etiqueta Frenet -> Shopify (a cada 5 min)
// Assim que a etiqueta e gerada na Frenet, o pedido e marcado como enviado na Shopify com o codigo de rastreio
// (link track.americanutrition.com) e o cliente recebe o email de envio, sem esperar a sincronizacao do app da Frenet.
// Frenet: GET whitelabel.apifrenet.com.br/v1/shipments (headers token + x-partner-token, na credencial
// "Frenet API" do tipo Custom Auth no n8n; os tokens nunca entram no repositorio).
// Seguranca: so pedidos da Shopify NAO enviados, nao cancelados, com ate 20 dias, ate 15 por rodada.
// Pedido que ja foi marcado (por este fluxo, pelo app da Frenet ou pela equipe) e ignorado.
import { workflow, node, trigger, sticky } from '@n8n/workflow-sdk';

const relogio = trigger({ type: 'n8n-nodes-base.scheduleTrigger', version: 1.2, config: { name: 'A cada 5 min', parameters: { rule: { interval: [{ field: 'minutes', minutesInterval: 5 }] } } } });

const frenet = node({ type: 'n8n-nodes-base.httpRequest', version: 4.2, config: { name: 'Frenet envios', parameters: {
  method: 'GET',
  url: 'https://whitelabel.apifrenet.com.br/v1/shipments?page=1&per_page=100',
  authentication: 'genericCredentialType',
  genericAuthType: 'httpCustomAuth',
  options: { timeout: 30000 } } } });

const CODIGO = `
const SIMULAR = false;          // true = so lista o que faria
const MAX_POR_RODADA = 15;
const MAX_IDADE_DIAS = 20;
const TRACK = 'https://track.americanutrition.com/';
const TRANSP = { COR: 'Correios', JAD: 'Jadlog', JET: 'J&T Express', JT: 'J&T Express', LOG: 'Loggi' };

const lista = ($input.first().json.shipments) || [];
const limpa = t => String(t || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

// Envios com etiqueta, de pedidos da Shopify (orderId numerico). Status 1 = aguardando pagamento, 7 e 9 = cancelado/estornado.
const porPedido = {};
for (const s of lista) {
  if (!/^[0-9]{10,}$/.test(String(s.orderId))) continue;
  if ([1, 7, 9].indexOf(Number(s.shipmentStatus)) >= 0) continue;
  const codigos = (s.volumes || []).filter(v => v.labelId && v.labelExpired !== true).map(v => limpa(v.labelId)).filter(Boolean);
  if (!codigos.length) continue;
  const p = porPedido[s.orderId] || (porPedido[s.orderId] = { codigos: [], transp: null, shipments: [] });
  codigos.forEach(c => { if (p.codigos.indexOf(c) < 0) p.codigos.push(c); });
  p.transp = p.transp || TRANSP[String((s.quotation || {}).carrierCode || '').toUpperCase()] || null;
  p.shipments.push(s.shipmentId);
}
const ids = Object.keys(porPedido);
if (!ids.length) return [{ json: { feitos: 0, motivo: 'nenhuma etiqueta nova' } }];

const gql = async (query, variables) => {
  const r = await this.helpers.httpRequest({ method: 'POST', url: 'https://n8n.americanutrition.com/webhook/shopify-admin', json: true, timeout: 30000,
    headers: { 'Content-Type': 'application/json' },
    body: { acao: 'atualizar_pedido', endpoint: '../2026-07/graphql.json', metodo: 'POST', payload: { query: query, variables: variables || {} } } });
  return ((r || {}).dados || {});
};

const res = await gql('query($ids:[ID!]!){nodes(ids:$ids){... on Order{id name createdAt cancelledAt displayFulfillmentStatus fulfillmentOrders(first:10){nodes{id status supportedActions{action}}}}}}',
  { ids: ids.map(i => 'gid://shopify/Order/' + i) });
const pedidos = ((res.data || {}).nodes || []).filter(Boolean);

const limite = Date.now() - MAX_IDADE_DIAS * 86400000;
const saida = [];
let feitos = 0;
for (const o of pedidos) {
  if (feitos >= MAX_POR_RODADA) break;
  // IN_PROGRESS e o normal aqui (pedido em separacao). ON_HOLD e PARTIALLY_FULFILLED ficam para a equipe.
  if (o.cancelledAt || ['UNFULFILLED', 'IN_PROGRESS', 'OPEN', 'PENDING_FULFILLMENT'].indexOf(o.displayFulfillmentStatus) < 0) continue;
  if (new Date(o.createdAt).getTime() < limite) { saida.push({ json: { pedido: o.name, pulado: 'mais de ' + MAX_IDADE_DIAS + ' dias' } }); continue; }
  const p = porPedido[o.id.split('/').pop()];
  const fos = (o.fulfillmentOrders.nodes || []).filter(f => (f.status === 'OPEN' || f.status === 'IN_PROGRESS') && (f.supportedActions || []).some(a => a.action === 'CREATE_FULFILLMENT'));
  if (!fos.length) { saida.push({ json: { pedido: o.name, pulado: 'sem fulfillment order aberta' } }); continue; }
  const tracking = { numbers: p.codigos, urls: p.codigos.map(c => TRACK + c) };
  if (p.transp) tracking.company = p.transp;
  if (SIMULAR) { saida.push({ json: { pedido: o.name, simulado: true, codigos: p.codigos, transportadora: p.transp } }); feitos++; continue; }
  const m = await gql('mutation($f:FulfillmentInput!){fulfillmentCreate(fulfillment:$f){fulfillment{id status} userErrors{field message}}}',
    { f: { lineItemsByFulfillmentOrder: fos.map(f => ({ fulfillmentOrderId: f.id })), trackingInfo: tracking, notifyCustomer: true } });
  const r = ((m.data || {}).fulfillmentCreate) || {};
  const erros = (r.userErrors || []).map(e => e.message);
  saida.push({ json: { pedido: o.name, codigos: p.codigos, transportadora: p.transp, ok: !erros.length && !!r.fulfillment, erros: erros, frenet: p.shipments } });
  feitos++;
}
return saida.length ? saida : [{ json: { feitos: 0, motivo: 'etiquetas ja estao na Shopify' } }];
`;

const shopify = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Etiquetas para Shopify', parameters: { jsCode: CODIGO } } });

const nota = sticky('## Etiqueta Frenet -> Shopify\n\nA cada 5 min le os ultimos 100 envios da Frenet. Etiqueta nova de pedido da Shopify ainda nao enviado (ate 20 dias, nao cancelado) vira envio na Shopify com o codigo e o link track.americanutrition.com, avisando o cliente. Pedido ja enviado e ignorado. Credencial: Frenet API (Custom Auth com os headers token e x-partner-token).');

export default workflow('rastreio-frenet-shopify', '[Rastreio] Etiqueta Frenet -> Shopify', { settings: { executionOrder: 'v1' } })
  .add(relogio).to(frenet).to(shopify)
  .add(nota);
