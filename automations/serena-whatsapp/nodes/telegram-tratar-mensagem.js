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
// grupo "America Nutrition Alertas", topico 1628 (Atendimento): a equipe inteira ve, nao so um celular
const TG_GRUPO = '-1003766435449';
const TG_TOPICO = 1628;
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
const gravar = async (papel, texto) => await sql("insert into serena_mensagens (contato_id, papel, texto, canal, entregue, criado_em) values (" + E(contatoId) + "::uuid, " + E(papel) + ", " + E(texto) + ", 'telegram', true, now())");

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
  const okTel = 'Perfeito, obrigada! \u{1F499} Agora consigo ver seus pedidos e o rastreio por aqui. O que voc\u00ea precisa?';
  await enviar(okTel, { reply_markup: { remove_keyboard: true } });
  await gravar('cliente', '[Compartilhou o telefone: ' + tel + ']');
  await gravar('serena', okTel);
  return [{ json: { ok: true, acao: 'telefone_salvo', chat_id: chatId } }];
} else if (msg.text && msg.text.trim().indexOf('/start') === 0) {
  // Grava a abertura no historico: sem isso quem so da /start e nao escreve mais nada
  // fica invisivel no Inbox, que lista pela ultima mensagem do contato.
  const boasVindas = 'Oi! Sou a Serena, do atendimento da America Nutrition \u{1F499}' + NL + NL
    + 'Posso te ajudar com produtos, pre\u00e7o, frete, pagamento e rastreio do seu pedido.' + NL + NL
    + 'Se quiser, toque no bot\u00e3o abaixo para compartilhar seu telefone: assim eu j\u00e1 acho seus pedidos sem voc\u00ea precisar digitar nada. Ou \u00e9 s\u00f3 me escrever direto.';
  await enviar(boasVindas, { reply_markup: BOTAO_TEL });
  await gravar('cliente', '[Abriu a conversa no Telegram]');
  await gravar('serena', boasVindas);
  await req({ method: 'POST', url: BOT_PUB + 'sendMessage', json: true, timeout: 10000,
    body: { chat_id: TG_GRUPO, message_thread_id: TG_TOPICO, parse_mode: 'HTML', disable_web_page_preview: true, text: '\u{1F680} <b>Nova conversa no Telegram</b>' + NL + (nome || 'sem nome') + NL + NL + '<a href="' + INBOX + '">Abrir no Inbox</a>' } });
  return [{ json: { ok: true, acao: 'start', chat_id: chatId } }];
} else {
  // NUNCA ficar em silencio: midia que eu ainda nao leio vira um pedido de texto,
  // senao o cliente manda um video e nao recebe resposta nenhuma.
  texto = String(msg.text || msg.caption || '').trim();
  if (!texto) {
    let aviso = '';
    let rotulo = '';
    if (msg.voice || msg.audio || msg.video_note) { aviso = 'Ainda n\u00e3o consigo ouvir \u00e1udio por aqui \u{1F605} Pode me escrever em poucas palavras o que voc\u00ea precisa? Se preferir falar com uma pessoa, \u00e9 s\u00f3 pedir.'; rotulo = '[O cliente mandou um \u00e1udio]'; }
    else if (msg.video || msg.animation) { aviso = 'Recebi seu v\u00eddeo \u{1F499} Ainda n\u00e3o consigo assisti-lo por aqui. Me conta em uma frase o que voc\u00ea precisa, ou pe\u00e7a para falar com uma pessoa da equipe.'; rotulo = '[O cliente mandou um v\u00eddeo]'; }
    else if (msg.document || msg.sticker || msg.location || msg.poll) { aviso = 'Recebi \u{1F499} Me conta em uma frase o que voc\u00ea precisa que eu te ajudo, ou pe\u00e7a para falar com uma pessoa da equipe.'; rotulo = '[O cliente mandou um arquivo]'; }
    if (msg.photo) { texto = '[O cliente mandou uma foto, sem escrever nada junto]'; }
    else if (aviso) {
      await enviar(aviso);
      await gravar('cliente', rotulo);
      await gravar('serena', aviso);
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

if (!r) { await enviar('Tive um problema t\u00e9cnico agora. Tente de novo em instantes, por favor.'); return [{ json: { ok: false, chat_id: chatId } }]; }
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
