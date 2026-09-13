// [Serena Social] Comentarios IG FB — node "Marcar Oculto DB" (Code), depois de "Ocultar Facebook"/"Ocultar Instagram".
// Dois caminhos chegam aqui: o classificador (item vem de "Validar Resposta") e o botao do Telegram (item vem de
// "Acao do Botao"). No caminho do botao ele fecha tudo sozinho: grava no banco, edita o aviso com quem clicou e
// devolve zero itens para o "Log de Auditoria" nao rodar (aquele no so entende o fluxo do classificador).
const SK = 'SUPABASE_SERVICE_KEY';
const PG = 'https://supabase.americanutrition.com/pg/query';
const BOT = 'https://api.telegram.org/bot<TOKEN_SERENA>/';
const sql = async (query) => await this.helpers.httpRequest({ method: 'POST', url: PG, headers: { apikey: SK, Authorization: 'Bearer ' + SK, 'Content-Type': 'application/json' }, body: { query }, json: true });
const esc = (s) => String(s == null ? '' : s).replace(/'/g, "''").slice(0, 200);
const NL = String.fromCharCode(10);

let base = null;
let botao = null;
try { base = $('Validar Resposta').first().json; } catch (e) { base = null; }
if (!base) { try { botao = $('Acao do Botao').first().json; } catch (e) { botao = null; } base = botao; }
if (!base || !base.comment_id) return [];
const cid = base.comment_id;
const resp = $input.first().json || {};
const st = resp.statusCode;
const body = (resp.body !== undefined) ? resp.body : resp;
const temErro = (typeof st === 'number' && st >= 400) || !!(body && body.error);

if (botao) {
  const tg = async (metodo, corpo) => { try { return await this.helpers.httpRequest({ method: 'POST', url: BOT + metodo, json: true, timeout: 15000, body: corpo }); } catch (e) { return null; } };
  let linha = '';
  let teclado = [];
  if (!temErro) {
    try {
      if (botao.desocultar) {
        await sql("update fb_comentarios set oculto = false, acao = 'avisar', motivo = left(coalesce(motivo, '') || ' | reexibido por " + esc(botao.quem) + " (botao)', 900), atualizado_em = now() where comment_id = '" + esc(cid) + "'");
        linha = '👁 Reexibido por ' + botao.quem + ' às ' + botao.hora;
        teclado = [[{ text: '🙈 Ocultar de novo', callback_data: 'soc:oc:' + cid }]];
      } else {
        await sql("update fb_comentarios set oculto = true, acao = 'ocultar', motivo = left(coalesce(motivo, '') || ' | ocultado por " + esc(botao.quem) + " (botao)', 900), atualizado_em = now() where comment_id = '" + esc(cid) + "'");
        linha = '🙈 Ocultado por ' + botao.quem + ' às ' + botao.hora;
        teclado = [[{ text: '👁 Reexibir', callback_data: 'soc:re:' + cid }]];
      }
    } catch (e) { linha = (botao.desocultar ? '👁 Reexibido' : '🙈 Ocultado') + ' por ' + botao.quem + ' (banco nao atualizou: ' + String((e && e.message) || e).slice(0, 80) + ')'; }
  } else {
    const err = (body && body.error && body.error.message) ? String(body.error.message).slice(0, 120) : ('status ' + st);
    linha = '❌ Não consegui ' + (botao.desocultar ? 'reexibir' : 'ocultar') + ': ' + err;
    teclado = [[{ text: '🔁 Tentar de novo', callback_data: 'soc:' + (botao.desocultar ? 're' : 'oc') + ':' + cid }]];
  }
  if (botao.chat_id && botao.message_id) await tg('editMessageText', { chat_id: botao.chat_id, message_id: botao.message_id, text: String(botao.texto_msg || '') + NL + NL + linha, entities: botao.entities || [], reply_markup: { inline_keyboard: teclado }, disable_web_page_preview: true });
  return [];
}

if (!temErro) {
  try {
    await sql("update fb_comentarios set oculto=true, atualizado_em=now() where comment_id='" + esc(cid) + "';");
  } catch (e) {
    return [{ json: Object.assign({}, base, { marcar_oculto_erro: String((e && e.message) || e) }) }];
  }
} else {
  return [{ json: Object.assign({}, base, { marcar_oculto_pulado: 'ocultacao_falhou_no_graph', graph_status: st || null }) }];
}
return [{ json: base }];
