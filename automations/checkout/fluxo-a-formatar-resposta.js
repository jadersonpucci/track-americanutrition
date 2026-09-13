// Pagar.me — Criar Pedido (Fluxo A), no "Formatar Resposta" (workflow DHeud8c0Qkb0EDwS).
// Le a order criada no Pagar.me e devolve ao checkout o que ele mostra na tela.
// BOLETO PERSONALIZADO (13/09/2026): boleto_url passou a ser a pagina com a identidade da marca
// ("AN - Boleto Personalizado", GET /webhook/boleto), montada a partir da propria linha digitavel com nome, CPF,
// endereco, itens e o codigo do pedido. O botao "Ver e imprimir boleto" do checkout abre essa pagina.
// O PDF cru da Pagar.me continua em boleto_pdf, so como reserva.
const o = $input.first().json;
const charge = (o.charges && o.charges[0]) || {};
const tx = charge.last_transaction || {};
const gw = tx.gateway_response || {};
const gwErr = (gw.errors && gw.errors.length) ? (gw.errors[0].message || '') : '';

let boletoPagina = null;
try {
  const linha = String(tx.line || '').replace(/\D/g, '');
  if ((charge.payment_method === 'boleto' || tx.transaction_type === 'boleto') && linha.length === 47) {
    const brl = c => (Number(c || 0) / 100).toFixed(2).replace('.', ',');
    const limpa = s => String(s == null ? '' : s).replace(/[|=]/g, ' ').trim();
    const itens = (Array.isArray(o.items) ? o.items : []).map(i => {
      const q = parseInt(i.quantity || 1) || 1;
      return (q > 1 ? q + 'x ' : '') + limpa(i.description) + '=' + brl(Number(i.amount || 0) * q);
    }).filter(Boolean);
    const c = o.customer || {};
    const a = c.address || {};
    const cep = String(a.zip_code || '').replace(/\D/g, '');
    const end = [[a.line_1, a.line_2].filter(Boolean).join(', '), [a.city, a.state].filter(Boolean).join('/'), cep ? 'CEP ' + cep.replace(/^(\d{5})(\d{3})$/, '$1-$2') : ''].filter(Boolean).join(', ');
    boletoPagina = 'https://n8n.americanutrition.com/webhook/boleto?l=' + linha
      + '&n=' + encodeURIComponent(String(c.name || '').slice(0, 80))
      + '&d=' + encodeURIComponent(String(c.document || '').replace(/\D/g, ''))
      + '&p=' + encodeURIComponent(String(o.code || '').slice(0, 40))
      + '&it=' + encodeURIComponent(itens.join('|').slice(0, 600))
      + '&end=' + encodeURIComponent(end.slice(0, 200));
  }
} catch (e) { boletoPagina = null; }

return [{ json: {
  order_id: o.id,
  status: charge.status || o.status,
  payment_method: charge.payment_method,
  pix_qr_code: tx.qr_code || null,
  pix_qr_code_url: tx.qr_code_url || null,
  boleto_url: boletoPagina || tx.url || tx.pdf || null,
  boleto_pdf: tx.url || tx.pdf || null,
  boleto_line: tx.line || null,
  boleto_barcode: tx.barcode || null,
  acquirer_message: tx.acquirer_message || null,
  acquirer_return_code: tx.acquirer_return_code || null,
  gateway_message: gwErr || null,
  tx_status: tx.status || null
} }];
