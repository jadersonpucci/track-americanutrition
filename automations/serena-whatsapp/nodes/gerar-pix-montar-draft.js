// Node "Montar draft" do workflow "[Serena Tool] Gerar PIX" (n8n SkETGTmcqtlTR0Lp).
// Monta a mutation GraphQL draftOrderCreate com o CPF em localizationExtensions.
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
  note: 'Pedido PIX via Serena (' + nomeCanal + ')',
  tags: ['origem:serena', 'canal:' + canal, 'pagamento:pix', tagCanal],
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

// DESCONTO: appliedDiscount de porcentagem sobre o pedido. O titulo leva o cupom quando existe,
// para a venda ficar rastreavel no relatorio da Shopify. Sem desconto_pct, nada e aplicado.
const pct = Number(ctx.desconto_pct || 0);
if (pct > 0) {
  const rotulo = ctx.cupom ? ('Cupom ' + ctx.cupom) : ('Desconto ' + pct + '%');
  draftInput.appliedDiscount = {
    valueType: 'PERCENTAGE',
    value: pct,
    title: rotulo.slice(0, 80),
    description: (ctx.cupom ? ('Cupom ' + ctx.cupom + ' aplicado pela Serena') : 'Desconto aplicado pela Serena').slice(0, 200)
  };
  draftInput.note = draftInput.note + ' - ' + rotulo;
  if (ctx.cupom) draftInput.tags.push('cupom:' + ctx.cupom);
}

// FRETE (13/09/2026): a linha de frete entra no draft, e o totalPrice que a Shopify devolve (e vira o
// valor do Pix) ja sai com ela. Frete gratis entra como linha de R$ 0 para a equipe ver a escolha.
if (ctx.frete && Number(ctx.frete.valor) > 0) {
  draftInput.shippingLine = { title: ctx.frete.titulo || 'Frete', priceWithCurrency: { amount: Number(ctx.frete.valor).toFixed(2), currencyCode: 'BRL' } };
} else if (ctx.frete && ctx.frete.origem === 'gratis') {
  draftInput.shippingLine = { title: 'Frete grátis', priceWithCurrency: { amount: '0.00', currencyCode: 'BRL' } };
}

// lineItems na resposta: o cliente ve o PRODUTO na mensagem e na pagina do Pix, nao o numero do rascunho
// (o numero do pedido de verdade, AN-xxxxx, so existe depois do pagamento).
// appliedDiscount na resposta: confirma que o desconto entrou de fato, em vez de supor.
const query = 'mutation draftOrderCreate($input: DraftOrderInput!) { draftOrderCreate(input: $input) { draftOrder { id name totalPrice invoiceUrl appliedDiscount { title value valueType } lineItems(first: 20) { edges { node { title quantity variantTitle } } } } userErrors { field message } } }';

return [{ json: {
  graphql_body: { query: query, variables: { input: draftInput } },
  ctx: ctx
}}];
