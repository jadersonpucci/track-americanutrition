// Node "Limite proativo" do "[Serena WhatsApp] Envio Samuel (texto ou audio)" (n8n EhmndFruX6hOIRDN), entre
// "Webhook Enviar" e "Pular opt-out?" (que leva ao "Preparar" ou direto ao "Responder").
// 21/11/2026: antes de cada envio pede vaga no limite global de mensagens proativas
// (POST /webhook/wpp-vaga -> wpp_aguardar_vaga, limite-proativo.sql). Conversa ativa, equipe e LID passam na hora;
// proativo espera ate 30s por vaga (6 por minuto, somando todos os robos). Se o limite falhar, segue (nunca trava envio).
// Item 3 (SAIR, texto aprovado em 21/11):
//  - quem respondeu SAIR (serena_wpp_optout, optout-sair.sql) nao recebe proativo: responde { ok: false, erro: 'optout_sair' };
//  - proativo de verdade (nao transacional/pos-entrega, nao rastreio/retirada, ultima mensagem da conversa nao e do
//    cliente) ganha a linha do SAIR no fim do texto.
const RODAPE = '_Se preferir não receber mensagens por aqui, é só responder SAIR._';
const item = $input.first();
const b = (item.json && item.json.body) || item.json || {};
const number = String(b.number || b.telefone || '');
let r = null;
try {
  const x = await this.helpers.httpRequest({ method: 'POST', url: 'https://n8n.americanutrition.com/webhook/wpp-vaga', json: true, timeout: 40000, body: { number } });
  r = (x && x.r) || null;
} catch (e) { r = null; /* sem limite: envia */ }
const tipo = r && r.tipo;
if (tipo === 'optout') {
  return [{ json: { _pular: true, ok: false, tipo: 'texto', modelo: null, message_id: null, erro: 'optout_sair' } }];
}
const autor = String(b.autor || '');
const transacional = /^(transacional|pos_entrega)/i.test(autor);
const texto = typeof b.text === 'string' ? b.text : '';
if (tipo === 'proativo' && !transacional && !(r && r.ultima_cliente) && texto.trim() && !b.lista && !b.audio_texto
    && !/track\.americanutrition\.com|retirar|retirada/i.test(texto) && !/responder SAIR/i.test(texto)) {
  b.text = texto.replace(/\s+$/, '') + '\n\n' + RODAPE;
  if (item.json && item.json.body) item.json.body = b;
}
return [item];
