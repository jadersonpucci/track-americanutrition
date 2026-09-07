const o = $('Triagem').first().json;
const r = $input.first().json || {};
const t = String(r.text || '').trim();
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
