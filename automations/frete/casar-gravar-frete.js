// Code node "Casar e Gravar Frete" do workflow Frete Envia Reconciliacao (SFKUuIXrSv1zV0El), cron 1h.
// Grava vendas.frete_real (custo da etiqueta) e vendas.frete_origem.
//
// 1) ENVIA: custo real da etiqueta (queries /v4/orders, shipment.total_cost) -> frete_origem 'envia'.
// 2) FRENET (26/10/2026, pedido do Jaderson): desde 22/10 parte das etiquetas sai pela Frenet e ficava com frete 0
//    no painel. A API da Frenet que lista os envios com valor (whitelabel /orders, /wallet/demonstrative) exige
//    token de parceiro, que ainda nao temos. Enquanto isso o custo e ESTIMADO pela cotacao da propria Frenet
//    (api.frenet.com.br/shipping/quote) no mesmo servico da etiqueta (AE... = SEDEX 03220, AP... = PAC 03298),
//    de Santos para o CEP do cliente, com o peso do pedido -> frete_origem 'frenet_cotacao'.
//    Vale para fulfillment com empresa "Frenet" e para codigo dos Correios que nao esta no Envia.
// Pedidos dos EUA (USPS/UPS, etiqueta da Shopify Shipping) ficam de fora.
const SUPA = 'https://supabase.americanutrition.com';
const KEY = 'SUPABASE_SERVICE_KEY';
const FRENET_TOKEN = '<FRENET_TOKEN>';
const H = { apikey: KEY, Authorization: 'Bearer ' + KEY };
const CEP_ORIGEM = '11060230';           // CD Santos
const PESO_ITEM = 0.32, PESO_CAIXA = 0.05; // kg (mesma caixa da etiqueta US: 22 x 13,7 x 4,2 cm por frasco)

function norm(s) { return String(s || '').trim().toUpperCase().replace(/-BR$/, ''); }

function freteDoOrder(o) {
  let soma = 0, achou = false, tracking = null, servico = null;
  const sd = (o && o.shipment_data) || {};
  const locs = Array.isArray(sd.locations) ? sd.locations : [];
  for (const loc of locs) {
    const pkgs = Array.isArray(loc && loc.packages) ? loc.packages : [];
    for (const p of pkgs) {
      const sh = p && p.shipment;
      if (sh && sh.total_cost != null && !isNaN(Number(sh.total_cost))) {
        soma += Number(sh.total_cost);
        achou = true;
        if (!tracking && sh.tracking_number) tracking = sh.tracking_number;
        if (!servico && sh.service_name) servico = sh.service_name;
      }
    }
  }
  return { soma: Math.round(soma * 100) / 100, achou, tracking, servico };
}

const patch = async (pid, body) => this.helpers.httpRequest({
  method: 'PATCH', url: SUPA + '/rest/v1/vendas?pedido_id=eq.' + encodeURIComponent(pid),
  headers: Object.assign({}, H, { 'Content-Type': 'application/json', Prefer: 'return=minimal' }), body, json: true });

// 1) orders do Envia -> mapa por pedido normalizado (prioriza quem tem frete)
const item = $input.first().json || {};
const orders = Array.isArray(item.orders_info) ? item.orders_info : [];
const mapa = {};
for (const o of orders) {
  const nome = o && o.order && o.order.name;
  if (!nome) continue;
  const k = norm(nome);
  const f = freteDoOrder(o);
  if (!mapa[k] || (f.achou && !mapa[k].achou)) mapa[k] = { nome, frete: f.soma, achou: f.achou, tracking: f.tracking, servico: f.servico };
}

// 2) vendas pendentes de frete (frete_real=0, nao ML, nao editado manual, ultimos 45d)
const cutoff = new Date(Date.now() - 45 * 24 * 60 * 60 * 1000).toISOString();
let pendentes = [];
try {
  pendentes = await this.helpers.httpRequest({ method: 'GET', url: SUPA + '/rest/v1/vendas?select=pedido_id&frete_real=eq.0&canal=neq.mercado_livre&editado_manual=eq.false&data_pedido=gte.' + encodeURIComponent(cutoff), headers: H, json: true });
} catch (e) { return [{ json: { erro: 'falha ao buscar pendentes', detalhe: String(e) } }]; }
if (!Array.isArray(pendentes)) pendentes = [];

const atualizados = [], semEtiqueta = [], semMatch = [], restantes = [];
for (const v of pendentes) {
  const pid = v.pedido_id;
  const hit = mapa[norm(pid)];
  if (hit && hit.achou && hit.frete > 0) {
    try { await patch(pid, { frete_real: hit.frete, frete_origem: 'envia', status: 'fechado' }); atualizados.push({ pedido: pid, frete: hit.frete, origem: 'envia', servico: hit.servico, tracking: hit.tracking }); }
    catch (e) { semMatch.push(pid + ' (erro patch: ' + String(e) + ')'); }
    continue;
  }
  restantes.push(pid);
}

// 3) o que nao achou etiqueta no Envia: olha a Shopify; se a etiqueta e da Frenet (ou Correios fora do Envia), cota na Frenet
const gql = async (query, variables) => {
  const r = await this.helpers.httpRequest({ method: 'POST', url: 'https://n8n.americanutrition.com/webhook/shopify-admin', json: true, timeout: 30000,
    headers: { 'Content-Type': 'application/json', 'User-Agent': 'Mozilla/5.0' },
    body: { acao: 'atualizar_pedido', endpoint: '../2026-07/graphql.json', metodo: 'POST', payload: { query, variables } } });
  return (r && r.dados && r.dados.data) || {};
};
const Q = 'query($q:String!){ orders(first:50, query:$q){ nodes{ name subtotalPriceSet{ shopMoney{ amount } } shippingAddress{ zip countryCodeV2 } lineItems(first:30){ nodes{ quantity } } fulfillments(first:5){ status trackingInfo{ company number } } } } }';
const frenet = [], foraBR = [];
for (let i = 0; i < restantes.length; i += 40) {
  const lote = restantes.slice(i, i + 40);
  let nodes = [];
  try { const d = await gql(Q, { q: lote.map(p => 'name:' + p).join(' OR ') }); nodes = ((d.orders || {}).nodes) || []; } catch (e) { nodes = []; }
  const porNome = {};
  for (const n of nodes) porNome[norm(n.name)] = n;
  for (const pid of lote) {
    const o = porNome[norm(pid)];
    if (!o) { (mapa[norm(pid)] ? semEtiqueta : semMatch).push(pid); continue; }
    const pais = String((o.shippingAddress || {}).countryCodeV2 || 'BR');
    const trk = [];
    for (const f of (o.fulfillments || [])) { if (String(f.status || '').toUpperCase() === 'CANCELLED') continue; for (const t of (f.trackingInfo || [])) trk.push(t); }
    const t = trk.find(x => /^[A-Z]{2}\d{9}BR$/i.test(String(x.number || '').trim()));
    if (pais !== 'BR' || trk.some(x => /usps|ups|fedex|dhl/i.test(String(x.company || '')))) { foraBR.push(pid); continue; }
    const ehFrenet = trk.some(x => /frenet/i.test(String(x.company || '')));
    if (!t || (!ehFrenet && mapa[norm(pid)] && mapa[norm(pid)].achou)) { semEtiqueta.push(pid); continue; }
    const codigo = String(t.number).trim().toUpperCase();
    const servico = /^AP/.test(codigo) ? '03298' : '03220';   // AP = PAC; AE/AD/demais = SEDEX
    const qtd = Math.max(1, (o.lineItems && o.lineItems.nodes || []).reduce((s, l) => s + Number(l.quantity || 0), 0));
    frenet.push({ pid, codigo, servico, cep: String((o.shippingAddress || {}).zip || '').replace(/\D/g, ''), qtd, valor: Number(((o.subtotalPriceSet || {}).shopMoney || {}).amount || 0), ehFrenet });
  }
}
for (const f of frenet) {
  if (f.cep.length !== 8) { semEtiqueta.push(f.pid + ' (cep invalido)'); continue; }
  let preco = null;
  try {
    const d = await this.helpers.httpRequest({ method: 'POST', url: 'https://api.frenet.com.br/shipping/quote', json: true, timeout: 40000, headers: { token: FRENET_TOKEN },
      body: { SellerCEP: CEP_ORIGEM, RecipientCEP: f.cep, ShipmentInvoiceValue: Math.max(f.valor, 24), ShippingServiceCode: f.servico, RecipientCountry: 'BR',
        ShippingItemArray: [{ Height: Math.round(4.2 * f.qtd * 10) / 10, Length: 22, Width: 13.7, Quantity: 1, Weight: Math.round((PESO_ITEM * f.qtd + PESO_CAIXA) * 1000) / 1000 }] } });
    const s = ((d && d.ShippingSevicesArray) || []).find(x => x.ServiceCode === f.servico && !x.Error);
    preco = s ? Number(s.ShippingPrice) : null;
  } catch (e) { preco = null; }
  if (!(preco > 0)) { semEtiqueta.push(f.pid + ' (cotacao frenet falhou)'); continue; }
  preco = Math.round(preco * 100) / 100;
  try { await patch(f.pid, { frete_real: preco, frete_origem: 'frenet_cotacao', status: 'fechado' }); atualizados.push({ pedido: f.pid, frete: preco, origem: 'frenet_cotacao', servico: f.servico === '03298' ? 'PAC' : 'SEDEX', tracking: f.codigo }); }
  catch (e) { semMatch.push(f.pid + ' (erro patch: ' + String(e) + ')'); }
}

return [{ json: {
  ok: true,
  orders_envia: orders.length,
  pendentes: pendentes.length,
  atualizados_qtd: atualizados.length,
  atualizados_envia: atualizados.filter(a => a.origem === 'envia').length,
  atualizados_frenet: atualizados.filter(a => a.origem === 'frenet_cotacao').length,
  atualizados,
  fora_br: foraBR,
  sem_etiqueta_qtd: semEtiqueta.length,
  sem_etiqueta: semEtiqueta,
  sem_match_qtd: semMatch.length,
  sem_match: semMatch,
} }];
