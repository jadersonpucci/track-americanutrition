// No "Sincronizar" do workflow "Stripe | Sync produtos Shopify" (cron diario 05:10 BRT + POST /webhook/stripe-sync-produtos).
// 24/11/2026, pedido do Jaderson: cada variante ativa da Shopify vira um produto na Stripe, com o preco em reais e o
// shopify_variant_id no metadata. E isso que liga o link de pagamento ao pedido: o robo do link pago le o metadata do
// produto para montar o pedido na Shopify.
// - cria o que falta; se o preco da Shopify mudou, cria o preco novo, troca o default_price e arquiva o antigo;
// - nome e imagem acompanham a Shopify;
// - fora: produtos (USA) (vendidos em dolar pelo checkout US), variantes sem preco.
// A Stripe e chamada pela ponte interna (Stripe | API interna); a chave nao fica aqui.
const API = 'https://n8n.americanutrition.com/webhook/stripe-api-interna';
const T = 'TOKEN_STRIPE_INTERNO';
const SHOP = 'https://n8n.americanutrition.com/webhook/shopify-admin';
const self = this;

async function stripe(method, path, params) {
  const r = await self.helpers.httpRequest({ method: 'POST', url: API, json: true, timeout: 40000, body: { t: T, method: method, path: path, params: params || {} } });
  if (r && r.error) throw new Error('stripe ' + path + ': ' + (r.error.message || JSON.stringify(r.error)).slice(0, 200));
  return r;
}
async function gql(query, variables) {
  const r = await self.helpers.httpRequest({ method: 'POST', url: SHOP, json: true, timeout: 30000, headers: { 'Content-Type': 'application/json', 'User-Agent': 'Mozilla/5.0' },
    body: { acao: 'atualizar_pedido', endpoint: '../2026-07/graphql.json', metodo: 'POST', payload: { query: query, variables: variables || {} } } });
  const d = r && r.dados;
  if (!d || (d.errors && d.errors.length)) throw new Error('shopify: ' + JSON.stringify((d || {}).errors || 'sem resposta').slice(0, 200));
  return d.data;
}

// 1. variantes ativas da Shopify
const variantes = [];
let after = null;
do {
  const q = await gql('query($a:String){ products(first:50, after:$a, query:"status:active"){ pageInfo { hasNextPage endCursor } nodes { id title featuredMedia { preview { image { url } } } variants(first:20){ nodes { id title price } } } } }', { a: after });
  const p = q.products;
  for (const prod of p.nodes) {
    if (/\(USA\)/i.test(prod.title)) continue;
    const img = prod.featuredMedia && prod.featuredMedia.preview && prod.featuredMedia.preview.image && prod.featuredMedia.preview.image.url;
    for (const v of prod.variants.nodes) {
      const cents = Math.round(Number(v.price) * 100);
      if (!(cents > 0)) continue;
      const nome = prod.title + (v.title && v.title !== 'Default Title' ? ' - ' + v.title : '');
      variantes.push({ vid: String(v.id).split('/').pop(), pid: String(prod.id).split('/').pop(), nome: nome.slice(0, 250), cents: cents, img: img || null });
    }
  }
  after = p.pageInfo.hasNextPage ? p.pageInfo.endCursor : null;
} while (after);

// 2. produtos ja sincronizados na Stripe
const naStripe = {};
let start = null;
do {
  const params = { limit: 100, 'expand': ['data.default_price'] };
  if (start) params.starting_after = start;
  const r = await stripe('GET', 'products', params);
  for (const p of (r.data || [])) { const vid = p.metadata && p.metadata.shopify_variant_id; if (vid && p.active) naStripe[vid] = p; }
  start = r.has_more && r.data.length ? r.data[r.data.length - 1].id : null;
} while (start);

// 3. cria / atualiza
const saida = { criados: [], preco_atualizado: [], ajustados: [], ok: 0, erros: [] };
for (const v of variantes) {
  try {
    const p = naStripe[v.vid];
    const meta = { shopify_variant_id: v.vid, shopify_product_id: v.pid, origem: 'sync-shopify' };
    if (!p) {
      const novo = await stripe('POST', 'products', { name: v.nome, images: v.img ? [v.img] : undefined, metadata: meta, default_price_data: { currency: 'brl', unit_amount: v.cents } });
      saida.criados.push(v.nome + ' (' + (v.cents / 100).toFixed(2) + ')');
      continue;
    }
    const dp = p.default_price && typeof p.default_price === 'object' ? p.default_price : null;
    if (!dp || dp.unit_amount !== v.cents || dp.currency !== 'brl') {
      const pr = await stripe('POST', 'prices', { product: p.id, currency: 'brl', unit_amount: v.cents, metadata: { shopify_variant_id: v.vid } });
      await stripe('POST', 'products/' + p.id, { default_price: pr.id });
      if (dp && dp.id) await stripe('POST', 'prices/' + dp.id, { active: false });
      saida.preco_atualizado.push(v.nome + ': ' + (dp ? (dp.unit_amount / 100).toFixed(2) : '?') + ' -> ' + (v.cents / 100).toFixed(2));
    }
    const mudouNome = p.name !== v.nome;
    const mudouImg = v.img && (!p.images || p.images[0] !== v.img);
    if (mudouNome || mudouImg) {
      await stripe('POST', 'products/' + p.id, { name: v.nome, images: v.img ? [v.img] : undefined });
      saida.ajustados.push(v.nome);
    }
    saida.ok++;
  } catch (e) { saida.erros.push(v.nome + ': ' + String(e.message).slice(0, 200)); }
}
saida.total_variantes = variantes.length;
return [{ json: saida }];
