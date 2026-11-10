// Workflow "AN - Tag SERENA nas vendas da Serena (15 min)" (8XpF8Myvud8mps6p), criado em 10/11/2026.
// Pedido do Jaderson: "as vendas da serena, pode cair com a TAG SERENA, todas elas".
// Cron 15 min -> HTTP POST graphql (credencial "Shopify API Token", sem chave no codigo) -> este Code -> HTTP POST graphql.
// Busca usada no 1o HTTP (pedidos dos ultimos 3 dias):
//   created_at:>='<agora-3d>' AND -tag:SERENA AND (tag:WPP OR tag:SERENA-IG OR tag:SERENA-MSG OR tag:'origem:serena' OR tag:'AF: Serena')
// No "Montar tagsAdd":
const r = $input.first().json || {};
const nodes = (((r.data || {}).orders || {}).nodes) || [];
const alvo = nodes.filter(function (o) { return !(o.tags || []).some(function (t) { return String(t).toUpperCase() === 'SERENA'; }); });
if (!alvo.length) return [];
const m = 'mutation{' + alvo.map(function (o, k) { return 'a' + k + ': tagsAdd(id:"' + o.id + '", tags:["SERENA"]){ userErrors{ message } }'; }).join(' ') + '}';
return [{ json: { query: m, pedidos: alvo.map(function (o) { return o.name; }) } }];
