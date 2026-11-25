// No "Marcar na Shopify" do workflow [Serena Tool] Troca e Devolucao (VujldCtkPDLPLxzL), entre "Gravar Caso" e
// "Avisar Equipe".
// 24/11/2026, pedido do Jaderson: o caso de troca nao pode ficar so no WhatsApp/Telegram; a logistica tem que ver no
// proprio pedido da Shopify. Motivo: caso #23 (AN-16729, Liquid -> 42 capsulas) foi aberto no domingo 22/11 antes do
// envio, ninguem viu, e o pedido saiu na segunda com o produto errado.
// Com o numero do pedido:
//   1. nota no topo do pedido: "TROCA #id (Serena, data): produtos / motivo / o que fazer";
//   2. tag troca-pendente (devolucao-pendente, reembolso-pendente) para filtrar na lista de pedidos;
//   3. pedido ainda NAO enviado (fulfillment order OPEN/SCHEDULED/IN_PROGRESS): fulfillmentOrderHold com o motivo. E a
//      trava de verdade: o pedido aparece "Em espera" no admin e o robo Frenet -> Shopify nao cria envio de pedido em
//      espera. A equipe libera em "Liberar retencao" depois de ajustar o pedido.
// Caso reaproveitado (a Serena chamou de novo para o mesmo pedido): nao duplica a nota; se faltar algo (caso antigo,
// pedido ainda aberto), completa. Erro de Shopify nao derruba o registro do caso: volta em shopify.erro.
const r = $input.first().json || {};
const d = r.dados || {};
const id = r.id;
const SHOP = 'https://n8n.americanutrition.com/webhook/shopify-admin';
const self = this;
const out = Object.assign({}, r, { shopify: { status: 'sem_pedido' } });

const gql = async (query, variables) => {
  const resp = await self.helpers.httpRequest({ method: 'POST', url: SHOP, json: true, timeout: 30000,
    headers: { 'Content-Type': 'application/json', 'User-Agent': 'Mozilla/5.0' },
    body: { acao: 'atualizar_pedido', endpoint: '../2026-07/graphql.json', metodo: 'POST', payload: { query: query, variables: variables || {} } } });
  const dd = resp && resp.dados;
  if (!dd || (dd.errors && dd.errors.length)) throw new Error('shopify: ' + JSON.stringify((dd || {}).errors || 'sem resposta').slice(0, 200));
  return dd.data;
};
function nomePedido(p) {
  const t = String(p || '');
  const m = t.match(/\bAN[-\s]?(\d{4,6})(-BR)?\b/i) || t.match(/#?\s?(\d{4,6})\b/);
  return m ? ('AN-' + m[1] + (m[2] ? '-BR' : '')) : null;
}

const nome = nomePedido(d.pedido);
if (!id || !nome) return [{ json: out }];

try {
  const q = await gql('query($q:String!){ orders(first:1, query:$q){ nodes { id name note tags cancelledAt displayFulfillmentStatus fulfillmentOrders(first:10){ nodes { id status } } } } }', { q: 'name:' + nome });
  const o = q && q.orders && q.orders.nodes && q.orders.nodes[0];
  if (!o) { out.shopify = { status: 'pedido_nao_encontrado', pedido: nome }; return [{ json: out }]; }

  const tipo = ['troca', 'devolucao', 'reembolso'].indexOf(d.tipo) >= 0 ? d.tipo : 'troca';
  const TIPO = { troca: 'TROCA', devolucao: 'DEVOLUCAO', reembolso: 'REEMBOLSO' }[tipo];
  const marca = TIPO + ' #' + id;
  const abertos = ((o.fulfillmentOrders && o.fulfillmentOrders.nodes) || []).filter(f => ['OPEN', 'SCHEDULED', 'IN_PROGRESS'].indexOf(String(f.status)) >= 0);
  const naoEnviado = !o.cancelledAt && abertos.length > 0;
  const quando = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  const feito = [];

  // 1. nota
  const notaAtual = String(o.note || '');
  if (notaAtual.indexOf(marca) < 0) {
    let bloco = '⚠️ ' + marca + ' (Serena, ' + quando + ')';
    if (d.produtos) bloco += '\nProduto(s): ' + d.produtos;
    if (d.motivo) bloco += '\nMotivo: ' + d.motivo;
    if (d.detalhes) bloco += '\nDetalhes: ' + d.detalhes;
    bloco += naoEnviado
      ? '\nNAO ENVIAR antes de resolver o caso no Inbox (pedido em espera).'
      : '\nPedido ja enviado: tratar a ' + tipo + ' com o atendimento (Inbox).';
    const nova = (bloco + (notaAtual ? '\n\n' + notaAtual : '')).slice(0, 5000);
    const u = await gql('mutation($input:OrderInput!){ orderUpdate(input:$input){ userErrors { message } } }', { input: { id: o.id, note: nova } });
    const ue = u && u.orderUpdate && u.orderUpdate.userErrors;
    if (ue && ue.length) throw new Error('orderUpdate: ' + ue.map(e => e.message).join('; '));
    feito.push('nota');
  }

  // 2. tag
  const tag = tipo + '-pendente';
  if ((o.tags || []).indexOf(tag) < 0) {
    const t = await gql('mutation($id:ID!,$tags:[String!]!){ tagsAdd(id:$id, tags:$tags){ userErrors { message } } }', { id: o.id, tags: [tag] });
    const ue = t && t.tagsAdd && t.tagsAdd.userErrors;
    if (ue && ue.length) throw new Error('tagsAdd: ' + ue.map(e => e.message).join('; '));
    feito.push('tag');
  }

  // 3. trava o envio se ainda nao saiu
  let segurado = false;
  if (naoEnviado) {
    for (const f of abertos) {
      const h = await gql('mutation($id:ID!,$h:FulfillmentOrderHoldInput!){ fulfillmentOrderHold(id:$id, fulfillmentHold:$h){ fulfillmentOrder { status } userErrors { message } } }',
        { id: f.id, h: { reason: 'OTHER', handle: 'serena-troca-' + id, reasonNotes: (marca + ': ' + (d.produtos || '') + ' | ' + (d.motivo || '')).slice(0, 255) } });
      const ue = h && h.fulfillmentOrderHold && h.fulfillmentOrderHold.userErrors;
      if (ue && ue.length) throw new Error('fulfillmentOrderHold: ' + ue.map(e => e.message).join('; '));
      segurado = true;
    }
    if (segurado) feito.push('em_espera');
  }
  out.shopify = { status: 'ok', pedido: o.name, enviado: !naoEnviado, segurado: segurado, feito: feito,
    link: 'https://admin.shopify.com/store/39c4f8-2/orders/' + String(o.id).split('/').pop() };
} catch (e) {
  out.shopify = { status: 'erro', pedido: nome, erro: String(e.message).slice(0, 300) };
}
return [{ json: out }];
