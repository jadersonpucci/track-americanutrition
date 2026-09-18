// AN-PIX-INTER (set/2026): se checkout_config.pix_provider = 'inter' e o metodo for pix, a cobranca sai pelo Banco Inter
// (workflow "AN - PIX Banco Inter (Provedor)", POST /webhook/checkout-pix-inter-criar). Qualquer falha ou resposta sem
// pix_qr_code cai no Pagar.me como sempre (fail-open). Painel para ligar/desligar: GET /webhook/pix-provedor?t=TOKEN.
const root = $('Checkout Recebido').first().json;
const b = root.body || root || {};
let out = { via_inter: false };
if (String(b.payment_method || '') === 'pix') {
  try {
    const r = await this.helpers.httpRequest({ method: 'POST', url: 'https://n8n.americanutrition.com/webhook/checkout-pix-inter-criar', json: true, timeout: 45000, body: b });
    if (r && r.pix_qr_code && r.order_id) { out = Object.assign({ via_inter: true }, r); }
    else { out = { via_inter: false, motivo: String((r && r.motivo) || 'sem pix_qr_code').slice(0, 200) }; }
  } catch (e) { out = { via_inter: false, motivo: String(e && e.message || e).slice(0, 200) }; }
}
return [{ json: out }];
