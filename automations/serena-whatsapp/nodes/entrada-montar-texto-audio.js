const o = $('Triagem').first().json;
// ACENTOS (15/09/2026): cerca de 20% das transcricoes chegavam com "茅", "n茫o" (bytes UTF-8 lidos como
// GBK pelo no HTTP, que adivinhava o charset). O no Transcrever agora devolve a resposta como ARQUIVO
// (binario "data") e aqui os bytes sao lidos em UTF-8 de verdade. Se vier JSON normal, segue como antes.
let r = $input.first().json || {};
try {
  const bin = $input.first().binary;
  if (bin && bin.data) {
    const buf = await this.helpers.getBinaryDataBuffer(0, 'data');
    r = JSON.parse(buf.toString('utf8'));
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
return [{ json: { telefone: o.telefone, lid: o.lid, nome: o.nome, msg_id: o.msg_id, tipo: ehVideo ? 'video' : 'audio', texto: texto } }];
