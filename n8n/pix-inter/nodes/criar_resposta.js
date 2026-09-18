// Resposta no MESMO formato que o checkout ja recebe do Pagar.me (13 campos). O QR e gerado aqui (data URL).
const r = $input.first().json || {};
const st = Number(r.statusCode || 0);
const body = r.body || {};
const p = $('Criar: Preparar cobrança').first().json;
if (!(st >= 200 && st < 300) || !body.pixCopiaECola) {
  return [{ json: { via_inter: false, gravar: false, txid: p.txid, motivo: 'Inter cob HTTP ' + st + ': ' + JSON.stringify(body).slice(0, 400) } }];
}
const copia = String(body.pixCopiaECola);
let qrUrl = null;
try { const q = qrcode(0, 'M'); q.addData(copia, 'Byte'); q.make(); qrUrl = q.createDataURL(4, 8); } catch (e) { qrUrl = null; }
const expira = new Date(Date.now() + Number(p.exp || 86400) * 1000).toISOString();
return [{ json: {
  via_inter: true, gravar: true,
  txid: p.txid, order_code: p.order_code, cents: p.cents, nome: p.nome, email: p.email, documento: p.documento, telefone: p.telefone,
  checkout: p.checkout, copia: copia, location: String(body.location || (body.loc && body.loc.location) || ''), expira: expira,
  resposta: {
    order_id: 'inter_' + p.txid,
    status: 'pending',
    payment_method: 'pix',
    pix_qr_code: copia,
    pix_qr_code_url: qrUrl,
    boleto_url: null, boleto_pdf: null, boleto_line: null, boleto_barcode: null,
    acquirer_message: null, acquirer_return_code: null, gateway_message: null,
    tx_status: 'waiting_payment',
    provider: 'inter'
  }
} }];
