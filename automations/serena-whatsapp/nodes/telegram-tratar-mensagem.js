// Node "Tratar Mensagem" do workflow "Serena | Telegram" (n8n GwreSR7VN3bfSqaO).
// Webhook POST /webhook/serena-telegram, apontado no bot @AmericaNutritionSerena_bot.
// Chaves reais so no n8n.
const SK = 'SUPABASE_SERVICE_KEY';
const SB = 'https://supabase.americanutrition.com/pg/query';
const CORE = 'https://n8n.americanutrition.com/webhook/serena-core';
const PUSH = 'https://n8n.americanutrition.com/webhook/serena-push';
const INBOX = 'https://n8n.americanutrition.com/webhook/serena-inbox?t=an-serena-9Kx4Lm2Q';
const BOT = 'http://telegram-bot-api:8081/bot<TOKEN>/';
const BOT_PUB = 'https://api.telegram.org/bot<TOKEN>/';
const TG_EQUIPE = '6531084136';
const self = this;
const NL = String.fromCharCode(10);
const E = (v) => (v === null || v === undefined || v === '') ? 'null' : ("'" + String(v).replace(/'/g, "''") + "'");
const req = async (o) => { try { return await self.helpers.httpRequest(o); } catch (e) { return null; } };
async function sql(s) {
  const r = await req({ method: 'POST', url: SB, headers: { apikey: SK, Authorization: 'Bearer ' + SK, 'Content-Type': 'application/json' }, body: { query: s }, json: true, timeout: 30000 });
  return Array.isArray(r) ? r : [];
}
const tg = async (metodo, corpo) => await req({ method: 'POST', url: BOT + metodo, headers: { 'Content-Type': 'application/json' }, body: corpo, json: true, timeout: 30000 });

// O Core so devolve o campo lista quando o canal e whatsapp com lista nativa ligada.
// Fora disso ele coloca as opcoes numeradas no proprio texto, fechando com
// "_Responde so com o numero_". Aqui esse bloco vira teclado inline de verdade.
function extrairLista(txt, doCore) {
  if (doCore && Array.isArray(doCore.opcoes) && doCore.opcoes.length >= 2) {
    return { texto: txt, titulo: String(doCore.titulo || 'Escolha uma opcao'), ops: doCore.opcoes.slice(0, 8) };
  }
  const linhas = String(txt || '').split(NL);
  let fim = linhas.length - 1;
  while (fim >= 0 && !linhas[fim].trim()) fim--;
  if (fim < 1) return null;
  if (!/responde\s+s[oó]\s+com\s+o\s+n[uú]mero/i.test(linhas[fim])) return null;
  const ops = [];
  let i = fim - 1;
  while (i >= 0) {
    const m = linhas[i].trim().match(/^(\d{1,2})[.)]\s*(.+)$/);
    if (!m) break;
    ops.unshift(m[2].trim());
    i--;
  }
  if (ops.length < 2) return null;
  const titulo = (linhas[i] || '').trim();
  return { texto: linhas.slice(0, i).join(NL).trim(), titulo: (titulo || 'Escolha uma opcao').slice(0, 200), ops: ops.slice(0, 8) };
}

const upd = $json.body || $json;
const cq = upd.callback_query || null;
const msg = cq ? null : (upd.message || upd.edited_message || null);
const chat = cq ? (cq.message && cq.message.chat) : (msg && msg.chat);
if (!chat || !chat.id) return [];
// so conversa privada: em grupo quem cuida e o workflow de moderacao
if (String(chat.type || 'private') !== 'private') return [];
const chatId = String(chat.id);

// nao processa o mesmo update duas vezes (o Telegram reenvia quando o webhook demora)
const st = $getWorkflowStaticData('global');
const agora = Date.now();
st.vistos = st.vistos || {};
for (const k in st.vistos) { if (agora - st.vistos[k] > 3600000) delete st.vistos[k]; }
const uid = String(upd.update_id || '');
if (uid) { if (st.vistos[uid]) return []; st.vistos[uid] = agora; }

const sid = 'tg-' + chatId;
const nome = String(((cq ? cq.from : msg.from) || {}).first_name || '').slice(0, 60);

let contatoId = null;
const achado = await sql('select id from serena_contatos where session_site = ' + E(sid) + ' limit 1');
if (achado.length && achado[0].id) { contatoId = achado[0].id; }
else {
  const ins = await sql('insert into serena_contatos (session_site, nome) values (' + E(sid) + ', ' + E(nome || null) + ') returning id');
  contatoId = (ins.length && ins[0].id) ? ins[0].id : null;
}
if (!contatoId) return [];

// o telefone fica em serena_fatos, nao em serena_contatos: evita conflito com o contato
// que a mesma pessoa ja tem por WhatsApp e ainda assim libera a busca de pedidos na Shopify
let telefone = '';
const ft = await sql("select valor from serena_fatos where contato_id = " + E(contatoId) + "::uuid and chave = 'telefone' limit 1");
if (ft.length && ft[0].valor) telefone = String(ft[0].valor).replace(/[^0-9]/g, '');

const BOTAO_TEL = { keyboard: [[{ text: '\u{1F4F1} Compartilhar meu telefone', request_contact: true }]], resize_keyboard: true, one_time_keyboard: true };
const enviar = async (texto, extra) => await tg('sendMessage', Object.assign({ chat_id: chatId, text: texto, disable_web_page_preview: false }, extra || {}));
// o webhook ja mandou a resposta: marca entregue para o cron de 1 minuto nao mandar de novo
const marcarEntregue = async () => await sql("update serena_mensagens set entregue = true where contato_id = " + E(contatoId) + "::uuid and papel = 'serena' and entregue is distinct from true");

let texto = '';
if (cq) {
  await tg('answerCallbackQuery', { callback_query_id: cq.id });
  const linha = Number(String(cq.data || '').replace(/[^0-9]/g, ''));
  const kb = (cq.message && cq.message.reply_markup && cq.message.reply_markup.inline_keyboard) || [];
  texto = (kb[linha] && kb[linha][0] && kb[linha][0].text) ? String(kb[linha][0].text) : '';
  if (!texto) return [];
  await tg('editMessageReplyMarkup', { chat_id: chatId, message_id: cq.message.message_id, reply_markup: { inline_keyboard: [] } });
} else if (msg.contact && msg.contact.phone_number) {
  let tel = String(msg.contact.phone_number).replace(/[^0-9]/g, '');
  if (tel.length >= 10 && tel.indexOf('55') !== 0) tel = '55' + tel;
  await sql("insert into serena_fatos (contato_id, chave, valor, origem) values (" + E(contatoId) + "::uuid, 'telefone', " + E(tel) + ", 'cliente') on conflict (contato_id, chave) do update set valor = excluded.valor, atualizado_em = now()");
  await enviar('Perfeito, obrigada! \u{1F499} Agora consigo ver seus pedidos e o rastreio por aqui. O que voce precisa?', { reply_markup: { remove_keyboard: true } });
  return [{ json: { ok: true, acao: 'telefone_salvo', chat_id: chatId } }];
} else if (msg.text && msg.text.trim().indexOf('/start') === 0) {
  await enviar('Oi! Sou a Serena, do atendimento da America Nutrition \u{1F499}' + NL + NL
    + 'Posso te ajudar com produtos, preco, frete, pagamento e rastreio do seu pedido.' + NL + NL
    + 'Se quiser, toque no botao abaixo para compartilhar seu telefone: assim eu ja acho seus pedidos sem voce precisar digitar nada. Ou e so me escrever direto.',
    { reply_markup: BOTAO_TEL });
  await req({ method: 'POST', url: BOT_PUB + 'sendMessage', json: true, timeout: 10000,
    body: { chat_id: TG_EQUIPE, parse_mode: 'HTML', disable_web_page_preview: true, text: '\u{1F680} <b>Nova conversa no Telegram</b>' + NL + (nome || 'sem nome') + NL + NL + '<a href="' + INBOX + '">Abrir no Inbox</a>' } });
  return [{ json: { ok: true, acao: 'start', chat_id: chatId } }];
} else {
  // NUNCA ficar em silencio: midia que eu ainda nao leio vira um pedido de texto,
  // senao o cliente manda um video e nao recebe resposta nenhuma.
  texto = String(msg.text || msg.caption || '').trim();
  if (!texto) {
    if (msg.voice || msg.audio || msg.video_note) {
      await enviar('Ainda nao consigo ouvir audio por aqui \u{1F605} Pode me escrever em poucas palavras o que voce precisa? Se preferir falar com uma pessoa, e so pedir.');
      return [{ json: { ok: true, acao: 'audio_sem_texto', chat_id: chatId } }];
    }
    if (msg.photo) { texto = '[O cliente mandou uma foto, sem escrever nada junto]'; }
    else if (msg.video || msg.animation) {
      await enviar('Recebi seu video \u{1F499} Ainda nao consigo assisti-lo por aqui. Me conta em uma frase o que voce precisa, ou peca para falar com uma pessoa da equipe.');
      return [{ json: { ok: true, acao: 'video_sem_texto', chat_id: chatId } }];
    }
    else if (msg.document || msg.sticker || msg.location || msg.poll) {
      await enviar('Recebi \u{1F499} Me conta em uma frase o que voce precisa que eu te ajudo, ou peca para falar com uma pessoa da equipe.');
      return [{ json: { ok: true, acao: 'midia_sem_texto', chat_id: chatId } }];
    }
    else { return []; }
  }
}
texto = texto.slice(0, 1200);

await tg('sendChatAction', { chat_id: chatId, action: 'typing' });
const corpo = { canal: 'telegram', contato_id: contatoId, session_site: sid, texto: texto };
if (nome) corpo.nome = nome;
if (telefone.length >= 10) corpo.telefone = telefone;
const r = await req({ method: 'POST', url: CORE, json: true, timeout: 180000, body: corpo });

if (!r) { await enviar('Tive um problema tecnico agora. Tente de novo em instantes, por favor.'); return [{ json: { ok: false, chat_id: chatId } }]; }
if (r.pausada === true) { return [{ json: { ok: true, acao: 'pausada', chat_id: chatId } }]; }

let resposta = String(r.resposta || '').replace(/\[\[ARQUIVO:[^\]]*\]\]/gi, '').trim();
let inline = null;
const ex = extrairLista(resposta, r.lista);
if (ex) {
  resposta = ex.texto;
  inline = { titulo: ex.titulo, teclado: { inline_keyboard: ex.ops.map((o, i) => [{ text: String(o).slice(0, 60), callback_data: 'op:' + i }]) } };
}

let enviou = false;
if (resposta) { const e1 = await enviar(resposta, { reply_markup: { remove_keyboard: true } }); enviou = !!e1; }
if (inline) { const e2 = await enviar(inline.titulo, { reply_markup: inline.teclado }); enviou = enviou || !!e2; }
if (enviou) await marcarEntregue();
if (r.arquivo && r.arquivo.url) await tg('sendDocument', { chat_id: chatId, document: r.arquivo.url, caption: String(r.arquivo.nome || '').slice(0, 200) });
if (r.handoff) {
  await req({ method: 'POST', url: PUSH, json: true, timeout: 15000, body: { titulo: '\u{1F199} Telegram: aguardando atendente', corpo: texto.slice(0, 140), url: INBOX, tag: 'tg-' + chatId } });
}
return [{ json: { ok: true, chat_id: chatId, handoff: !!r.handoff, botoes: inline ? inline.teclado.inline_keyboard.length : 0, entregue: enviou } }];
