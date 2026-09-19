// Boleto/PIX do Inter confirmado: cria o pedido pelo mesmo fluxo do Pagar.me (order.paid) e lanca no Nibo.
const BASE = 'https://n8n.americanutrition.com';
const self = this;
const claimed = ($input.first().json || {}).codigo_solicitacao;
const busca = $('BConfirmar: Buscar').first().json || {};
const row = busca.cobranca || {};
const cfg = busca.cfg || {};
const av = $('BConfirmar: Processar').first().json || {};
const cod = String(av.codigo || row.codigo_solicitacao || '');
const oid = 'interb_' + cod;
if (!claimed) return [{ json: { paid: true, status: 'paid', ja_confirmado: true, order_id: oid, erro: '' } }];
let b = row.checkout || {};
if (typeof b === 'string') { try { b = JSON.parse(b); } catch (e) { b = {}; } }
const d = s => String(s || '').replace(/[^0-9]/g, '');
const c = b.customer || {};
const items = (Array.isArray(b.items) ? b.items : []).map(it => ({ code: String(it.code), description: String(it.description || ''), quantity: parseInt(it.quantity || 1) || 1, amount: Math.round(Number(it.amount) || 0) }));
const fr = b.freight || {};
const freteCents = Number(fr.price_cents) > 0 ? Math.round(Number(fr.price_cents)) : 0;
if (freteCents > 0) items.push({ code: 'FRETE', description: 'Frete - ' + (fr.label || ''), quantity: 1, amount: freteCents });
const total = items.reduce((a, it) => a + it.amount * it.quantity, 0);
const doc = d(c.document || row.documento);
const viaPix = av.origem === 'PIX';
const pm = viaPix ? 'pix' : 'boleto';
const payload = { type: 'order.paid', data: {
  id: oid, code: row.order_code || '', status: 'paid', amount: total, currency: 'BRL',
  customer: { name: c.name || row.nome || '', email: c.email || row.email || '', document: doc, document_type: doc.length === 14 ? 'cnpj' : 'cpf', type: doc.length === 14 ? 'company' : 'individual',
    phones: { mobile_phone: { country_code: '55', area_code: d(c.ddd), number: d(c.phone) } } },
  items: items,
  charges: [{ id: oid, amount: total, status: 'paid', payment_method: pm, paid_at: av.pago_em || new Date().toISOString(),
    last_transaction: { transaction_type: pm, status: 'paid', line: row.linha_digitavel || '', barcode: row.codigo_barras || '' } }],
  metadata: {
    shipping: JSON.stringify(b.shipping || {}), freight: JSON.stringify(fr), shopify_items: JSON.stringify(b.shopify_items || []),
    customer_name: c.name || '', customer_email: c.email || '', juros_cents: '0', installments: '1', card_brand: '', ref: String(b.ref || ''),
    payment_method: pm, gateway: 'Banco Inter', inter_codigo_solicitacao: cod, inter_origem: av.origem || '', inter_boleto_hibrido: 'sim'
  }
} };
if (doc.length === 14) payload.data.metadata.pessoa_juridica = 'sim';
let erro = '';
try { await self.helpers.httpRequest({ method: 'POST', url: BASE + '/webhook/pagarme-pago', json: true, timeout: 30000, body: payload }); }
catch (e) { erro = String(e && e.message || e).slice(0, 300); }
let nibo = '';
if (cfg.pix_admin_token) {
  try {
    const l = await self.helpers.httpRequest({ method: 'POST', url: BASE + '/webhook/inter-nibo-lancar', json: true, timeout: 90000, body: {
      k: cfg.pix_admin_token, chave: 'interb:' + cod, origem: 'boleto_confirmar', tipo: viaPix ? 'PIX' : 'BOLETO',
      valor: Number(av.valor_recebido || total / 100), data: av.pago_em || '', nome: row.nome || c.name || '', documento: doc,
      descricao: '', referencia: cod, txid: cod, end_to_end_id: '', detalhes: { order_code: row.order_code || '', origem: av.origem || '' }
    } });
    nibo = (l && (l.lancado ? 'lancado' : l.duplicado ? 'duplicado' : l.ignorado ? 'ignorado' : ('erro: ' + (l.erro || '')))) || 'sem resposta';
  } catch (e) { nibo = 'erro: ' + String(e && e.message || e).slice(0, 150); }
}
return [{ json: { paid: true, status: 'paid', confirmado_agora: true, order_id: oid, codigo: cod, origem: av.origem || '', valor: total / 100, erro: erro, nibo: nibo } }];
