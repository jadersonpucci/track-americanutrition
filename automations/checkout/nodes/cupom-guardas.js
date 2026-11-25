// No 'Guardas (Meia-Noite + Esquenta exclusivo)' do workflow "Shopify — Validar Cupom" (rIOXH8eJm1Yb2t21,
// /webhook/cupom-validar), entre o 'Formatar Cupom' e o 'Responder'.
// PROMO-MEIANOITE 23/10/2026: cupom MEIANOITE-4K9X limitado a 3 frascos (3 x R$ 327 = R$ 981). Remover apos a promo.
const CODE = 'MEIANOITE-4K9X';
const LIMITE = 981.5;
const MSG = 'Este cupom vale para no máximo 3 frascos de ImunoFosfo. Ajuste a quantidade e aplique o cupom de novo.';
// EXCLUSIVOS 09/11/2026 (Jaderson: "cupom do esquenta nao pode somar com outros cupons"): quando um destes vem
// junto com outros codigos (o checkout aceita 'A,B' = desconto + frete gratis + brinde), so o exclusivo vale.
// Na Shopify os mesmos cupons estao com combinesWith todo false.
const EXCLUSIVOS = ['ESQ10-U5E', 'ESQ15-U5E'];
const MSG_EXC = 'O cupom do Esquenta Black Friday não pode ser usado junto com outros cupons.';
let out = Object.assign({}, $input.first().json || {});
let subtotal = 0;
try { subtotal = Number($('Montar Query').item.json.subtotal || 0); } catch (e) { subtotal = 0; }
const bloqueia = function(c){ return !!(c && c.valid && String(c.code || '').toUpperCase() === CODE && subtotal > LIMITE); };
if (out.multi && Array.isArray(out.coupons)) {
  out.coupons = out.coupons.map(function(c){ return bloqueia(c) ? { valid:false, code:c.code, reason:'limite_frascos', message:MSG } : c; });
  const exc = out.coupons.find(function(c){ return c && c.valid && EXCLUSIVOS.indexOf(String(c.code || '').toUpperCase()) > -1; });
  if (exc) {
    out.coupons = out.coupons.map(function(c){ return (c === exc || !c) ? c : { valid:false, code:c.code, reason:'nao_acumula', message:MSG_EXC }; });
  }
  out.valid = out.coupons.some(function(c){ return c && c.valid; });
  return [{ json: out }];
}
if (bloqueia(out)) { return [{ json: { valid:false, code:out.code, reason:'limite_frascos', message:MSG } }]; }
return [{ json: out }];
