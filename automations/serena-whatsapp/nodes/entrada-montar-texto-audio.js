const o = $('Triagem').first().json;
// ACENTOS (15/09/2026): cerca de 20% das transcricoes chegavam com "茅", "n茫o" (bytes UTF-8 lidos como
// GBK pelo no HTTP, que adivinhava o charset). O no Transcrever agora devolve a resposta como ARQUIVO
// (binario "data") e aqui os bytes sao lidos em UTF-8 de verdade. Se vier JSON normal, segue como antes.
let r = $input.first().json || {};
const statusHttp = Number(r && r.statusCode) || 0;   // fullResponse: 200 = ok, 401 chave, 402 creditos...
let corpoBruto = '';
try {
  const bin = $input.first().binary;
  if (bin && bin.data) {
    const buf = await this.helpers.getBinaryDataBuffer(0, 'data');
    corpoBruto = buf.toString('utf8');
    r = JSON.parse(corpoBruto);
  }
} catch (e) { r = $input.first().json || {}; }
const t = String((r && r.text) || '').trim();
const ehVideo = o.tipo === 'video';
const legenda = String(o.legenda || '').trim();
let texto;
if (t) {
  texto = (ehVideo ? '[Video do cliente, fala transcrita]: ' : '[Audio do cliente, transcrito]: ') + t;
} else if (ehVideo) {
  texto = '[O cliente enviou um video sem fala (ou que nao deu para transcrever). Agradeca e pergunte o que ele quer mostrar.]';
} else {
  texto = '[Cliente enviou um audio que nao foi possivel transcrever. Peca gentilmente para escrever a mensagem.]';
}
if (legenda) texto += ' [Legenda que ele escreveu junto: ' + legenda + ']';
// 29/09: a transcricao parou de funcionar no dia 28 e ninguem percebeu por dois dias, porque a resposta
// de erro da ElevenLabs era descartada e o cliente so ouvia "nao consegui ouvir seu audio". Agora a falha
// avisa no Telegram com o status HTTP e o corpo do erro (dedupe de 30 min pelo /webhook/serena-alerta).
if (!t) {
  try {
    const motivo = 'HTTP ' + (statusHttp || '?') + ' | ' + String(corpoBruto || '(sem corpo)').replace(/\s+/g, ' ').slice(0, 300);
    await this.helpers.httpRequest({ method: 'POST', url: 'https://n8n.americanutrition.com/webhook/serena-alerta', json: true, timeout: 15000,
      body: { chave: 'transcricao_falhou', minutos: 30,
        texto: '\u{1F3A4} <b>Transcricao de audio falhou</b>' + String.fromCharCode(10) + 'Cliente: ' + String(o.nome || '') + ' (+' + String(o.telefone || '') + ')' + String.fromCharCode(10) + 'Resposta da ElevenLabs: <code>' + motivo.replace(/[<>&]/g, ' ') + '</code>' + String.fromCharCode(10) + '<i>Enquanto isso a Serena pede para o cliente escrever.</i>' } });
  } catch (e) {}
}
return [{ json: { telefone: o.telefone, lid: o.lid, nome: o.nome, msg_id: o.msg_id, tipo: ehVideo ? 'video' : 'audio', texto: texto } }];
