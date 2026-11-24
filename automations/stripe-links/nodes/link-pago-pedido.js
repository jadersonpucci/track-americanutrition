// Workflow "Stripe | Link pago -> pedido Shopify" (POST /webhook/stripe-link-pedido, webhook da Stripe com
// checkout.session.completed e checkout.session.async_payment_succeeded).
// 24/11/2026, pedido do Jaderson: venda paga por link de pagamento da Stripe (pay.imunofosfo.com), cartao internacional,
// entrega no Brasil, vira pedido pago na Shopify com o endereco que a pessoa digitou. Daqui o pedido segue o fluxo normal
// do Brasil (Frenet, nota fiscal, avisos), igual a uma venda do site.
//
// Webhook Stripe -> Ler Sessao (codigo) -> Travar (Postgres) -> Criar Pedido (codigo) -> Registrar (Postgres)
//   -> Avisar Cris (WhatsApp pelo Samuel, credencial Evolution)
//
// Seguranca: o corpo do webhook nao e confiavel. Daqui so sai o id da sessao; tudo o resto e lido de novo na Stripe
// (pela ponte interna) e so segue se a sessao for de link de pagamento e estiver paga.
// Sem duplicar: "Travar" grava stripe_link_pedidos (session_id unico); se ja existia, nao devolve linha e o fluxo para.
// Entrega fora do Brasil, moeda que nao e real ou produto sem shopify_variant_id: nao vira pedido; a Cris e avisada para
// resolver a mao. Nenhuma chave neste arquivo (a ponte interna usa um token proprio, placeholder aqui).

// ===================== LER SESSAO =====================
const API = 'https://n8n.americanutrition.com/webhook/stripe-api-interna';
const T = 'TOKEN_STRIPE_INTERNO';
const self = this;

const ev = ($input.first().json.body) || {};
const tipo = String(ev.type || '');
const sid = ev.data && ev.data.object && ev.data.object.id;
if (['checkout.session.completed', 'checkout.session.async_payment_succeeded'].indexOf(tipo) < 0 || !/^cs_(live|test)_[A-Za-z0-9]+$/.test(String(sid || ''))) return [];

const r0 = await self.helpers.httpRequest({ method: 'POST', url: API, json: true, timeout: 40000,
  body: { t: T, method: 'GET', path: 'checkout/sessions/' + sid, params: { expand: ['line_items.data.price.product'] } } });
if (r0 && r0.error) throw new Error('stripe: ' + (r0.error.message || JSON.stringify(r0.error)).slice(0, 300));
const s = r0;
if (!s.payment_link || s.mode !== 'payment' || s.payment_status !== 'paid') return [];

const brl = (c) => 'R$ ' + (Number(c) / 100).toFixed(2).replace('.', ',');
const cd = s.customer_details || {};
const ship = (s.collected_information && s.collected_information.shipping_details) || s.shipping_details || {};
const end = ship.address || cd.address || {};
const nomeEnt = String(ship.name || cd.name || '').trim();
const partes = nomeEnt.split(/\s+/);
const first = partes.shift() || 'Cliente';
const last = partes.join(' ') || '-';
const cf = (s.custom_fields || []).find((f) => f.key === 'cpf' || /cpf/i.test(f.key));
const cpf = String((cf && ((cf.numeric && cf.numeric.value) || (cf.text && cf.text.value))) || '').replace(/\D/g, '');
const cpfFmt = cpf.length === 11 ? cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4') : cpf;
const tel = String(cd.phone || '').trim();
const cep = String(end.postal_code || '').replace(/\D/g, '');
const itens = ((s.line_items && s.line_items.data) || []).map((li) => {
  const pr = li.price || {};
  const prod = pr.product && typeof pr.product === 'object' ? pr.product : {};
  const vid = (pr.metadata && pr.metadata.shopify_variant_id) || (prod.metadata && prod.metadata.shopify_variant_id) || null;
  return { vid: vid, nome: li.description || prod.name || '?', qtd: li.quantity || 1, total: li.amount_total || 0 };
});
const frete = (s.shipping_cost && s.shipping_cost.amount_total) || 0;

const problemas = [];
if (String(end.country || '').toUpperCase() !== 'BR') problemas.push('entrega fora do Brasil (' + (end.country || '?') + ')');
if (String(s.currency || '').toLowerCase() !== 'brl') problemas.push('moeda ' + s.currency);
const semVar = itens.filter((i) => !i.vid);
if (semVar.length) problemas.push('produto sem ligacao com a Shopify: ' + semVar.map((i) => i.nome).join(', '));

const endereco = {
  firstName: first, lastName: last,
  address1: String(end.line1 || '').slice(0, 255), address2: String(end.line2 || '').slice(0, 255) || null,
  city: end.city || '', provinceCode: String(end.state || '').toUpperCase().slice(0, 2) || null,
  zip: cep.length === 8 ? cep.slice(0, 5) + '-' + cep.slice(5) : (end.postal_code || ''), countryCode: 'BR', phone: tel || null
};
const ordem = {
  currency: 'BRL', email: cd.email || null, phone: tel || null, financialStatus: 'PAID',
  lineItems: itens.map((i) => ({ variantId: 'gid://shopify/ProductVariant/' + i.vid, quantity: i.qtd,
    priceSet: { shopMoney: { amount: (i.total / i.qtd / 100).toFixed(2), currencyCode: 'BRL' } } })),
  shippingLines: [{ title: frete > 0 ? 'Frete' : 'Frete Grátis', code: frete > 0 ? 'Frete' : 'Frete Grátis', priceSet: { shopMoney: { amount: (frete / 100).toFixed(2), currencyCode: 'BRL' } } }],
  shippingAddress: endereco, billingAddress: endereco,
  transactions: [{ kind: 'SALE', status: 'SUCCESS', gateway: 'Stripe', authorizationCode: String(s.payment_intent || sid),
    amountSet: { shopMoney: { amount: (Number(s.amount_total) / 100).toFixed(2), currencyCode: 'BRL' } } }],
  customAttributes: [
    { key: 'CPF', value: cpfFmt || '-' }, { key: 'Pagamento', value: 'Cartão (link Stripe)' }, { key: 'Gateway', value: 'Stripe' },
    { key: 'Stripe sessão', value: sid }, { key: 'Stripe link', value: String(s.payment_link) }
  ],
  tags: ['stripe-link'],
  note: 'Pago no link da Stripe (pay.imunofosfo.com), cartão. Pagamento ' + (s.payment_intent || sid) + '.',
  sourceName: 'stripe-link'
};
if (cpf.length === 11) ordem.metafields = [{ namespace: 'an_fiscal', key: 'cpf_cnpj', type: 'single_line_text_field', value: cpf }];
if (cd.email) ordem.customer = { toUpsert: { email: cd.email, firstName: first, lastName: last } };

const telDig = tel.replace(/\D/g, '');
const cab = '*VENDA NO LINK STRIPE* · ' + brl(s.amount_total) + '\n\n'
  + 'Cliente: ' + nomeEnt + '\n' + (telDig ? 'WhatsApp: https://wa.me/' + telDig + '\n' : '')
  + 'Itens: ' + itens.map((i) => i.qtd + 'x ' + i.nome).join(', ') + '\n'
  + 'Frete: ' + (frete > 0 ? brl(frete) : 'grátis') + '\n'
  + 'Entrega: ' + [end.line1, end.line2, end.city + '/' + (end.state || ''), end.postal_code].filter(Boolean).join(', ') + '\n'
  + 'CPF: ' + (cpfFmt || 'NAO INFORMADO');
return [{ json: { sid: sid, payment_link: s.payment_link, payment_intent: s.payment_intent || null, valor: Number(s.amount_total) || 0,
  problemas: problemas, ordem: ordem, cab: cab, cpf_ok: cpf.length === 11, cidade: endereco.city + '/' + (endereco.provinceCode || ''),
  payload: JSON.stringify({ sid: sid, link: s.payment_link, pi: s.payment_intent || null, valor: Number(s.amount_total) || 0 }) } }];

// ===================== CRIAR PEDIDO =====================
// (no seguinte, depois do "Travar"; le os dados do "Ler Sessao")
const SHOP = 'https://n8n.americanutrition.com/webhook/shopify-admin';
const self = this;
const d = $('Ler Sessao').first().json;
const fim = (status, pedido, erro, msg) => [{ json: { status: status, pedido: pedido || null, erro: erro || null, sid: d.sid,
  texto: d.cab + '\n\n' + msg, payload: JSON.stringify({ sid: d.sid, status: status, pedido: pedido || null, erro: erro || null }) } }];
if (d.problemas.length) return fim('manual', null, d.problemas.join('; '), '⚠️ Pedido NÃO criado na Shopify: ' + d.problemas.join('; ') + '. Criar à mão.');
try {
  const r = await self.helpers.httpRequest({ method: 'POST', url: SHOP, json: true, timeout: 40000, headers: { 'Content-Type': 'application/json', 'User-Agent': 'Mozilla/5.0' },
    body: { acao: 'atualizar_pedido', endpoint: '../2026-07/graphql.json', metodo: 'POST', payload: {
      query: 'mutation($o:OrderCreateOrderInput!,$op:OrderCreateOptionsInput){ orderCreate(order:$o, options:$op){ order { id name } userErrors { field message } } }',
      variables: { o: d.ordem, op: { inventoryBehaviour: 'DECREMENT_OBEYING_POLICY', sendReceipt: false } } } } });
  const dd = r && r.dados;
  if (!dd || (dd.errors && dd.errors.length)) throw new Error('shopify: ' + JSON.stringify((dd || {}).errors || 'sem resposta').slice(0, 300));
  const oc = dd.data && dd.data.orderCreate;
  const ue = oc && oc.userErrors;
  if (ue && ue.length) throw new Error('orderCreate: ' + ue.map((e) => (e.field || []).join('.') + ' ' + e.message).join('; '));
  const o = oc.order;
  return fim('criado', o.name, null, '✅ Pedido ' + o.name + ' criado na Shopify, já pago, para envio a ' + d.cidade + '.' + (d.cpf_ok ? '' : ' ⚠️ Sem CPF: conferir antes da nota.'));
} catch (e) {
  return fim('erro', null, String(e.message).slice(0, 500), '⚠️ Erro ao criar o pedido na Shopify: ' + String(e.message).slice(0, 300) + '. Criar à mão.');
}
