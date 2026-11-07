// No "Esquenta: Cupom do Representante" do workflow Afiliados - Registrar Comissão (PNAFMdGMpTr8GSfU),
// entre "Cupom Digitado Primeiro" e "Registrar Conversao". 07/11/2026.
// O link da Serena leva o cupom do Esquenta (ESQ10-U5E / ESQ15-U5E), que e da casa. Se o cliente se cadastrou pelo texto
// de um representante (esquenta_bf.indicacao_cupom), o cupom do representante entra no inicio de discount_codes (valor 0)
// e o resolver_afiliado atribui a venda a ele. A regra de cap em promocao da casa continua valendo.
const ESQ = ['ESQ10-U5E', 'ESQ15-U5E'];
const SB = 'https://supabase.americanutrition.com';
const SK = 'SUPABASE_SERVICE_KEY';
const j = $input.first().json || {};
const o = j.body ? j.body : j;
let esquenta = null;
try {
  const atuais = Array.isArray(o.discount_codes) ? o.discount_codes : [];
  const up = (s) => String(s || '').trim().toUpperCase();
  if (atuais.some((d) => ESQ.indexOf(up(d && d.code)) >= 0)) {
    // telefone "DDD + 8 ultimos digitos" (tolera o 9o digito e o +55)
    const chave = (t) => { let d = String(t || '').replace(/\D/g, ''); if (d.length >= 12 && d.indexOf('55') === 0) d = d.slice(2); return d.length >= 10 ? d.slice(0, 2) + d.slice(-8) : ''; };
    const na = Array.isArray(o.note_attributes) ? o.note_attributes : [];
    const tels = [(o.customer || {}).phone, o.phone, (o.shipping_address || {}).phone, (o.billing_address || {}).phone]
      .concat(na.filter((n) => n && /whats|telefone|celular/i.test(String(n.name))).map((n) => n.value));
    const chaves = tels.map(chave).filter(Boolean);
    if (chaves.length) {
      const lista = await this.helpers.httpRequest({ method: 'GET', url: SB + '/rest/v1/esquenta_bf?indicacao_cupom=not.is.null&select=telefone,indicacao,indicacao_cupom', headers: { apikey: SK, Authorization: 'Bearer ' + SK }, json: true, timeout: 15000 });
      const achou = (lista || []).find((r) => chaves.indexOf(chave(r.telefone)) >= 0);
      if (achou && achou.indicacao_cupom) {
        const cup = String(achou.indicacao_cupom);
        if (!atuais.some((d) => up(d && d.code) === up(cup))) {
          o.discount_codes = [{ code: cup, amount: '0.00', type: 'fixed_amount' }].concat(atuais);
        }
        esquenta = { indicacao: achou.indicacao, cupom: cup };
      }
    }
  }
} catch (e) { esquenta = { erro: String((e && e.message) || e).slice(0, 200) }; }
return [{ json: { body: o, esquenta: esquenta } }];
