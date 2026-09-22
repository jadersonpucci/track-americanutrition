// ETIQUETA US — compra Shopify Shipping e devolve o PDF
// Caixa padrao: 22 x 13,7 x 4,2 cm | vazia 50 g | 0,32 kg por item
// A etiqueta so pode ser comprada se o fulfillment order estiver no local "Estados Unidos":
// o no "Mover p/ Estados Unidos" ja cuida disso; aqui e so uma rede de seguranca.
const CX = { length: 22, width: 13.7, height: 4.2, unitLen: 'CENTIMETERS', vazio: 50, unitPeso: 'GRAMS', tipo: 'BOX' };
const PESO_ITEM_KG = 0.32;
const US_LOC = 'gid://shopify/Location/73805234348'; // Estados Unidos (Nokomis, FL)
const VARIANTE_US = 'gid://shopify/ProductVariant/46382792933548';
// Envio internacional: a USPS exige codigo SH e pais de origem na declaracao alfandegaria.
const HS_PADRAO = '210690';   // 2106.90 - suplemento alimentar (food preparations n.e.s.)
const ORIGEM_PADRAO = 'US';   // ImunoFosfo e fabricado nos EUA

let created = null;
try { created = $('Create Shopify Order').item.json; } catch(e) {}
const o = created && (created.order || created);
if (!o || !o.id) { return [{ json: { etiqueta_ok: false, motivo: 'sem pedido criado nesta execucao' } }]; }
const br = $('Build Row').item.json;
if (br.addr_missing) { return [{ json: { etiqueta_ok: false, motivo: 'endereco incompleto' } }]; }

const gql = async (query, variables) => {
  const r = await this.helpers.httpRequest({
    method: 'POST',
    url: 'https://n8n.americanutrition.com/webhook/shopify-admin',
    headers: { 'Content-Type': 'application/json', 'User-Agent': 'Mozilla/5.0' },
    body: { acao: 'atualizar_pedido', endpoint: '../2026-07/graphql.json', metodo: 'POST', payload: { query: query, variables: variables } },
    json: true, timeout: 30000
  });
  const d = r && r.dados;
  if (!d) throw new Error('sem resposta do shopify-admin');
  if (d.errors && d.errors.length) throw new Error(JSON.stringify(d.errors).slice(0, 300));
  return d.data;
};

const noUS = function(n){ return !!(n && n.assignedLocation && n.assignedLocation.location && n.assignedLocation.location.id === US_LOC); };
const out = { etiqueta_ok: false, motivo: '', label_url: '', tracking_number: '', tracking_company: '', tracking_url: '', customs_aviso: '', carrier_aviso: '', transportadora_pedida: '' };
try {
  const oid = 'gid://shopify/Order/' + o.id;
  const q1 = await gql('query($id:ID!){ order(id:$id){ fulfillmentOrders(first:10){ nodes{ id status assignedLocation{ location{ id name } } } } } }', { id: oid });
  const nodes = (((q1 || {}).order || {}).fulfillmentOrders || {}).nodes || [];
  const abertos = nodes.filter(function(n){ return n.status === 'OPEN' || n.status === 'IN_PROGRESS'; });
  let alvo = abertos.filter(noUS)[0] || abertos[0] || nodes[0];
  if (!alvo) throw new Error('fulfillment order nao encontrado');
  if (!noUS(alvo)) {
    // Rede de seguranca: se por algum motivo ainda nao esta no local Estados Unidos, move agora.
    const m = await gql('mutation($id:ID!,$loc:ID!){ fulfillmentOrderMove(id:$id,newLocationId:$loc){ movedFulfillmentOrder{ id status assignedLocation{ location{ id name } } } userErrors{ field message } } }', { id: alvo.id, loc: US_LOC });
    const pm = (m || {}).fulfillmentOrderMove || {};
    if (pm.userErrors && pm.userErrors.length) throw new Error('nao foi possivel mover pro local Estados Unidos: ' + pm.userErrors.map(function(e){ return e.message; }).join(' | '));
    if (!pm.movedFulfillmentOrder || !noUS(pm.movedFulfillmentOrder)) throw new Error('pedido nao esta no local Estados Unidos');
    alvo = pm.movedFulfillmentOrder;
  }

  // Sem HS code e pais de origem no inventory item, a compra falha com
  // "Missing harmonized system code. | Missing country of origin." (caso real: AN-15573, Paris/FR).
  let paisEnv = '';
  try { paisEnv = String((((br.order_payload || {}).order || {}).shipping_address || {}).country || ''); } catch (e) {}
  const ehIntl = !!paisEnv.trim() && !/^(united states|usa|u\.s\.a?\.?|us|estados unidos)$/i.test(paisEnv.trim());
  if (ehIntl) {
    const qv = await gql('query($id:ID!){ productVariant(id:$id){ inventoryItem{ id harmonizedSystemCode countryCodeOfOrigin } } }', { id: VARIANTE_US });
    const ii = ((qv || {}).productVariant || {}).inventoryItem || {};
    const faltaHs = !ii.harmonizedSystemCode;
    const faltaOrigem = !ii.countryCodeOfOrigin;
    if (ii.id && (faltaHs || faltaOrigem)) {
      const upd = {};
      if (faltaHs) upd.harmonizedSystemCode = HS_PADRAO;
      if (faltaOrigem) upd.countryCodeOfOrigin = ORIGEM_PADRAO;
      const mu = await gql('mutation($id:ID!,$input:InventoryItemInput!){ inventoryItemUpdate(id:$id,input:$input){ inventoryItem{ harmonizedSystemCode countryCodeOfOrigin } userErrors{ field message } } }', { id: ii.id, input: upd });
      const r = (mu || {}).inventoryItemUpdate || {};
      const ue = r.userErrors || [];
      out.customs_aviso = ue.length
        ? 'nao consegui preencher os dados alfandegarios: ' + ue.map(function (e) { return e.message; }).join(' | ')
        : 'dados alfandegarios preenchidos automaticamente (HS ' + ((r.inventoryItem || {}).harmonizedSystemCode || HS_PADRAO) + ', origem ' + ((r.inventoryItem || {}).countryCodeOfOrigin || ORIGEM_PADRAO) + ') - confira na ficha do produto';
    }
  }

  const qty = Number(br.qty) || 1;
  const totalKg = Math.round((PESO_ITEM_KG * qty + CX.vazio / 1000) * 1000) / 1000;
  const input = {
    fulfillmentOrderId: alvo.id,
    shippingDatetime: new Date().toISOString(),
    notifyCustomer: true,
    packageInfo: { customPackage: { type: CX.tipo, weight: { value: CX.vazio, unit: CX.unitPeso }, dimensions: { length: CX.length, width: CX.width, height: CX.height, unit: CX.unitLen } } },
    totalWeight: { value: totalKg, unit: 'KILOGRAMS' }
  };
  // TRANSPORTADORA: comprar o que o cliente escolheu e pagou no checkout.
  // Sem preferredRateSelection a Shopify compra a tarifa que ela escolher: no AN-15573 o
  // cliente pagou USPS First Class Package International e a etiqueta saiu UPS, mais caro.
  // Se a transportadora pedida nao tiver tarifa para o pacote, compra a padrao para nao
  // perder a etiqueta, e o aviso do Paulo diz que caiu no plano B.
  const shipTitulo = (function () {
    try { const sl = (((br.order_payload || {}).order || {}).shipping_lines || [])[0] || {}; return String(sl.title || ''); } catch (e) { return ''; }
  })();
  let carrierPref = '';
  if (/usps|first class|priority mail|parcel select|ground advantage|media mail|retail ground/i.test(shipTitulo)) carrierPref = 'usps';
  else if (/dhl/i.test(shipTitulo)) carrierPref = 'dhl_express';
  else if (/fedex/i.test(shipTitulo)) carrierPref = 'fedex';
  else if (/\bups\b/i.test(shipTitulo)) carrierPref = 'ups_shipping';

  const MUT = 'mutation($input:ShippingLabelPurchaseInput!){ shippingLabelPurchase(shippingLabelPurchase:$input){ shippingLabelPurchaseResult{ id status } userErrors{ field message } } }';
  const Q_JOB = 'query($id:ID!){ node(id:$id){ ... on ShippingLabelPurchaseResult { status done errors{ code message } shippingLabels{ id trackingInfo{ number company url } shippingDocuments{ url format documentType } } } } }';
  const comprar = async function (carrier) {
    const inp = Object.assign({}, input);
    if (carrier) inp.preferredRateSelection = { carrierCode: carrier };
    const mut = await gql(MUT, { input: inp });
    const pay = (mut || {}).shippingLabelPurchase || {};
    if (pay.userErrors && pay.userErrors.length) throw new Error(pay.userErrors.map(function (e) { return e.message; }).join(' | '));
    const jobId = (pay.shippingLabelPurchaseResult || {}).id;
    if (!jobId) throw new Error('mutation nao retornou job id');
    let r = null;
    for (let i = 0; i < 20; i++) {
      await new Promise(function (ok) { setTimeout(ok, 3000); });
      const q2 = await gql(Q_JOB, { id: jobId });
      r = (q2 || {}).node || null;
      if (r && (r.status === 'PURCHASED' || r.status === 'PURCHASE_FAILED')) break;
    }
    if (!r) throw new Error('sem retorno do polling');
    if (r.status !== 'PURCHASED') throw new Error('compra falhou: ' + ((r.errors || []).map(function (e) { return e.message; }).join(' | ') || r.status));
    return r;
  };

  let res = null;
  if (carrierPref) {
    try {
      res = await comprar(carrierPref);
      out.transportadora_pedida = carrierPref;
    } catch (e1) {
      out.carrier_aviso = 'sem tarifa ' + carrierPref + ' para este pacote (' + String((e1 && e1.message) || e1).slice(0, 120) + '); comprei a tarifa padrao da Shopify - confira o custo';
      res = await comprar('');
    }
  } else {
    res = await comprar('');
  }
  const lbl = (res.shippingLabels || [])[0] || {};
  const doc = (lbl.shippingDocuments || []).filter(function(d){ return d.url; })[0] || {};
  const ti = lbl.trackingInfo || {};
  out.etiqueta_ok = !!doc.url;
  out.label_url = doc.url || '';
  out.tracking_number = ti.number || '';
  out.tracking_company = ti.company || '';
  out.tracking_url = ti.url || '';
  if (!doc.url) out.motivo = 'comprada mas sem PDF disponivel';
} catch (err) {
  out.etiqueta_ok = false;
  out.motivo = String((err && err.message) || err).slice(0, 200);
}
return [{ json: out }];

