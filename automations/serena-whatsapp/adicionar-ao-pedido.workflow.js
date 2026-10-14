// n8n Workflow SDK — [Serena Tool] Adicionar ao Pedido
// POST /webhook/serena-adicionar-pedido {numero_pedido | telefone, itens_str|variant_id+quantidade, acao}
//
// POR QUE EXISTE (14/10/2026, decisao do Jaderson): quem comprou 1 frasco e quer mais, antes do pedido sair,
// tem direito a (a) NAO pagar frete de novo e (b) o desconto por volume da quantidade TOTAL, contando o que
// ja comprou. Exemplo dele: comprou 1 ImunoFosfo 90 (cheio) e quer +2; os 3 ativam a faixa de 5%, e como o
// primeiro foi pago cheio, os 5% do total inteiro saem na cobranca dos 2 novos.
//
// A CONTA (invariante): o total pago nos dois momentos tem que ser igual ao valor cheio combinado menos a
// faixa de desconto. Conferindo o exemplo: 327 + 604,95 = 931,95 = 981 x 0,95.
//   faixa(itens_total)        -> 3 a 5 itens = 5%, 6+ = 10% (mesma regua automatica do checkout do site)
//   desconto_devido = faixa x (cheio_original + cheio_novos)
//   desconto_a_aplicar = desconto_devido - desconto_ja_concedido_no_pedido   (nunca negativo)
//   credito_frete = frete ja pago, quando o combinado passa de R$ 250 e teria saido com frete gratis
//   a_cobrar = cheio_novos - desconto_a_aplicar - credito_frete
// O clamp em zero resolve sozinho o caso do cupom: quem ja usou IMUNOFOSFO (10%) nao ganha volume por cima,
// porque o desconto devido ja esta coberto.
//
// ESTA ETAPA e so a CONTA e a ELEGIBILIDADE (acao 'simular'), que nao muda nada na loja. A etapa de commit
// (fulfillmentOrderHold + orderEdit + cobranca da diferenca pelo Pagar.me) entra depois, em cima disto.
//
// ELEGIBILIDADE: o pedido precisa estar pago, nao cancelado, nao estornado, AINDA NAO ENVIADO (fulfillment
// order OPEN) e dentro da janela de adicionar_pedido_horas (padrao 72h). Medido em 14/10 nos ultimos 60
// pedidos: a mediana ate o envio e 19h e 63% saem em 24h, por isso a etapa de commit precisa SEGURAR o
// pedido (fulfillmentOrderHold) enquanto o cliente paga a diferenca.
import { workflow, node, trigger, sticky } from '@n8n/workflow-sdk';

const hook = trigger({ type: 'n8n-nodes-base.webhook', version: 2.1, config: { name: 'Webhook', parameters: { httpMethod: 'POST', path: 'serena-adicionar-pedido', responseMode: 'responseNode', options: {} } },
  output: [{ body: { numero_pedido: 'AN-16013', itens_str: '44436756234412:2', acao: 'simular' } }] });

const calcular = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Calcular', parameters: { jsCode: `const b = $input.first().json.body || $input.first().json;
const SHOP = 'https://n8n.americanutrition.com/webhook/shopify-admin';
const self = this;
const NL = String.fromCharCode(10);
const brl = v => 'R$ ' + Number(v || 0).toFixed(2).replace('.', ',');
const FRETE_GRATIS_MIN = 250;
const JANELA_H_PADRAO = 72;
// mesma regua automatica do checkout do site
const faixaDe = n => n >= 6 ? 10 : (n >= 3 ? 5 : 0);

const gql = async (query, variables) => {
  const r = await self.helpers.httpRequest({ method: 'POST', url: SHOP, json: true, timeout: 30000,
    headers: { 'Content-Type': 'application/json', 'User-Agent': 'Mozilla/5.0' },
    body: { acao: 'atualizar_pedido', endpoint: '../2026-07/graphql.json', metodo: 'POST', payload: { query: query, variables: variables || {} } } });
  const dd = r && r.dados;
  if (!dd || (dd.errors && dd.errors.length)) throw new Error('shopify: ' + JSON.stringify((dd || {}).errors || 'sem resposta').slice(0, 200));
  return dd.data;
};
const erro = (motivo, msg, extra) => [{ json: Object.assign({ sucesso: false, pode_adicionar: false, motivo: motivo, resultado: msg }, extra || {}) }];

// ---- itens novos pedidos pela Serena ----
let pedidos = [];
if (Array.isArray(b.itens)) pedidos = b.itens.map(i => ({ variant_id: String(i.variant_id || '').replace(/\\D/g, ''), quantidade: Math.max(1, parseInt(i.quantidade || i.quantity || 1, 10) || 1) }));
else if (b.itens_str) pedidos = String(b.itens_str).split(',').map(p => { const x = p.split(':'); return { variant_id: String(x[0] || '').replace(/\\D/g, ''), quantidade: Math.max(1, parseInt(x[1] || '1', 10) || 1) }; });
else if (b.variant_id) pedidos = [{ variant_id: String(b.variant_id).replace(/\\D/g, ''), quantidade: Math.max(1, parseInt(b.quantidade || b.quantity || 1, 10) || 1) }];
pedidos = pedidos.filter(i => i.variant_id.length >= 10);
if (!pedidos.length) return erro('sem_itens', 'Me diga o que o cliente quer acrescentar: variant_id e quantidade (ou itens_str no formato "variant_id:qtd,variant_id:qtd"). Use consultar_produto para achar o variant_id.');

// ---- acha o pedido ----
const num = String(b.numero_pedido || b.pedido || '').trim().toUpperCase().replace(/\\s+/g, '');
const tel = String(b.telefone || '').replace(/\\D/g, '');
const Q_PEDIDO = 'query($q:String!){ orders(first:5, query:$q, sortKey:CREATED_AT, reverse:true){ nodes{ id name createdAt cancelledAt displayFinancialStatus displayFulfillmentStatus totalShippingPriceSet{shopMoney{amount}} currentTotalDiscountsSet{shopMoney{amount}} lineItems(first:50){ nodes{ quantity title variant{ id title } originalTotalSet{shopMoney{amount}} } } fulfillmentOrders(first:10){ nodes{ id status } } } } }';
let consulta = '';
if (num) consulta = 'name:' + num;
else if (tel.length >= 10) consulta = 'phone:' + tel.replace(/^55/, '');
else return erro('sem_pedido', 'Preciso do numero do pedido (AN-xxxxx) ou do telefone do cliente para achar o pedido.');

let dados = null;
try { dados = await gql(Q_PEDIDO, { q: consulta }); } catch (e) { return erro('shopify_fora', 'Nao consegui consultar o pedido agora. Diga ao cliente que voce confere em instantes e tente de novo.', { erro_tecnico: String(e.message || e).slice(0, 200) }); }
const lista = (((dados || {}).orders || {}).nodes) || [];
const ped = lista[0] || null;
if (!ped) return erro('pedido_nao_encontrado', 'Nao encontrei o pedido ' + (num || 'desse telefone') + '. Pode confirmar o numero pra mim?');

// ---- elegibilidade ----
const janelaH = Number(b.janela_horas || JANELA_H_PADRAO);
const horas = (Date.now() - new Date(ped.createdAt).getTime()) / 3600000;
const fos = ((ped.fulfillmentOrders || {}).nodes) || [];
const aberto = fos.filter(f => ['OPEN', 'SCHEDULED', 'ON_HOLD'].indexOf(String(f.status).toUpperCase()) >= 0);
const base = { pedido: ped.name, criado_em: ped.createdAt, horas: Math.round(horas * 10) / 10, status_pagamento: ped.displayFinancialStatus, status_envio: ped.displayFulfillmentStatus };
if (ped.cancelledAt) return erro('cancelado', 'O pedido ' + ped.name + ' foi cancelado, entao nao da para acrescentar item nele. Monte um pedido novo normalmente.', base);
if (String(ped.displayFinancialStatus).toUpperCase() !== 'PAID') {
  return erro('nao_pago', 'O pedido ' + ped.name + ' ainda NAO foi pago. Nesse caso nao se acrescenta item: e melhor refazer o pedido inteiro com tudo junto, que ja sai com o desconto por volume certo e um frete so. Monte o pedido completo e gere um link novo, avisando que o anterior nao vale mais.', base);
}
if (!aberto.length || String(ped.displayFulfillmentStatus).toUpperCase() !== 'UNFULFILLED') {
  return erro('ja_enviado', 'O pedido ' + ped.name + ' ja saiu para entrega, entao nao da mais para acrescentar nele. O cliente pode fazer um pedido novo; se ele comprar 3 ou mais itens, o desconto por volume ja entra sozinho no checkout.', base);
}
if (horas > janelaH) return erro('fora_da_janela', 'O pedido ' + ped.name + ' foi feito ha ' + Math.round(horas) + ' horas e ja passou da janela de ' + janelaH + 'h para acrescentar item. Monte um pedido novo.', base);

// ---- precos dos itens novos ----
const ids = pedidos.map(i => 'gid://shopify/ProductVariant/' + i.variant_id);
let vres = null;
try { vres = await gql('query($ids:[ID!]!){ nodes(ids:$ids){ ... on ProductVariant { id title price product{ title status } } } }', { ids: ids }); } catch (e) { vres = null; }
const vmap = {};
for (const n of (((vres || {}).nodes) || [])) { if (n && n.id) vmap[String(n.id).split('/').pop()] = n; }
const novos = [];
for (const i of pedidos) {
  const v = vmap[i.variant_id];
  if (!v) return erro('variante_invalida', 'Nao encontrei o produto ' + i.variant_id + ' na loja. Confira o variant_id com consultar_produto.', base);
  if (v.product && String(v.product.status).toUpperCase() !== 'ACTIVE') return erro('produto_inativo', (v.product.title || 'O produto') + ' nao esta mais a venda.', base);
  const vt = String(v.title || '').replace(/^Tradicionais \\/ /, '');
  novos.push({ variant_id: i.variant_id, quantidade: i.quantidade, preco: Number(v.price || 0),
    titulo: String((v.product && v.product.title) || 'Produto') + (vt && vt !== 'Default Title' ? ' ' + vt : '') });
}

// ---- a conta ----
const itensPed = ((ped.lineItems || {}).nodes) || [];
const itensOrig = itensPed.reduce((t, l) => t + Number(l.quantity || 0), 0);
const cheioOrig = itensPed.reduce((t, l) => t + Number(((l.originalTotalSet || {}).shopMoney || {}).amount || 0), 0);
const descOrig = Number(((ped.currentTotalDiscountsSet || {}).shopMoney || {}).amount || 0);
const freteOrig = Number(((ped.totalShippingPriceSet || {}).shopMoney || {}).amount || 0);
const itensNovos = novos.reduce((t, i) => t + i.quantidade, 0);
const cheioNovos = novos.reduce((t, i) => t + i.preco * i.quantidade, 0);
const itensTotal = itensOrig + itensNovos;
const faixa = faixaDe(itensTotal);
const cheioTotal = cheioOrig + cheioNovos;
const r2 = v => Math.round(v * 100) / 100;
const descDevido = r2(cheioTotal * faixa / 100);
const descAplicar = Math.max(0, r2(descDevido - descOrig));
// frete ja pago volta como credito quando o pedido combinado teria saido com frete gratis (acima de R$ 250)
const creditoFrete = (freteOrig > 0 && cheioTotal - descDevido >= FRETE_GRATIS_MIN) ? r2(freteOrig) : 0;
const aCobrar = r2(Math.max(0, cheioNovos - descAplicar - creditoFrete));
const totalFinal = r2(Number(cheioOrig) - descOrig + freteOrig + aCobrar);

const listaNovos = novos.map(i => i.quantidade + 'x ' + i.titulo).join(', ');
const linhas = [];
linhas.push('Pedido ' + ped.name + ' (feito ha ' + Math.round(horas) + 'h, pago e ainda nao enviado): pode acrescentar.');
linhas.push('Ja no pedido: ' + itensOrig + ' item(ns), ' + brl(cheioOrig) + ' cheio' + (descOrig > 0 ? ', com ' + brl(descOrig) + ' de desconto' : '') + (freteOrig > 0 ? ', frete ' + brl(freteOrig) : ', frete gratis') + '.');
linhas.push('Acrescentando: ' + listaNovos + ' (' + brl(cheioNovos) + ' cheio).');
linhas.push('Total de ' + itensTotal + ' itens' + (faixa > 0 ? ' ativa a faixa de ' + faixa + '% por volume.' : ' nao chega na faixa de volume (precisa de 3 itens).'));
if (descAplicar > 0) linhas.push('Desconto de ' + faixa + '% sobre os ' + brl(cheioTotal) + ' do pedido inteiro = ' + brl(descDevido) + (descOrig > 0 ? ', menos ' + brl(descOrig) + ' que ja estava no pedido' : '') + ' = ' + brl(descAplicar) + ' de abatimento agora.');
if (creditoFrete > 0) linhas.push('O frete de ' + brl(creditoFrete) + ' que ele pagou volta como credito, porque o pedido combinado passa de ' + brl(FRETE_GRATIS_MIN) + ' e sairia com frete gratis.');
linhas.push('A COBRAR AGORA: ' + brl(aCobrar) + ' (sem frete novo).');

return [{ json: {
  sucesso: true,
  pode_adicionar: true,
  acao: String(b.acao || 'simular'),
  pedido: ped.name,
  pedido_id: ped.id,
  fulfillment_order_ids: aberto.map(f => f.id),
  horas_desde_pedido: Math.round(horas * 10) / 10,
  itens_originais: itensOrig,
  itens_novos: itensNovos,
  itens_total: itensTotal,
  faixa_pct: faixa,
  valor_cheio_original: cheioOrig,
  valor_cheio_novos: cheioNovos,
  valor_cheio_total: cheioTotal,
  desconto_ja_concedido: descOrig,
  desconto_devido_total: descDevido,
  desconto_a_aplicar: descAplicar,
  frete_original: freteOrig,
  credito_frete: creditoFrete,
  a_cobrar: aCobrar,
  total_final_dos_dois: totalFinal,
  novos: novos,
  resultado: linhas.join(NL),
  nota_serena: 'Confirme com o cliente o que entra (' + listaNovos + ') e o valor de ' + brl(aCobrar) + ', dizendo que vai no MESMO pedido ' + ped.name + ', sem frete novo e com o desconto por volume do total. NAO gere PIX nem boleto por fora para isso: os itens entram no proprio pedido. So depois do sim explicito chame de novo com acao=confirmar.'
} }];` } },
  output: [{ sucesso: true, pode_adicionar: true, a_cobrar: 604.95 }] });

const responder = node({ type: 'n8n-nodes-base.respondToWebhook', version: 1.1, config: { name: 'Resposta', parameters: { respondWith: 'json', responseBody: '={{ JSON.stringify($json) }}', options: {} } } });

const nota = sticky('## Adicionar ao Pedido\n\nPOST /webhook/serena-adicionar-pedido {numero_pedido | telefone, itens_str, acao}\n\n**acao=simular** (esta etapa): confere elegibilidade e faz a conta, sem mexer em nada na loja.\n\nRegra (Jaderson, 14/10): quem comprou e quer mais, antes do pedido sair, nao paga frete de novo e leva o desconto por volume da quantidade TOTAL. O desconto do pedido inteiro sai na cobranca dos itens novos, porque o primeiro ja foi pago.\n\nInvariante: total pago nos dois momentos = valor cheio combinado menos a faixa. Faixas iguais as do site: 3 a 5 itens = 5%, 6+ = 10%.\n\nElegivel: pago, nao cancelado, AINDA NAO ENVIADO (fulfillment order OPEN) e dentro de 72h. Mediana ate o envio medida em 14/10: 19h.\n\nProxima etapa: acao=confirmar, com fulfillmentOrderHold no pedido + orderEdit para acrescentar os itens + cobranca da diferenca.', { color: 5, width: 460, height: 320 });

export default workflow('serena-adicionar-ao-pedido', '[Serena Tool] Adicionar ao Pedido', { settings: { executionOrder: 'v1' } })
  .add(hook).to(calcular).to(responder).add(nota);
