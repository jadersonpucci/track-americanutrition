// Node "Criar PIX Inter" do workflow "[Serena Tool] Gerar PIX" (n8n SkETGTmcqtlTR0Lp). Chaves reais so no n8n.
// 03/11/2026, pedido do Jaderson: todo PIX sai pelo Banco Inter, como o checkout novo. Antes a Serena criava um draft
// order na Shopify e cobrava pelo Pagar.me (Stone). Agora ela pede o PIX pelo mesmo caminho do checkout
// (/webhook/checkout-criar-pedido, com pix_provider=inter): a cobranca e do Inter e, quando o PIX cai, o pedido nasce
// pago na Shopify pelo fluxo de sempre (Confirmacao Pago), com ref=serena -> tags AF: Serena e WPP (ou SERENA-IG /
// SERENA-MSG), mais a tag extra origem:serena (e cupom:X). Nao existe mais rascunho: o pedido so aparece depois de pago.
// Saida no mesmo formato do "Extrair PIX", para seguir no "PIX ok?" -> "Formatar resposta".
// serena_config.serena_pix_provider: inter (padrao) | pagarme (volta ao caminho antigo do draft + Pagar.me).
const ctx = $input.first().json;
const self = this;
const SK = 'SUPABASE_SERVICE_KEY';
const SB = 'https://supabase.americanutrition.com/pg/query';
const CHECKOUT = 'https://n8n.americanutrition.com/webhook/checkout-criar-pedido';
const E = (v) => "'" + String(v == null ? '' : v).replace(/'/g, "''") + "'";
async function sql(q) {
  const r = await self.helpers.httpRequest({ method: 'POST', url: SB, json: true, timeout: 15000, headers: { apikey: SK, Authorization: 'Bearer ' + SK, 'Content-Type': 'application/json' }, body: { query: q } });
  if (r && r.error) throw new Error(String(r.error).slice(0, 200));
  return Array.isArray(r) ? r : [];
}
// seguir_draft=true: o IF "Caminho antigo?" manda para o Montar draft (draft + Pagar.me). Erro ou PIX gerado seguem para o "PIX ok?".
const pagarme = (motivo) => [{ json: Object.assign({}, ctx, { seguir_draft: true, motivo_pagarme: motivo }) }];

let provedor = 'inter';
try { const r = await sql("select valor from serena_config where chave = 'serena_pix_provider'"); if (r[0] && r[0].valor) provedor = String(r[0].valor).trim().toLowerCase(); } catch (e) {}
if (provedor !== 'inter') return pagarme('serena_pix_provider=' + provedor);

// canal da conversa -> ref (tag de canal do pedido)
let canal = 'whatsapp';
try { const wb = $('Webhook').first().json; const b = wb.body || wb; const c = String(b.canal || '').toLowerCase().trim(); if (c) canal = c; } catch (e) {}
const REF = { whatsapp: 'serena', instagram: 'serena-ig', messenger: 'serena-msg' };
const ref = REF[canal] || 'serena';

// precos cheios do catalogo (o mesmo que o checkout e o guarda de preco usam)
const itens = ctx.itens || [];
let cat = [];
try { cat = await sql('select variant_id::text as id, title, price::numeric as price from catalogo_precos where variant_id::text in (' + itens.map((i) => E(String(i.variant_id))).join(', ') + ')'); } catch (e) { return pagarme('catalogo indisponivel'); }
const C = {}; cat.forEach((c) => { C[String(c.id)] = { title: c.title, price: Number(c.price) }; });
for (const i of itens) { if (!C[String(i.variant_id)] || !(C[String(i.variant_id)].price > 0)) return pagarme('produto ' + i.variant_id + ' fora do catalogo'); }
const TIT = { '44436756234412': 'ImunoFosfo 90 Caps', '44436756267180': 'ImunoFosfo Vegano 90 Caps', '44511284920492': 'ImunoFosfo 60 Caps', '45198538277036': 'ImunoFosfo 42 Caps', '46173112041644': 'ImunoFosfo Plus 180 Caps' };
const titulo = (id) => TIT[String(id)] || C[String(id)].title;

const fullCents = itens.reduce((a, i) => a + Math.round(C[String(i.variant_id)].price * 100) * (parseInt(i.quantity) || 1), 0);
const pct = Number(ctx.desconto_pct || 0);
const dval = Number(ctx.desconto_valor || 0);
let valorCents = fullCents;
if (dval > 0) valorCents = fullCents - Math.round(dval * 100);
else if (pct > 0) valorCents = Math.round(fullCents * (1 - pct / 100));
if (!(valorCents > 0)) return pagarme('valor final invalido');
const pctEfetivo = valorCents < fullCents ? Math.round(10000 * (fullCents - valorCents) / fullCents) / 100 : 0;

// desconto rateado nos itens (como a Venda Manual); a sobra do arredondamento vai numa linha de ajuste
const factor = valorCents / fullCents;
const pItems = [], sItems = [];
let acum = 0, sobra = 0;
itens.forEach((i, idx) => {
  const q = parseInt(i.quantity) || 1; const c = C[String(i.variant_id)];
  const fullUnit = Math.round(c.price * 100);
  sItems.push({ variant_id: String(i.variant_id), quantity: q, price: c.price });
  let unit;
  if (idx < itens.length - 1) { unit = Math.round(fullUnit * factor); acum += unit * q; }
  else { const rest = valorCents - acum; unit = Math.floor(rest / q); sobra = rest - unit * q; }
  pItems.push({ amount: unit, description: titulo(i.variant_id), quantity: q, code: String(i.variant_id) });
});
if (sobra > 0) pItems.push({ amount: sobra, description: 'Ajuste de arredondamento', quantity: 1, code: 'AJUSTE' });

const fr = ctx.frete || { valor: 0, titulo: '', origem: '' };
const freteCents = Math.max(0, Math.round(Number(fr.valor || 0) * 100));
const cli = ctx.cliente || {}; const end = ctx.endereco || {};
const partes = String(cli.nome || '').trim().split(/\s+/);
const firstName = partes.shift() || 'Cliente'; const lastName = partes.join(' ') || '.';
const cupom = String(ctx.cupom || '').trim().toUpperCase();
const tagExtra = ('origem:serena' + (cupom ? ', cupom:' + cupom : '')).slice(0, 40);
const orderRef = 'SER-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const payload = {
  items: pItems, shopify_items: sItems,
  customer: { name: cli.nome, email: cli.email, document: cli.cpf, ddd: cli.ddd, phone: cli.numero_telefone },
  shipping: { first_name: firstName, last_name: lastName, name: cli.nome, street: end.rua || '', number: end.numero || '', complement: end.complemento || '',
    neighborhood: end.bairro || '', city: end.cidade || '', state: String(end.estado || '').toUpperCase(), zip: String(end.cep || '').replace(/\D/g, ''),
    coupon: cupom || undefined, tag_extra: tagExtra, origem: 'serena', marketing_wpp: true },
  freight: { price_cents: freteCents, label: freteCents > 0 ? (fr.titulo || 'Frete') : 'Frete Gratis' },
  payment_method: 'pix', installments: 1, ref: ref, order_ref: orderRef
};

let r;
try { r = await self.helpers.httpRequest({ method: 'POST', url: CHECKOUT, json: true, timeout: 45000, body: payload }); }
catch (e) { return [{ json: { erro: true, seguir_draft: false, mensagem: 'Consegui montar seu pedido mas tive um problema ao gerar o PIX. Vou pedir ajuda da equipe.', motivo_tecnico: String(e.message || e).slice(0, 300) } }]; }
if (!r || !r.pix_qr_code) {
  return [{ json: { erro: true, seguir_draft: false, mensagem: 'Consegui montar seu pedido mas tive um problema ao gerar o PIX. Vou pedir ajuda da equipe.', motivo_tecnico: JSON.stringify(r || {}).slice(0, 300) } }];
}
const orderId = String(r.order_id || '');
let expira = null;
if (/^inter_/.test(orderId)) {
  try { const x = await sql('select expira_em from checkout_pix_inter where txid = ' + E(orderId.replace(/^inter_/, '')) + ' limit 1'); if (x[0] && x[0].expira_em) expira = new Date(x[0].expira_em).toISOString(); } catch (e) {}
}
if (!expira && r.pix_expires_at) expira = r.pix_expires_at;
if (!expira) expira = new Date(Date.now() + 24 * 3600000).toISOString();

const total = (valorCents + freteCents) / 100;
return [{ json: {
  erro: false,
  seguir_draft: false,
  via_inter: /^inter_/.test(orderId),
  draft_numero: '',
  draft_id: '',
  itens_texto: itens.map((i) => (parseInt(i.quantity) || 1) + 'x ' + titulo(i.variant_id)).join(', '),
  total_reais: total,
  frete: { valor: freteCents / 100, titulo: fr.titulo || '', origem: fr.origem || '', prazo: fr.prazo || '' },
  subtotal_reais: valorCents / 100,
  cupom: cupom,
  desconto_pct: pctEfetivo,
  desconto_pedido_pct: pctEfetivo,
  desconto_titulo: cupom ? 'Cupom ' + cupom : '',
  cliente_nome: cli.nome,
  cliente_telefone: cli.telefone_full,
  qr_code: r.pix_qr_code,
  qr_code_url: r.pix_qr_code_url || '',
  expira_em: expira,
  pagarme_order_id: orderId,
  pagarme_charge_id: null,
  order_ref: orderRef
} }];
