// No 'Cupom Digitado Primeiro' do workflow "Afiliados - Registrar Comissão" (PNAFMdGMpTr8GSfU), entre o webhook e o
// 'Registrar Conversao'.
// 03/11/2026, pedido do Jaderson ("o cupom precisa vencer"): a Sueli (AN-16220) digitou PROMO5 (Vivian), mas o
// navegador dela guardava o bg_ref de um link do Pedro de junho. O pedido chega aqui com discount_codes = [bg_ref] e o
// cupom digitado so na anotacao "Cupom usado"; o resolver_afiliado da vitoria ao primeiro codigo que for de um
// afiliado, entao o link guardado ganhava do cupom. Aqui o cupom digitado vai para o inicio da lista. Cupom da casa
// (que nao e de afiliado) nao casa com ninguem e o link segue valendo, como antes.
const j = $input.first().json || {};
const o = j.body ? j.body : j;
try {
  const na = Array.isArray(o.note_attributes) ? o.note_attributes : [];
  const cu = na.find((n) => n && n.name === 'Cupom usado');
  const digitados = cu && cu.value ? String(cu.value).split(',').map((s) => s.trim()).filter(Boolean) : [];
  if (digitados.length) {
    const atuais = Array.isArray(o.discount_codes) ? o.discount_codes.slice() : [];
    const chave = (c) => String(c || '').trim().toLowerCase();
    const primeiro = digitados.map((c) => atuais.find((d) => d && chave(d.code) === chave(c)) || { code: c, amount: '0.00', type: 'fixed_amount' });
    const resto = atuais.filter((d) => !digitados.some((c) => chave(c) === chave(d && d.code)));
    o.discount_codes = primeiro.concat(resto);
  }
} catch (e) {}
return [{ json: { body: o } }];
