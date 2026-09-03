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

const query = 'mutation draftOrderCreate($input: DraftOrderInput!) { draftOrderCreate(input: $input) { draftOrder { id name totalPrice invoiceUrl } userErrors { field message } } }';

return [{ json: {
  graphql_body: { query: query, variables: { input: draftInput } },
  ctx: ctx
}}];
