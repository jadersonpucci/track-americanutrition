// No "Sem J&T (23/11)" do workflow "Envia.com — Cotacao de Frete" (lszlpy1Pl4dnHW2w), POST /webhook/frete-cotacao,
// entre "Normalizar Opcoes + Regra Gratis" e "Renomear JT".
// 23/11/2026, pedido do Jaderson: J&T Express desligada no checkout e na Serena (os dois usam /webhook/frete-cotacao).
// Ficam so Correios (SEDEX e PAC) e o Frete Gratis. Para religar: ligar a conexao Normalizar -> Renomear JT direto (ou JT_OFF = false).
// 26/11/2026, pedido do Jaderson: na Black NAO tem frete gratis. De 26/11 20h ate 30/11 23h59 (Brasilia) a opcao
// "Frete Gratis" sai da lista e free_shipping vai false (checkout e Serena). Fora da janela volta sozinho.
const JT_OFF = true;
const BLACK_INI = Date.parse('2026-11-26T20:00:00-03:00');
const BLACK_FIM = Date.parse('2026-11-30T23:59:59-03:00');
const agora = Date.now();
const semFreteGratis = agora >= BLACK_INI && agora <= BLACK_FIM;
const out = [];
for (const it of $input.all()) {
  const j = Object.assign({}, it.json || {});
  if (JT_OFF && Array.isArray(j.options)) {
    j.options = j.options.filter(function (o) {
      const alvo = String(o.carrier || '') + ' ' + String(o.service || '') + ' ' + String(o.id || '');
      return !/j\s*&?\s*t\b|jtexpress|jt_|j&t/i.test(alvo);
    });
  }
  if (semFreteGratis) {
    if (Array.isArray(j.options)) j.options = j.options.filter(function (o) { return o && o.id !== 'gratis' && Number(o.price) > 0; });
    j.free_shipping = false;
    j.black_sem_frete_gratis = true;
  }
  out.push({ json: j });
}
return out;
