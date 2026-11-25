const ctx = $input.first().json;

// Canal da conversa (vem do Core via Router): define a tag de canal do pedido na Shopify.
let canal = 'whatsapp';
try { const wb = $('Webhook').first().json; const b = wb.body || wb; const c = String(b.canal || '').toLowerCase().trim(); if (c) canal = c; } catch (e) { canal = 'whatsapp'; }
const TAG_CANAL = { whatsapp: 'WPP', instagram: 'SERENA-IG', messenger: 'SERENA-MSG' };
const NOME_CANAL = { whatsapp: 'WhatsApp', instagram: 'Instagram', messenger: 'Messenger' };
const tagCanal = TAG_CANAL[canal] || 'WPP';
const nomeCanal = NOME_CANAL[canal] || 'WhatsApp';

const lineItems = ctx.itens.map(i => ({
  variantId: 'gid://shopify/ProductVariant/' + i.variant_id,
  quantity: i.quantity
}));

const primeiroNome = ctx.cliente.nome.split(' ')[0];
const sobrenome = ctx.cliente.nome.split(' ').slice(1).join(' ');

const draftInput = {
  email: ctx.cliente.email,
  phone: '+' + ctx.cliente.telefone_full,
  note: 'Pedido boleto via Serena (' + nomeCanal + ')',
  tags: ['origem:serena', 'canal:' + canal, 'pagamento:boleto', tagCanal],
  lineItems: lineItems,
  shippingAddress: {
    firstName: primeiroNome,
    lastName: sobrenome,
    address1: ctx.endereco.rua + ', ' + ctx.endereco.numero,
    address2: ctx.endereco.complemento,
    city: ctx.endereco.cidade,
    province: ctx.endereco.estado,
    zip: ctx.endereco.cep,
    country: 'Brazil',
    phone: '+' + ctx.cliente.telefone_full
  },
  localizationExtensions: [{
    key: 'TAX_CREDENTIAL_BR',
    value: ctx.cliente.cpf_formatado
  }]
};

// DESCONTO (11/11/2026): appliedDiscount como no Gerar PIX; o totalPrice da Shopify (valor do boleto) ja sai com ele.
const pct = Number(ctx.desconto_pct || 0);
const dval = Number(ctx.desconto_valor || 0);
if (pct > 0 || dval > 0) {
  const rot = ctx.cupom ? ('Cupom ' + ctx.cupom) : (pct > 0 ? ('Desconto ' + pct + '%') : ('Desconto R$ ' + dval.toFixed(2).replace('.', ',')));
  draftInput.appliedDiscount = pct > 0
    ? { valueType: 'PERCENTAGE', value: pct, title: rot.slice(0, 80), description: (rot + ' aplicado pela Serena').slice(0, 200) }
    : { valueType: 'FIXED_AMOUNT', value: dval, title: rot.slice(0, 80), description: ('Preco especial: ' + rot).slice(0, 200) };
  draftInput.note = draftInput.note + ' - ' + rot;
  if (ctx.cupom) draftInput.tags.push('cupom:' + ctx.cupom);
}

// FRETE (13/09/2026): o Validar dados ja garante frete informado, cotado ou gratis (acima de R$ 250).
if (ctx.frete && Number(ctx.frete.valor) > 0) {
  draftInput.shippingLine = {
    title: ctx.frete.titulo || 'Frete',
    priceWithCurrency: {
      amount: Number(ctx.frete.valor).toFixed(2),
      currencyCode: 'BRL'
    }
  };
} else if (ctx.frete && ctx.frete.origem === 'gratis') {
  draftInput.shippingLine = { title: 'Frete grátis', priceWithCurrency: { amount: '0.00', currencyCode: 'BRL' } };
}

// lineItems na resposta: o cliente ve o PRODUTO na mensagem, nao o numero do rascunho
// (o numero do pedido de verdade, AN-xxxxx, so existe depois do pagamento).
const query = 'mutation draftOrderCreate($input: DraftOrderInput!) { draftOrderCreate(input: $input) { draftOrder { id name totalPrice invoiceUrl lineItems(first: 20) { edges { node { title quantity variantTitle discountedTotalSet { shopMoney { amount } } originalTotalSet { shopMoney { amount } } } } } } userErrors { field message } } }';

return [{ json: {
  graphql_body: { query: query, variables: { input: draftInput } },
  ctx: ctx
}}];
