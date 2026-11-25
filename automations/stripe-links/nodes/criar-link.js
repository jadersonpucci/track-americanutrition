// No "Criar Link" do workflow "Stripe | Criar link de pagamento" (POST /webhook/stripe-criar-link).
// 24/11/2026, pedido do Jaderson: criar pelo chat um link da Stripe (pay.imunofosfo.com) para quem paga com cartao
// internacional e recebe no Brasil. Regras dele:
//   - frete gratis a partir de R$ 250,00 (abaixo disso o valor do frete vem em frete_centavos, senao recusa);
//   - CPF obrigatorio (campo numerico de 11 digitos no checkout; vai para a nota fiscal e a etiqueta);
//   - entrega so no Brasil.
// Corpo: { t, itens: [{ variant_id | busca, qtd }], desconto_pct?, frete_centavos?, referencia?, desativar? }
//   - busca: texto do produto ("imunofosfo 90", "omega"); se bater em mais de um, devolve as opcoes;
//   - desconto_pct: o link da Stripe nao aplica cupom sozinho, entao o link sai com o preco ja descontado (preco novo
//     so deste link, com o preco cheio e o % no metadata);
//   - desativar: id de um link antigo (plink_...) para desligar.
// Os produtos da Stripe vem do "Stripe | Sync produtos Shopify" (metadata shopify_variant_id).
const API = 'https://n8n.americanutrition.com/webhook/stripe-api-interna';
const T = 'TOKEN_STRIPE_INTERNO';
const FRETE_GRATIS_MIN = 25000;
const self = this;
const b = ($input.first().json.body) || {};
if (b.t !== T) throw new Error('acesso negado');

async function stripe(method, path, params) {
  const r = await self.helpers.httpRequest({ method: 'POST', url: API, json: true, timeout: 40000, body: { t: T, method: method, path: path, params: params || {} } });
  if (r && r.error) throw new Error('stripe ' + path + ': ' + (r.error.message || JSON.stringify(r.error)).slice(0, 300));
  return r;
}
const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
const brl = (c) => 'R$ ' + (c / 100).toFixed(2).replace('.', ',');

// produtos sincronizados
const prods = [];
let start = null;
do {
  const params = { limit: 100, active: true, expand: ['data.default_price'] };
  if (start) params.starting_after = start;
  const r = await stripe('GET', 'products', params);
  for (const p of (r.data || [])) if (p.metadata && p.metadata.shopify_variant_id && p.default_price && p.default_price.unit_amount) prods.push(p);
  start = r.has_more && r.data.length ? r.data[r.data.length - 1].id : null;
} while (start);

const itensIn = Array.isArray(b.itens) ? b.itens : [];
if (!itensIn.length) return [{ json: { ok: false, erro: 'nenhum item' } }];
const desc = Math.max(0, Math.min(50, Number(b.desconto_pct) || 0));
const linhas = [];
for (const it of itensIn) {
  const qtd = Math.max(1, Math.round(Number(it.qtd || it.quantidade || 1)));
  let p = null;
  if (it.variant_id) p = prods.find((x) => x.metadata.shopify_variant_id === String(it.variant_id).split('/').pop());
  else {
    const toks = norm(it.busca).split(' ').filter(Boolean);
    const hits = prods.filter((x) => { const n = norm(x.name); return toks.every((t) => n.indexOf(t) >= 0); });
    if (hits.length > 1) {
      const exato = hits.filter((x) => norm(x.name) === norm(it.busca));
      if (exato.length === 1) p = exato[0];
      else return [{ json: { ok: false, erro: 'mais de um produto para "' + it.busca + '"', opcoes: hits.map((x) => x.name + ' [' + x.metadata.shopify_variant_id + ']') } }];
    } else p = hits[0] || null;
  }
  if (!p) return [{ json: { ok: false, erro: 'produto nao encontrado: ' + (it.variant_id || it.busca) } }];
  const cheio = p.default_price.unit_amount;
  let price = p.default_price.id, unit = cheio;
  if (desc > 0) {
    unit = Math.round(cheio * (1 - desc / 100));
    const pr = await stripe('POST', 'prices', { product: p.id, currency: 'brl', unit_amount: unit, nickname: desc + '% off',
      metadata: { shopify_variant_id: p.metadata.shopify_variant_id, preco_cheio: cheio, desconto_pct: desc, origem: 'link-chat' } });
    price = pr.id;
  }
  linhas.push({ nome: p.name, vid: p.metadata.shopify_variant_id, qtd: qtd, cheio: cheio, unit: unit, price: price });
}
const subtotal = linhas.reduce((s, l) => s + l.unit * l.qtd, 0);

// frete
let frete;
if (subtotal >= FRETE_GRATIS_MIN) {
  const r = await stripe('GET', 'shipping_rates', { limit: 100, active: true });
  const ex = (r.data || []).find((s) => s.metadata && s.metadata.an === 'frete-gratis-br');
  frete = ex || await stripe('POST', 'shipping_rates', { display_name: 'Frete grátis', type: 'fixed_amount', fixed_amount: { amount: 0, currency: 'brl' },
    delivery_estimate: { minimum: { unit: 'business_day', value: 3 }, maximum: { unit: 'business_day', value: 12 } }, metadata: { an: 'frete-gratis-br' } });
} else {
  const fc = Math.round(Number(b.frete_centavos));
  if (!(fc > 0)) return [{ json: { ok: false, erro: 'subtotal ' + brl(subtotal) + ' abaixo de R$ 250,00: informe frete_centavos', subtotal: subtotal } }];
  frete = await stripe('POST', 'shipping_rates', { display_name: 'Frete', type: 'fixed_amount', fixed_amount: { amount: fc, currency: 'brl' },
    delivery_estimate: { minimum: { unit: 'business_day', value: 3 }, maximum: { unit: 'business_day', value: 12 } }, metadata: { an: 'frete-link' } });
}

const meta = { origem: 'link-chat', desconto_pct: String(desc), itens: linhas.map((l) => l.vid + 'x' + l.qtd).join(','), referencia: String(b.referencia || '').slice(0, 200) };
const link = await stripe('POST', 'payment_links', {
  line_items: linhas.map((l) => ({ price: l.price, quantity: l.qtd })),
  currency: 'brl',
  shipping_address_collection: { allowed_countries: ['BR'] },
  shipping_options: [{ shipping_rate: frete.id }],
  phone_number_collection: { enabled: true },
  billing_address_collection: 'required',
  custom_fields: [{ key: 'cpf', label: { type: 'custom', custom: 'CPF (somente números)' }, type: 'numeric', numeric: { minimum_length: 11, maximum_length: 11 }, optional: false }],
  allow_promotion_codes: false,
  metadata: meta,
  payment_intent_data: { metadata: meta, description: 'America Nutrition - ' + linhas.map((l) => l.qtd + 'x ' + l.nome).join(', ').slice(0, 300) },
  after_completion: { type: 'hosted_confirmation', hosted_confirmation: { custom_message: 'Pagamento recebido! Seu pedido entra em separação e o código de rastreio chega por e-mail e WhatsApp. Obrigado por escolher a America Nutrition 💙' } }
});

let desativado = null;
if (b.desativar && /^plink_[A-Za-z0-9]+$/.test(String(b.desativar))) {
  const d = await stripe('POST', 'payment_links/' + b.desativar, { active: false });
  desativado = { id: d.id, active: d.active };
}
const freteC = frete.fixed_amount ? frete.fixed_amount.amount : 0;
return [{ json: { ok: true, url: link.url, id: link.id, itens: linhas.map((l) => l.qtd + 'x ' + l.nome + ' a ' + brl(l.unit) + (l.unit !== l.cheio ? ' (cheio ' + brl(l.cheio) + ')' : '')),
  subtotal: brl(subtotal), frete: freteC ? brl(freteC) : 'grátis', total: brl(subtotal + freteC), desativado: desativado } }];
