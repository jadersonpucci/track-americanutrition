const r = $input.first().json || {};
const texto = String(r.resposta || '').trim();
if (!texto) return [];
const MAX = 900;
let partes = [];
if (texto.length <= MAX) {
  partes = [texto];
} else {
  const paras = texto.split(/\n\s*\n/);
  let cur = '';
  for (const p of paras) {
    if (cur && (cur + '\n\n' + p).length > MAX) { partes.push(cur); cur = p; }
    else { cur = cur ? cur + '\n\n' + p : p; }
  }
  if (cur) partes.push(cur);
}
const number = String(r.telefone || '').replace(/\D/g, '');
// Ordem das partes: a Evolution aplica o 'delay' (digitando...) de cada envio por conta propria, entao uma parte curta
// com delay menor chegava ANTES de uma parte longa enviada antes dela. Cada parte agora espera pelo menos
// o delay da anterior + 600 ms, garantindo a ordem.
let anterior = 0;
return partes.map((t, i) => {
  let delay = Math.min(2500, Math.max(800, Math.round(t.length * 8)));
  if (i > 0) delay = Math.min(8000, Math.max(delay, anterior + 600));
  anterior = delay;
  return { json: { number: number, text: t, delay: delay, contato_id: r.contato_id, parte: i + 1, total: partes.length } };
});
