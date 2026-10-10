// Node "Estoque da Loja Online" do workflow "[Serena Tool] Consultar Produto" (n8n hdkG3Ewc9DL3OCiH).
// Entra entre "Filtrar e formatar" e "Erro Shopify?".
//
// POR QUE EXISTE (10/10/2026, caso Rosy +55 77 99153-5477): o inventory_quantity do REST products.json
// soma TODAS as localizacoes, inclusive as de revendedoras (Nair, Adriana Bonin, Sonia Terezinha,
// Ass. Maracajuense, Cristina Matias, MIRIAM PURNHAGEN), que tem fulfillsOnlineOrders = false e portanto
// nao despacham pedido do site. A cliente disse "no site oficial ta como esgotado" e a Serena respondeu
// "conferi agora e aparece disponivel, mas com poucas unidades" e ofereceu link de pagamento: as 2
// unidades do Life Protein estavam com a Nair, e o CD estava zerado.
//
// Aqui o estoque e recalculado somando so o que a loja online consegue despachar.
// Se a consulta falhar, mantem o numero antigo (comportamento anterior) e marca fonte_estoque.
const d = $input.first().json || {};
if (d.erro_shopify || !d.encontrado || !Array.isArray(d.produtos) || !d.produtos.length) { return [{ json: d }]; }

// Allowlist: so localizacoes que atendem pedido do site. Revendedora nova entra fora por padrao.
// (Mercado Livre Full fica de fora de proposito: aquele estoque e do ML, nao vende no nosso site.)
const LOCAIS_ONLINE = ['america nutrition [cd]', 'estados unidos'];
const norml = s => String(s == null ? '' : s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();

const ids = [];
for (const p of d.produtos) { for (const v of (p.variantes || [])) { if (v.variant_id) ids.push('gid://shopify/ProductVariant/' + v.variant_id); } }

const calc = {};
let fonte = 'total_lojas';
const Q = 'query($ids:[ID!]!){ nodes(ids:$ids){ ... on ProductVariant { id inventoryItem { tracked inventoryLevels(first:20){ nodes{ location{ name } quantities(names:["available"]){ quantity } } } } } } }';
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
    // produto sem controle de estoque nao deve ser tratado como esgotado
    if (inv.tracked === false) { calc[vid] = null; continue; }
    let soma = 0;
    for (const lvl of (((inv.inventoryLevels || {}).nodes) || [])) {
      if (LOCAIS_ONLINE.indexOf(norml((lvl.location || {}).name)) < 0) continue;
      for (const qt of (lvl.quantities || [])) { soma += Number(qt.quantity || 0); }
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
