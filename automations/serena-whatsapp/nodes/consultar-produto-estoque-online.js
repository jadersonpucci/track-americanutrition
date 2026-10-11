// Node "Estoque da Loja Online" do workflow "[Serena Tool] Consultar Produto" (n8n hdkG3Ewc9DL3OCiH).
// Entra entre "Filtrar e formatar" e "Erro Shopify?".
//
// POR QUE EXISTE (10/10/2026, caso Rosy +55 77 99153-5477): o inventory_quantity do REST products.json
// soma TODAS as localizacoes, inclusive as de revendedoras (Nair, Adriana Bonin, Sonia Terezinha,
// Sonia Cintra, Cristina Matias, MIRIAM PURNHAGEN, Ass. Maracajuense), que tem fulfillsOnlineOrders = false
// e portanto nao despacham pedido do site. A cliente disse "no site oficial ta como esgotado" e a Serena
// respondeu "conferi agora e aparece disponivel, mas com poucas unidades" e ofereceu link de pagamento:
// as 2 unidades do Life Protein estavam com a Nair, e o CD estava zerado.
//
// REGRA GERAL (11/10/2026, Jaderson): "revendedora nao pode ser considerado estoque no site nem
// disponibilidade pra vender". A conta usa o proprio flag da Shopify (location.fulfillsOnlineOrders),
// a mesma regra do /webhook/checar-estoque, do [Serena] Avise-me Quando Voltar, do ESTOQUE-GUARD do
// checkout e da ferramenta de assinatura. Revendedora nova entra de fora sozinha, sem mexer em codigo.
// Se a consulta falhar, mantem o numero antigo (comportamento anterior) e marca fonte_estoque.
const d = $input.first().json || {};
if (d.erro_shopify || !d.encontrado || !Array.isArray(d.produtos) || !d.produtos.length) { return [{ json: d }]; }

const ids = [];
for (const p of d.produtos) { for (const v of (p.variantes || [])) { if (v.variant_id) ids.push('gid://shopify/ProductVariant/' + v.variant_id); } }

const calc = {};
let fonte = 'total_lojas';
const Q = 'query($ids:[ID!]!){ nodes(ids:$ids){ ... on ProductVariant { id inventoryPolicy inventoryItem { tracked inventoryLevels(first:50){ nodes{ location{ fulfillsOnlineOrders isActive } quantities(names:["available"]){ quantity } } } } } } }';
for (let i = 0; i < ids.length; i += 50) {
  let r = null;
  try {
    r = await this.helpers.httpRequest({ method: 'POST', url: 'https://n8n.americanutrition.com/webhook/shopify-admin', json: true, timeout: 30000,
      headers: { 'Content-Type': 'application/json', 'User-Agent': 'Mozilla/5.0' },
      body: { acao: 'atualizar_pedido', endpoint: '../2026-07/graphql.json', metodo: 'POST', payload: { query: Q, variables: { ids: ids.slice(i, i + 50) } } } });
  } catch (e) { r = null; }
  const nodes = (((r || {}).dados || {}).data || {}).nodes || [];
  if (!nodes.length) continue;
  fonte = 'loja_online';
  for (const n of nodes) {
    if (!n || !n.id) continue;
    const inv = n.inventoryItem || {};
    const vid = String(n.id).split('/').pop();
    // sem controle de estoque ou politica CONTINUE: nunca tratar como esgotado
    if (inv.tracked === false || String(n.inventoryPolicy || '').toUpperCase() === 'CONTINUE') { calc[vid] = null; continue; }
    let soma = 0;
    for (const lvl of (((inv.inventoryLevels || {}).nodes) || [])) {
      if (!lvl || !lvl.location || !lvl.location.fulfillsOnlineOrders || lvl.location.isActive === false) continue;
      for (const qt of (lvl.quantities || [])) { const q = Number(qt.quantity || 0); if (q > 0) soma += q; }
    }
    calc[vid] = soma;
  }
}

const produtos = d.produtos.map(p => Object.assign({}, p, {
  variantes: (p.variantes || []).map(v => {
    const q = calc[String(v.variant_id)];
    if (q === undefined) return v;                       // nao veio na consulta: mantem o que tinha
    if (q === null) return Object.assign({}, v, { disponivel: true });   // sem controle de estoque
    return Object.assign({}, v, { estoque: q, disponivel: q > 0 });
  })
}));

return [{ json: Object.assign({}, d, { produtos: produtos, fonte_estoque: fonte }) }];
