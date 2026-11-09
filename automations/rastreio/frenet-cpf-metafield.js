// No 'Preencher CPF' do workflow [Frenet] CPF no metafield do pedido (a4Ro3xzPIFyKZaY6), a cada 5 min.
// Rede de seguranca do metafield an_fiscal.cpf_cnpj (09/11/2026). O app da Frenet so le metafields do pedido
// (Metacampos de Pedido: CPF ou CNPJ). O checkout ja cria o pedido com o metafield; aqui entram os pedidos de outros
// caminhos (PIX, draft da Serena, venda manual) dos ultimos 2 dias que ainda nao tem. Fonte: campo CPF/CNPJ (TAX) ou atributo CPF.
const gql = async (query, variables) => {
  const r = await this.helpers.httpRequest({ method: 'POST', url: 'https://n8n.americanutrition.com/webhook/shopify-admin', json: true, timeout: 30000,
    headers: { 'Content-Type': 'application/json' },
    body: { acao: 'atualizar_pedido', endpoint: '../2026-07/graphql.json', metodo: 'POST', payload: { query, variables: variables || {} } } });
  const d = (r || {}).dados || {};
  if (!d.data) throw new Error('Shopify: ' + JSON.stringify(d.errors || r).slice(0, 300));
  return d.data;
};
const desde = new Date(Date.now() - 2 * 86400000).toISOString();
const d = await gql('query($q:String!){ orders(first:100, query:$q, sortKey:CREATED_AT, reverse:true){ nodes{ id name customAttributes{ key value } localizationExtensions(first:3){ nodes{ purpose value } } mf: metafield(namespace:"an_fiscal", key:"cpf_cnpj"){ value } } } }', { q: "created_at:>='" + desde + "'" });
const alvo = [];
for (const o of d.orders.nodes) {
  if (o.mf && o.mf.value) continue;
  let doc = '';
  for (const x of (o.localizationExtensions.nodes || [])) if (x.purpose === 'TAX') doc = String(x.value || '').replace(/\D/g, '');
  if (!doc) { const a = (o.customAttributes || []).find((x) => /^(cpf|cnpj|cpf\/cnpj)$/i.test(String(x.key))); if (a) doc = String(a.value || '').replace(/\D/g, ''); }
  if (doc.length === 11 || doc.length === 14) alvo.push({ id: o.id, name: o.name, doc });
}
if (!alvo.length) return [{ json: { preenchidos: 0 } }];
const r = await gql('mutation($m:[MetafieldsSetInput!]!){ metafieldsSet(metafields:$m){ metafields{ id } userErrors{ field message } } }',
  { m: alvo.slice(0, 25).map((a) => ({ ownerId: a.id, namespace: 'an_fiscal', key: 'cpf_cnpj', type: 'single_line_text_field', value: a.doc })) });
return [{ json: { preenchidos: (r.metafieldsSet.metafields || []).length, pedidos: alvo.slice(0, 25).map((a) => a.name), erros: r.metafieldsSet.userErrors } }];
