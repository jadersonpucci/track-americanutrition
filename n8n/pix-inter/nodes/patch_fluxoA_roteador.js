// AN-PIX-INTER (set/2026): se checkout_config.pix_provider = 'inter' e o metodo for pix, a cobranca sai pelo Banco Inter
// (workflow "AN - PIX Banco Inter (Provedor)", POST /webhook/checkout-pix-inter-criar). Idem para boleto: se
// boleto_provider = 'inter', sai boleto hibrido (boleto + PIX) do Inter (POST /webhook/checkout-boleto-inter-criar).
// Qualquer falha ou resposta incompleta cai no Pagar.me como sempre (fail-open). Painel: GET /webhook/pix-provedor?t=TOKEN.
const root = $('Checkout Recebido').first().json;
const b = root.body || root || {};
let out = { via_inter: false };
const pm = String(b.payment_method || '');
if (pm === 'pix' || pm === 'boleto') {
  const url = 'https://n8n.americanutrition.com/webhook/' + (pm === 'pix' ? 'checkout-pix-inter-criar' : 'checkout-boleto-inter-criar');
  try {
    const r = await this.helpers.httpRequest({ method: 'POST', url: url, json: true, timeout: 60000, body: b });
    const completo = r && r.order_id && (pm === 'pix' ? r.pix_qr_code : (r.boleto_url && r.boleto_line));
    if (completo) { out = Object.assign({ via_inter: true }, r); }
    else { out = { via_inter: false, motivo: String((r && r.motivo) || 'resposta incompleta').slice(0, 200) }; }
  } catch (e) { out = { via_inter: false, motivo: String(e && e.message || e).slice(0, 200) }; }
}
return [{ json: out }];
