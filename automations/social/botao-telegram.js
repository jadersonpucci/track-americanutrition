// [Serena Social] Comentarios IG FB — node "Acao do Botao" (Code, runOnceForAllItems), depois do webhook
// POST /webhook/serena-social-botao. Recebe o clique nos botoes do aviso de moderacao (topico 284):
//   soc:oc:<comment_id>  Ocultar   -> segue para "Plataforma para Ocultar" (Graph, mesma credencial do fluxo normal)
//   soc:re:<comment_id>  Reexibir  -> idem, com desocultar=true
//   soc:ok:<comment_id>  Deixar    -> so registra quem manteve e tira os botoes
// Quem fecha o ciclo (DB + edicao do aviso no Telegram) e o "Marcar Oculto DB". O clique chega pelo webhook
// do bot da Serena (workflow Serena | Telegram), que repassa callback_query soc:* para ca com o token.
const TOKEN = 'an-social-btn-5Rk9Tq';
const BOT = 'https://api.telegram.org/bot<TOKEN_SERENA>/';
const SK = 'SUPABASE_SERVICE_KEY';
const PG = 'https://supabase.americanutrition.com/pg/query';
const self = this;
const NL = String.fromCharCode(10);
const body = ($input.first().json || {}).body || {};
if (String(body.t || '') !== TOKEN) return [];
const cq = body.callback || {};
const m = String(cq.data || '').match(/^soc:(oc|ok|re):(.+)$/);
if (!m) return [];
const acao = m[1];
const cid = m[2].slice(0, 80);
const quem = String((cq.from && (cq.from.first_name || cq.from.username)) || 'alguem').slice(0, 40);
const chatId = cq.message && cq.message.chat ? cq.message.chat.id : null;
const msgId = cq.message ? cq.message.message_id : null;
const textoMsg = String((cq.message && cq.message.text) || '');
const entities = (cq.message && cq.message.entities) || [];
// linhas de botao de OUTROS comentarios na mesma mensagem (aviso consolidado) ficam como estao
const kbAtual = (cq.message && cq.message.reply_markup && cq.message.reply_markup.inline_keyboard) || [];
const outros = kbAtual.filter((linha) => !(linha || []).some((b) => String((b && b.callback_data) || '').slice(-cid.length - 1) === ':' + cid));
const req = async (o) => { try { return await self.helpers.httpRequest(o); } catch (e) { return null; } };
const tg = async (metodo, corpo) => await req({ method: 'POST', url: BOT + metodo, json: true, timeout: 15000, body: corpo });
const sql = async (query) => { const r = await req({ method: 'POST', url: PG, headers: { apikey: SK, Authorization: 'Bearer ' + SK, 'Content-Type': 'application/json' }, body: { query }, json: true, timeout: 15000 }); return Array.isArray(r) ? r : []; };
const E = (s) => "'" + String(s == null ? '' : s).replace(/'/g, "''").slice(0, 300) + "'";
const hora = new Date().toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' });
await tg('answerCallbackQuery', { callback_query_id: cq.id, text: { oc: 'Ocultando...', ok: 'Ok, mantido', re: 'Reexibindo...' }[acao] });
const rows = await sql('select rede, autor, texto, categoria, oculto from fb_comentarios where comment_id = ' + E(cid) + ' limit 1');
const row = rows[0] || {};
const plataforma = row.rede || (cid.indexOf('_') > 0 ? 'facebook' : 'instagram');
if (acao === 'ok') {
  await sql("update fb_comentarios set motivo = left(coalesce(motivo, '') || " + E(' | mantido por ' + quem + ' (botao)') + ", 900), atualizado_em = now() where comment_id = " + E(cid));
  if (chatId && msgId) await tg('editMessageText', { chat_id: chatId, message_id: msgId, text: textoMsg + NL + NL + '👍 Mantido por ' + quem + ' às ' + hora, entities, reply_markup: { inline_keyboard: outros }, disable_web_page_preview: true });
  return [];
}
return [{ json: { botao: true, acao_botao: acao, desocultar: acao === 're', plataforma, comment_id: cid, from_name: row.autor || '', message: row.texto || '', categoria: row.categoria || '', quem, hora, chat_id: chatId, message_id: msgId, texto_msg: textoMsg, entities, teclado_outros: outros } }];
