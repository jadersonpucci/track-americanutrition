// PIX confirmado no Inter: reaproveita o fluxo "Pagar.me — Confirmação Pago → Shopify" enviando um order.paid
// no mesmo formato do webhook do Pagar.me (ele nao consulta a API do Pagar.me, so le o corpo).
const BASE = 'https://n8n.americanutrition.com';
const self = this;
const claimed = ($input.first().json || {}).txid;
const cob = $('Confirmar: Config + cobrança').first().json.cobranca || {};
const av = $('Confirmar: Avaliar pagamento').first().json || {};
const oid = 'inter_' + cob.txid;
if (!claimed) return [{ json: { paid: true, status: 'paid', ja_confirmado: true, order_id: oid, erro: '' } }];

let b = cob.checkout || {};
if (typeof b === 'string') { try { b = JSON.parse(b); } catch (e) { b = {}; } }
const d = s => String(s || '').replace(/[^0-9]/g, '');
const c = b.customer || {};
const items = (Array.isArray(b.items) ? b.items : []).map(it => ({ code: String(it.code), description: String(it.description || ''), quantity: parseInt(it.quantity || 1) || 1, amount: Math.round(Number(it.amount) || 0) }));
const fr = b.freight || {};
const freteCents = Number(fr.price_cents) > 0 ? Math.round(Number(fr.price_cents)) : 0;
if (freteCents > 0) items.push({ code: 'FRETE', description: 'Frete - ' + (fr.label || ''), quantity: 1, amount: freteCents });
const total = items.reduce((a, it) => a + it.amount * it.quantity, 0);
const doc = d(c.document);

const payload = { type: 'order.paid', data: {
  id: oid, code: cob.order_code || '', status: 'paid', amount: total, currency: 'BRL',
  customer: { name: c.name || cob.nome || '', email: c.email || cob.email || '', document: doc, document_type: doc.length === 14 ? 'cnpj' : 'cpf', type: doc.length === 14 ? 'company' : 'individual',
    phones: { mobile_phone: { country_code: '55', area_code: d(c.ddd), number: d(c.phone) } } },
  items: items,
  charges: [{ id: oid, amount: total, status: 'paid', payment_method: 'pix', paid_at: av.horario || new Date().toISOString(),
    last_transaction: { transaction_type: 'pix', status: 'paid', end_to_end_id: av.e2e || '' } }],
  metadata: {
    shipping: JSON.stringify(b.shipping || {}), freight: JSON.stringify(fr), shopify_items: JSON.stringify(b.shopify_items || []),
    customer_name: c.name || '', customer_email: c.email || '', juros_cents: '0', installments: '1', card_brand: '', ref: String(b.ref || ''),
    payment_method: 'pix', gateway: 'Banco Inter', inter_txid: cob.txid, inter_e2e: av.e2e || ''
  }
} };
if (doc.length === 14) payload.data.metadata.pessoa_juridica = 'sim';

let erro = '';
try {
  await self.helpers.httpRequest({ method: 'POST', url: BASE + '/webhook/pagarme-pago', json: true, timeout: 30000, body: payload });
} catch (e) { erro = String(e && e.message || e).slice(0, 300); }
return [{ json: { paid: true, status: 'paid', confirmado_agora: true, order_id: oid, txid: cob.txid, valor: total / 100, erro: erro } }];
