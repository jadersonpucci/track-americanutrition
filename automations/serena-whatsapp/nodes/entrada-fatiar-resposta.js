const r = $input.first().json || {};
const texto = String(r.resposta || '').trim();
if (!texto) return [];
const MAX = 900;

// Codigo de pagamento (PIX copia e cola ou linha digitavel do boleto) vai SOZINHO numa mensagem:
// no WhatsApp o cliente copia a mensagem inteira, entao codigo misturado com texto nao cola no app do banco.
// O PIX BR Code comeca com 0002010x e termina em 6304 + 4 caracteres (CRC); a linha digitavel tem 47 ou 48 digitos.
const RE_PIX = /0002010[0-9][\s\S]{40,}?6304[0-9A-Fa-f]{4}/;
const RE_BOLETO = /\d{5}[. ]?\d{5}[ ]+\d{5}[. ]?\d{6}[ ]+\d{5}[. ]?\d{6}[ ]+\d[ ]+\d{14}|\b\d{47,48}\b/;
const INSTR_PIX = 'Seu pedido já está registrado, falta só o pagamento ✅\n\nPara pagar, toque e segure na mensagem abaixo, escolha *Copiar* e cole no app do seu banco, em *Pix > Pix Copia e Cola*. Não precisa clicar no código, ele não é um link 💙';
const DICA = 'Toque e segure na mensagem abaixo e escolha *Copiar* — o código não é um link 💙';
const INSTR_BOLETO = 'Seu pedido já está registrado, falta só o pagamento ✅\n\nPara pagar, toque e segure na mensagem abaixo, escolha *Copiar* e cole no app do seu banco, na opção de pagar boleto pelo código de barras 💙';

function quebrar(t) {
  t = String(t || '').trim();
  if (!t) return [];
  if (t.length <= MAX) return [t];
  const paras = t.split(/\n\s*\n/);
  const out = [];
  let cur = '';
  for (const p of paras) {
    if (cur && (cur + '\n\n' + p).length > MAX) { out.push(cur); cur = p; }
    else { cur = cur ? cur + '\n\n' + p : p; }
  }
  if (cur) out.push(cur);
  return out;
}

let partes = [];
const mp = texto.match(RE_PIX);
const mb = mp ? null : texto.match(RE_BOLETO);
const m = mp || mb;
if (m) {
  const codigo = m[0].trim();
  const i = texto.indexOf(m[0]);
  let antes = texto.slice(0, i).trim();
  const depois = texto.slice(i + m[0].length).trim();
  const instr = mp ? INSTR_PIX : INSTR_BOLETO;
  // a explicacao fica na mensagem logo antes do codigo (a Serena pode ja ter escrito a dela; a nossa e a garantia)
  // tira um rotulo solto no fim ("PIX copia e cola:", "Linha digitavel:"), que a instrucao abaixo substitui
  antes = antes.replace(/\n[^\n]{0,60}:\s*$/, '').replace(/[:\s]*$/, '');
  // se a Serena (ou a ferramenta) ja explicou como pagar, nao repete a explicacao: entra so a dica de copiar
  const jaExplica = /(copi|cole)[^\n]{0,80}(banco|copia e cola|c[oó]digo de barras)/i.test(antes);
  antes = (antes ? antes + '\n\n' : '') + (jaExplica ? DICA : instr);
  partes = quebrar(antes).concat([codigo], quebrar(depois));
} else {
  partes = quebrar(texto);
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
  // arquivo (PDF/imagem marcado com [[ARQUIVO: ...]] no Core) e a lista vao junto da ultima parte, para o no seguinte enviar depois do texto
  const ultimo = i === partes.length - 1;
  return { json: { number: number, text: t, delay: delay, contato_id: r.contato_id, parte: i + 1, total: partes.length, arquivo: ultimo ? (r.arquivo || null) : null, lista: ultimo ? (r.lista || null) : null } };
});
