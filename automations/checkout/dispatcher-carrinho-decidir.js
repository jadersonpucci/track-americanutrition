// Dispatcher Carrinho Abandonado (workflow MqCaAfZt6PIVat1R), node "Decidir".
// Confirma se o cliente JA comprou antes de disparar.
// Casa por email OU telefone (ultimos 8 digitos), janela de 90 dias.
// Fail-safe: se a Shopify nao devolveu lista valida (erro/timeout), NAO dispara agora.
const shop = $input.first().json || {};
const contato = $('Loop').item.json;
const orders = (shop && Array.isArray(shop.orders)) ? shop.orders : null;
if (orders === null) { return []; }

const norm = s => String(s || '').toLowerCase().trim();
const digs = s => String(s || '').replace(/[^0-9]/g, '');
const tail = s => { const d = digs(s); return d.length >= 8 ? d.slice(-8) : d; };
const cEmail = norm(contato.email);
const cTail = tail(contato.whatsapp);

const pago = orders.some(function (o) {
  if (cEmail && o.email && norm(o.email) === cEmail) return true;
  if (cTail) {
    const fones = [o.phone, (o.shipping_address && o.shipping_address.phone), (o.customer && o.customer.phone)];
    if (fones.some(function (p) { return p && tail(p) === cTail; })) return true;
  }
  return false;
});

const nowIso = new Date().toISOString();
const nome = (contato.first_name || '').split(' ')[0] || 'tudo bem';
const numero = String(contato.whatsapp || '').replace(/[^0-9]/g, '');
let itens = [];
try { itens = JSON.parse(contato.itens || '[]'); } catch(e) {}
const primeiro = itens[0] ? (itens[0].name || 'seu produto') : 'seu pedido';

const recusa = contato.recusa_cartao === true;
const boleto = contato.boleto_pendente === true;

// Marca o note no link de checkout para atribuicao na Shopify:
// CARRINHO (abandonado) / RECUSA (cartao recusado) / BOLETO (boleto nao pago)
function comNota(url, nota) {
  let u = String(url || '');
  if (!u || u.indexOf('checkout.americanutrition.com') === -1) return u;
  if (/[?&]note=/i.test(u)) {
    u = u.replace(/([?&]note=)[^&]*/i, '$1' + nota);
  } else {
    u += (u.indexOf('?') >= 0 ? '&' : '?') + 'note=' + nota;
  }
  return u;
}
const nota = boleto ? 'BOLETO' : (recusa ? 'RECUSA' : 'CARRINHO');
const checkoutUrl = comNota(contato.checkout_url || 'https://americanutrition.com', nota);

// AN-BOLETO-PROPRIO: link do nosso documento (marca + ficha FEBRABAN + conferencia).
// Vale mesmo dias depois: tudo e derivado da propria linha digitavel.
// 13/09/2026: &pdf=1 devolve o PDF de uma folha (node "Gerar PDF" do AN - Boleto Personalizado).
let boletoDocUrl = '';
try {
  const linhaBol = digs(contato.boleto_line);
  if (linhaBol.length === 47) {
    const nomeCompleto = [contato.first_name, contato.last_name].filter(Boolean).join(' ').trim();
    const itensTxt = itens.map(function(i){
      const qtd = i.quantity || i.qty || 1;
      const preco = Number(i.price || i.unit || 0) * qtd;
      return qtd + 'x ' + (i.name || i.title || 'Produto') + (preco > 0 ? '=' + preco.toFixed(2).replace('.', ',') : '');
    }).join('|');
    boletoDocUrl = 'https://n8n.americanutrition.com/webhook/boleto?l=' + encodeURIComponent(linhaBol)
      + (nomeCompleto ? '&n=' + encodeURIComponent(nomeCompleto) : '')
      + (itensTxt ? '&it=' + encodeURIComponent(itensTxt) : '')
      + '&pdf=1';
  }
} catch (e) { boletoDocUrl = ''; }

return [{ json: {
  id: contato.id,
  email: contato.email,
  numero: numero,
  nome: nome,
  primeiro: primeiro,
  coupon: contato.coupon || '',
  checkout_url: checkoutUrl,
  recusa_cartao: recusa,
  boleto_pendente: boleto,
  boleto_line: contato.boleto_line || '',
  boleto_url: contato.boleto_url || '',
  boleto_doc_url: boletoDocUrl,
  total: Number(contato.total || 0),
  pago: pago,
  patch: { status: pago ? 'convertido' : 'abandonado', atualizado_em: nowIso, convertido_em: pago ? nowIso : null, abandonado_em: pago ? null : nowIso }
} }];
