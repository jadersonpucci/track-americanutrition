// Recebe o corpo do checkout (mesmo formato do /webhook/checkout-criar-pedido) e monta a cobranca imediata do Inter.
// Qualquer motivo para nao seguir pelo Inter devolve via_inter=false e o Fluxo A cai no Pagar.me.
const BASE = 'https://n8n.americanutrition.com';
const self = this;
const cfg = ($input.first().json || {}).cfg || {};
const root = $('Criar: Requisição').first().json;
const b = root.body || root || {};
const fail = (m) => [{ json: { via_inter: false, motivo: m } }];

if (String(cfg.pix_provider || 'pagarme') !== 'inter') return fail('pix_provider=' + (cfg.pix_provider || 'pagarme'));
if (!cfg.inter_client_id || !cfg.inter_client_secret || !cfg.inter_chave_pix) return fail('config do Inter incompleta (client_id, client_secret, chave_pix)');
if (String(b.payment_method || '') !== 'pix') return fail('metodo nao e pix');

const items = Array.isArray(b.items) ? b.items : [];
const fr = b.freight || {};
let cents = items.reduce((a, it) => a + Math.round(Number(it.amount) || 0) * (parseInt(it.quantity || 1) || 1), 0);
if (Number(fr.price_cents) > 0) cents += Math.round(Number(fr.price_cents));
if (!(cents > 0)) return fail('valor zero');

const d = s => String(s || '').replace(/[^0-9]/g, '');
const c = b.customer || {};
const doc = d(c.document);
const nome = String(c.name || '').replace(/\s+/g, ' ').trim().slice(0, 200);
const orderCode = String(b.order_ref || ('AN-' + Date.now()));
const exp = parseInt(cfg.inter_pix_expiracao_seg || '86400') || 86400;

// txid do Bacen: 26 a 35 caracteres [a-zA-Z0-9]
const rnd = () => Math.random().toString(36).slice(2);
let txid = ('AN' + Date.now().toString(36) + rnd() + rnd() + rnd()).replace(/[^a-zA-Z0-9]/g, '');
while (txid.length < 26) txid += rnd().replace(/[^a-zA-Z0-9]/g, '');
txid = txid.slice(0, 32);

const cob = {
  calendario: { expiracao: exp },
  valor: { original: (cents / 100).toFixed(2) },
  chave: String(cfg.inter_chave_pix).trim(),
  solicitacaoPagador: ('Pedido ' + orderCode + ' - America Nutrition').slice(0, 140),
  infoAdicionais: [{ nome: 'Pedido', valor: orderCode.slice(0, 200) }]
};
if (doc.length === 11) cob.devedor = { cpf: doc, nome: nome || 'Cliente' };
else if (doc.length === 14) cob.devedor = { cnpj: doc, nome: nome || 'Cliente' };

let tk;
try {
  tk = await self.helpers.httpRequest({ method: 'POST', url: BASE + '/webhook/pix-inter-token', json: true, timeout: 30000, body: { k: cfg.pix_admin_token } });
  if (!tk || !tk.ok || !tk.token) throw new Error((tk && tk.erro) || 'token Inter indisponivel');
} catch (e) { return fail('token: ' + String(e && e.message || e).slice(0, 200)); }

return [{ json: {
  via_inter: true, txid: txid, cents: cents, order_code: orderCode, cob: cob, exp: exp,
  token: tk.token, base: tk.base, conta: String(cfg.inter_conta_corrente || '').trim(),
  nome: nome, email: String(c.email || '').toLowerCase().trim(), documento: doc, telefone: d(c.ddd) + d(c.phone),
  checkout: JSON.stringify(b)
} }];
