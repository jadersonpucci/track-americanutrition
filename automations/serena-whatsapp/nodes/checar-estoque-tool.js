// Workflow "[Serena Tool] Checar Estoque" (n8n Vj5dxntje6WrQUqn), POST /webhook/checar-estoque
// {variant_ids: ["4530...","4443..."] | "4530...,4443..."}.
//
// Resposta: { ok, consultado, variantes: [{variant_id, produto, variante, estoque, disponivel}], indisponiveis: [...] }
// ok = true quando TODAS as variantes pedidas estao disponiveis para venda no site.
//
// REGRA DO ESTOQUE (01/10 e 11/10/2026): disponibilidade e o estoque das locations que atendem pedido
// online (location.fulfillsOnlineOrders). As locations de revendedora (Nair, Adriana Bonin, Sonia
// Terezinha, Sonia Cintra, Cristina Matias, MIRIAM PURNHAGEN, Ass. Maracajuense) tem o flag em false e
// nao despacham pedido do site, entao o estoque delas NAO conta como estoque do site nem como
// disponibilidade para vender. availableForSale e inventoryQuantity da Admin API somam todas as
// locations e por isso nao sao usados em lugar nenhum.
//
// Mesma regra em: consultar-produto-estoque-online.js, aviso-estoque.workflow.js (estoqueDe),
// assinatura-tool.js (estoqueOnline) e checkout/nodes/fluxo-a-checar-estoque.js (ESTOQUE-GUARD v2).
// Fluxo: Webhook Estoque -> Montar Query -> Shopify GraphQL (HTTP, 2025-01) -> Formatar Estoque -> Responder.

// ===================== node "Montar Query" =====================
const b = $input.first().json.body || $input.first().json;
let ids = b.variant_ids || b.variants || [];
if (typeof ids === 'string') ids = ids.split(',').map(s => s.trim()).filter(Boolean);
if (!Array.isArray(ids)) ids = [ids];
ids = ids.map(v => String(v).replace(/\D/g, '')).filter(v => v.length >= 10);
if (!ids.length) { throw new Error('variant_ids obrigatorio'); }
const gids = ids.map(v => '"gid://shopify/ProductVariant/' + v + '"').join(',');
// Estoque ONLINE: traz o estoque por location para somar so as que atendem pedidos online (revendedoras ficam de fora).
const query = '{ nodes(ids:[' + gids + ']) { ... on ProductVariant { id title inventoryPolicy product { title status } inventoryItem { tracked inventoryLevels(first:50) { nodes { location { fulfillsOnlineOrders isActive } quantities(names:["available"]) { quantity } } } } } } }';
return [{ json: { query: query, ids: ids } }];

// ===================== node "Formatar Estoque" =====================
const r = $input.first().json;
const ids = $('Montar Query').first().json.ids;
const nos = (r && r.data && Array.isArray(r.data.nodes)) ? r.data.nodes : [];

if (!nos.length) {
  return [{ json: { ok: false, consultado: false, motivo: 'sem_resposta_shopify', variantes: [], indisponiveis: [] } }];
}

// Disponibilidade = estoque so das locations que atendem pedidos online.
// availableForSale/inventoryQuantity somam todas as locations (inclusive revendedoras), por isso nao sao usados.
const variantes = [];
const indisponiveis = [];
for (const n of nos) {
  if (!n || !n.id) continue;
  const vid = String(n.id).split('/').pop();
  const it = n.inventoryItem || {};
  const continua = String(n.inventoryPolicy || '').toUpperCase() === 'CONTINUE' || it.tracked === false;
  let qtd = 0;
  for (const l of ((it.inventoryLevels || {}).nodes || [])) {
    if (!l || !l.location || !l.location.fulfillsOnlineOrders || l.location.isActive === false) continue;
    const q = Number((((l.quantities || [])[0]) || {}).quantity || 0);
    if (q > 0) qtd += q;
  }
  const ativo = !n.product || String(n.product.status || 'ACTIVE').toUpperCase() === 'ACTIVE';
  const disponivel = ativo && (continua || qtd > 0);
  const item = { variant_id: vid, produto: (n.product && n.product.title) || null, variante: n.title || null, estoque: qtd, disponivel: disponivel };
  variantes.push(item);
  if (!disponivel) indisponiveis.push(item);
}

const faltantes = ids.filter(i => !variantes.some(v => v.variant_id === i));
for (const f of faltantes) {
  const item = { variant_id: f, produto: null, variante: null, estoque: null, disponivel: false, motivo: 'variante_inexistente' };
  variantes.push(item);
  indisponiveis.push(item);
}

return [{ json: { ok: indisponiveis.length === 0, consultado: true, variantes: variantes, indisponiveis: indisponiveis } }];
