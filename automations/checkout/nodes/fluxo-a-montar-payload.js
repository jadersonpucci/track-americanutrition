// Node "Montar Payload Pagar.me" do workflow "Pagar.me — Criar Pedido (Fluxo A)" (n8n DHeud8c0Qkb0EDwS).
const b = $('Checkout Recebido').first().json.body || $('Checkout Recebido').first().json;
const d = s => String(s||'').replace(/[^0-9]/g,'');

// ============================================================
// BG-PRECO-GUARD: revalidacao de preco server-side (Opcao A + sync automatico)
// Catalogo: tabela Supabase catalogo_precos (no "Buscar Catalogo"), sincronizada da Shopify por cron diario.
// Fallback: catalogo EMBUTIDO (se Supabase falhar/vazio) -> a protecao nunca fica sem base.
// Regra por TETO de desconto: bloqueia adulteracao grosseira; nunca bloqueia venda legitima.
// Qualquer erro/duvida -> fail-open. NUNCA derruba pedido real por bug.
try {
  const CATALOGO_EMBUTIDO = {"46173112041644":597,"44436756234412":327,"44436756267180":327,"45117829218476":267,"44511284920492":247,"45211644461228":247,"45198538277036":197,"45211644625068":197,"43736522653868":167,"44714532208812":147,"45522481643692":137,"45035695866028":107,"44268289982636":99.9,"44291546448044":99.9,"44513798127788":99,"43671038656684":87,"43959807508652":77,"44852610826412":77,"43843399712940":77,"44240381411500":67,"43843418259628":67,"45300915863724":57,"44337976508588":44.9};
  let CATALOGO = {};
  try {
    let cat = $('Buscar Catalogo').first().json.catalogo;
    if (typeof cat === 'string') { cat = JSON.parse(cat); }
    if (cat && typeof cat === 'object') {
      for (const k in cat) { const p = Number(cat[k]); if (p > 0) { CATALOGO[String(k)] = p; } }
    }
  } catch (_e) {}
  if (Object.keys(CATALOGO).length < 5) { CATALOGO = CATALOGO_EMBUTIDO; } // fallback de seguranca

  const TETO_BLOQUEIO = 0.60;   // desconto efetivo acima disso = adulteracao (bloqueia)
  const LIMIAR_ALERTA = 0.40;   // entre alerta e teto = passa, mas marca p/ revisao

  const sitems = Array.isArray(b.shopify_items) ? b.shopify_items : [];
  const pitems = Array.isArray(b.items) ? b.items : [];

  let subtotalRef = 0, todosConhecidos = (sitems.length > 0);
  for (const it of sitems) {
    const vid = String(it.variant_id || it.code || '');
    const qty = Math.max(1, parseInt(it.quantity || 1) || 1);
    const ref = CATALOGO[vid];
    if (ref == null) { todosConhecidos = false; continue; }
    subtotalRef += ref * qty;
  }

  const cobradoCents = pitems.reduce((a,it)=> a + Math.round(Number(it.amount)||0)*(parseInt(it.quantity||1)||1), 0);
  const cobrado = cobradoCents / 100;

  if (todosConhecidos && subtotalRef > 0 && cobrado >= 0) {
    const descontoEf = 1 - (cobrado / subtotalRef);
    if (descontoEf > TETO_BLOQUEIO) {
      throw new Error('PRECO_INVALIDO: cobrado R$' + cobrado.toFixed(2) + ' vs referencia R$' + subtotalRef.toFixed(2) + ' (desc ' + (descontoEf*100).toFixed(1) + '%)');
    }
    if (descontoEf > LIMIAR_ALERTA) {
      b.__price_alert = 'desc ' + (descontoEf*100).toFixed(1) + '% | cobrado ' + cobrado.toFixed(2) + ' | ref ' + subtotalRef.toFixed(2);
    }
  }
} catch (e) {
  if (String(e && e.message).indexOf('PRECO_INVALIDO') === 0) { throw e; }
}
// ============================================================

const items = (b.items||[]).map(it => ({ amount: Math.round(it.amount), description: it.description, quantity: it.quantity||1, code: String(it.code) }));
const fr = b.freight || {};
if (fr.price_cents && Number(fr.price_cents) > 0) { items.push({ amount: Math.round(Number(fr.price_cents)), description: 'Frete - '+(fr.label||''), quantity: 1, code: 'FRETE' }); }

const TAXAS = {
  A: { 4:6.81, 5:7.8, 6:8.79, 7:9.93, 8:10.92, 9:11.91, 10:12.9, 11:13.89, 12:14.88 },
  B: { 4:9.55, 5:10.54, 6:11.53, 7:12.52, 8:13.51, 9:14.5, 10:15.49, 11:16.48, 12:17.47 }
};
const installments = parseInt(b.installments||1) || 1;
const brand = String(b.brand||'').toLowerCase();
const grupo = (brand==='amex'||brand==='elo'||brand==='hipercard') ? 'B' : 'A';
let jurosCents = 0;
if (b.payment_method === 'credit_card' && installments >= 4) {
  const taxa = (TAXAS[grupo]||{})[installments];
  if (taxa) {
    const baseCents = items.reduce((a,it)=>a + Math.round(it.amount)*(it.quantity||1), 0);
    const financiado = Math.round(baseCents / (1 - taxa/100));
    jurosCents = financiado - baseCents;
    if (jurosCents > 0) { items.push({ amount: jurosCents, description: 'Juros de parcelamento ('+installments+'x)', quantity: 1, code: 'JUROS' }); }
  }
}

const s = b.shipping || {};
const addr = {
  line_1: [d(s.zip), (s.street||''), (s.number||''), (s.neighborhood||'')].filter(Boolean).join(', '),
  line_2: s.complement || '',
  zip_code: d(s.zip),
  city: s.city || '',
  state: s.state || '',
  country: 'BR'
};
const hasAddr = !!(s.street || s.zip);

// PJ: documento de 14 digitos = CNPJ -> type company (Pagar.me exige)
const docD = d(b.customer.document);
const ehCnpj = docD.length === 14;
const customer = { name: b.customer.name, email: b.customer.email, type: ehCnpj ? 'company' : 'individual', document: docD, document_type: ehCnpj ? 'cnpj' : 'cpf', phones: { mobile_phone: { country_code: '55', area_code: d(b.customer.ddd), number: d(b.customer.phone) } } };
if (hasAddr) { customer.address = addr; }
const metadata = { shipping: JSON.stringify(b.shipping||{}), freight: JSON.stringify(fr), shopify_items: JSON.stringify(b.shopify_items||[]), customer_name: customer.name, customer_email: customer.email, juros_cents: String(jurosCents), installments: String(installments), card_brand: brand, ref: String(b.ref||'') };
if (ehCnpj) { metadata.pessoa_juridica = 'sim'; }
if (b.__price_alert) { metadata.price_alert = String(b.__price_alert); }
let payment;
// AN-PIX-VALIDADE (ago/2026): era 3600s (1h) e o cliente que voltava depois via
// "QR Code invalido" no app do banco (a cobranca ja tinha expirado) — inclusive nas
// mensagens de resgate de carrinho, que chegam horas depois. 24h resolve sem risco:
// cobranca PIX nao reserva estoque nem gera custo enquanto nao e paga.
const PIX_VALIDADE_SEG = 86400;   // 24 horas
if (b.payment_method === 'pix') { payment = { payment_method: 'pix', pix: { expires_in: PIX_VALIDADE_SEG } }; }
else if (b.payment_method === 'boleto') { payment = { payment_method: 'boleto', boleto: { instructions: 'Pague ate o vencimento.', due_at: new Date(Date.now()+3*86400000).toISOString() } }; }
else if (b.payment_method === 'credit_card') { payment = { payment_method: 'credit_card', credit_card: { operation_type: 'auth_and_capture', installments: installments, statement_descriptor: 'AMERICANUTRI', card_token: b.card_token, card: { billing_address: { line_1: (s.number?s.number+', ':'')+(s.street||'')+', '+(s.neighborhood||''), zip_code: d(s.zip), city: s.city, state: s.state, country: 'BR' } } } }; }
const pagarmeBody = { items, customer, payments: [payment], metadata, code: b.order_ref || ('AN-'+Date.now()) };
// 19/09/2026: ip e session_id do comprador vao para o Pagar.me (campos oficiais da order, usados pelo antifraude
// da adquirente quando estiver contratado; sem antifraude sao so registrados). O ip vem do Checkout Gate (_client_ip).
try {
  const ipP = String(b._client_ip || '').split(',')[0].trim();
  if (ipP && !/^(10\.|172\.(1[6-9]|2[0-9]|3[01])\.|192\.168\.|127\.)/.test(ipP)) { pagarmeBody.ip = ipP.slice(0, 45); }
  const sidP = String(b.session_id || b.idempotency_key || '').trim().slice(0, 100);
  if (sidP) { pagarmeBody.session_id = sidP; }
} catch (_ip) {}
return [{ json: { pagarmeBody, _req: b } }];