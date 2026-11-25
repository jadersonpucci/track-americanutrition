// No "Sem J&T (23/11)" do workflow "Envia.com — Cotacao de Frete" (lszlpy1Pl4dnHW2w), POST /webhook/frete-cotacao,
// entre "Normalizar Opcoes + Regra Gratis" e "Renomear JT".
// 23/11/2026, pedido do Jaderson: J&T Express desligada no checkout e na Serena (os dois usam /webhook/frete-cotacao).
// Ficam so Correios (SEDEX e PAC) e o Frete Gratis. Para religar: JT_OFF = false (ou ligar Normalizar -> Renomear JT direto).
const JT_OFF = true;
const out = [];
for (const it of $input.all()) {
  const j = Object.assign({}, it.json || {});
  if (JT_OFF && Array.isArray(j.options)) {
    j.options = j.options.filter(function (o) {
      const alvo = String(o.carrier || '') + ' ' + String(o.service || '') + ' ' + String(o.id || '');
      return !/j\s*&?\s*t\b|jtexpress|jt_|j&t/i.test(alvo);
    });
  }
  out.push({ json: j });
}
return out;
