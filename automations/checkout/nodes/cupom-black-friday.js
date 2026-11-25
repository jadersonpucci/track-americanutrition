// No 'Black: cupons' do workflow "Shopify — Validar Cupom" (rIOXH8eJm1Yb2t21, /webhook/cupom-validar), entre
// 'Guardas (Meia-Noite + Esquenta exclusivo)' e 'Responder'. 22/11/2026, decisão do Jaderson para a Black Friday:
// "nenhum desconto atual soma com o da Black" e "cupom deles (afiliados) com desconto zero durante a Black".
//  - Cupom de afiliado ativo (POST /webhook/afiliado-cupom): vale com 0%. Ele segue para o carrinho e para o pedido só
//    para marcar a venda para a representante; o desconto é o automático da Black (a Shopify aplica o maior quando os
//    descontos não combinam: testado com PACK 6+ x PROMO5 em 22/11).
//  - Qualquer outro cupom (desconto, frete grátis, brinde, Esquenta): recusado com a mensagem abaixo.
// Fora da janela (26/11 20h a 30/11 23h59, Brasília) não faz nada. Teste antes da Black: body.teste_black = 'sim'.
const INI = Date.parse('2026-11-26T23:00:00Z');
const FIM = Date.parse('2026-12-01T03:00:00Z');
const MSG = 'Na Black Friday o desconto já está aplicado no carrinho e não soma com cupons.';
let out = Object.assign({}, $input.first().json || {});
let teste = false;
try { teste = String((($('Cupom Recebido').first().json || {}).body || {}).teste_black || '') === 'sim'; } catch (e) { teste = false; }
const agora = Date.now();
if (!teste && (agora < INI || agora >= FIM)) return [{ json: out }];
const lista = (out.multi && Array.isArray(out.coupons)) ? out.coupons : [out];
const codes = lista.filter(function (c) { return c && c.code; }).map(function (c) { return String(c.code); });
const afs = {};
try {
  const r = await this.helpers.httpRequest({ method: 'POST', url: 'https://n8n.americanutrition.com/webhook/afiliado-cupom', json: true, timeout: 8000, body: { codes: codes } });
  ((r && r.afiliados) || []).forEach(function (c) { afs[String(c).toUpperCase()] = true; });
} catch (e) { /* sem resposta: trata todos como cupom comum (recusa) */ }
const conv = function (c) {
  if (!c || !c.code) return c;
  if (afs[String(c.code).toUpperCase()]) return { valid: true, kind: 'percentage', value: 0, code: c.code, title: 'Black Friday: desconto já aplicado no carrinho', black: true };
  return { valid: false, code: c.code, reason: 'black_friday', message: MSG };
};
if (out.multi && Array.isArray(out.coupons)) {
  out.coupons = out.coupons.map(conv);
  out.valid = out.coupons.some(function (c) { return c && c.valid; });
  return [{ json: out }];
}
return [{ json: conv(out) }];
