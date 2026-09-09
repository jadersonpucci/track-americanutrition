// Node "Tratar Mensagem" do workflow "Serena | Telegram" (n8n GwreSR7VN3bfSqaO).
// Webhook POST /webhook/serena-telegram, apontado no bot @AmericaNutritionSerena_bot.
// Chaves reais so no n8n.
//
// Dois modos de conversa, no mesmo node:
//  1) BOT: o cliente fala com @AmericaNutritionSerena_bot. Tem /start, botao de compartilhar
//     telefone e teclado inline. Quem fala com o cliente e o bot.
//  2) BUSINESS: a conta do Samuel (Telegram Premium) conectou o bot em Ajustes > Telegram
//     Business > Chatbots. O cliente escreve para o Samuel, a Serena responde DENTRO daquela
//     conversa e a mensagem sai como se o Samuel tivesse escrito. A equipe ve e responde tudo
//     pelo proprio app do Telegram. Aqui os updates chegam como business_message e as respostas
//     precisam levar o business_connection_id.
//     No modo business NAO da para usar teclado (inline nem de resposta): mensagem enviada em
//     nome de uma conta de pessoa nao carrega botao de bot. As opcoes ficam numeradas no texto,
//     que e exatamente o que o Core ja monta quando o canal nao e WhatsApp.
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
const avisarEquipe = async (html) => await req({ method: 'POST', url: BOT_PUB + 'sendMessage', json: true, timeout: 10000, body: { chat_id: TG_GRUPO, message_thread_id: TG_TOPICO, parse_mode: 'HTML', disable_web_page_preview: true, text: html } });

// O Core so devolve o campo lista quando o canal e whatsapp com lista nativa ligada.
// Fora disso ele coloca as opcoes numeradas no proprio texto, fechando com
// "_Responde so com o numero_". No modo bot esse bloco vira teclado inline de verdade.
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

// No modo business nao existe botao de compartilhar telefone: teclado so o bot tem.
// Sem o telefone a Serena nao acha o pedido na Shopify e nenhuma mensagem transacional
// consegue sair por aqui. Entao quando o cliente digita o numero, guardamos.
// O lookbehind de digito e o que evita confundir com CPF, codigo de rastreio ou pedido:
// so casa numero que comeca de verdade, com DDD valido e celular começando em 9
// (ou fixo começando de 2 a 5).
function acharTelefone(t) {
  const m = String(t || '').match(/(?<![0-9])(?:\+?\s*55[\s.-]?)?\(?([1-9][0-9])\)?[\s.-]?(9[0-9]{4}|[2-5][0-9]{3})[\s.-]?([0-9]{4})(?![0-9])/);
  if (!m) return '';
  const d = '55' + m[1] + m[2] + m[3];
  return (d.length === 12 || d.length === 13) ? d : '';
}

const upd = $json.body || $json;

// A conexao com a conta do Samuel chega uma vez, quando ele liga (ou desliga) o bot nos
// ajustes de Telegram Business. Guardar em serena_config deixa o id disponivel para os
// outros workflows e da para a equipe saber na hora se a conexao caiu.
if (upd.business_connection) {
  const bc = upd.business_connection;
  const podeResponder = !!((bc.rights && bc.rights.can_reply) || bc.can_reply);
  const dados = { id: String(bc.id || ''), dono_id: String((bc.user && bc.user.id) || ''), dono: String((bc.user && (bc.user.username || bc.user.first_name)) || ''), ativa: bc.is_enabled !== false, pode_responder: podeResponder };
  await sql("insert into serena_config (chave, valor) values ('tg_business', " + E(JSON.stringify(dados)) + ") on conflict (chave) do update set valor = excluded.valor, atualizado_em = now()");
  const t = dados.ativa
    ? ('\u{1F517} <b>Telegram Business conectado</b>' + NL + 'Conta: ' + (dados.dono || dados.dono_id) + NL + 'Responder em nome dela: ' + (podeResponder ? 'sim' : '<b>NAO</b> - marque a permissao de responder nos ajustes'))
    : ('\u{26A0} <b>Telegram Business desconectado</b>' + NL + 'A Serena parou de responder pela conta ' + (dados.dono || dados.dono_id) + '.');
  await avisarEquipe(t);
  return [{ json: { ok: true, acao: 'business_connection', ativa: dados.ativa, pode_responder: podeResponder } }];
}

const cq = upd.callback_query || null;
const msg = cq ? null : (upd.business_message || upd.message || upd.edited_business_message || upd.edited_message || null);
const chat = cq ? (cq.message && cq.message.chat) : (msg && msg.chat);
if (!chat || !chat.id) return [];
// so conversa privada: em grupo quem cuida e o workflow de moderacao
if (String(chat.type || 'private') !== 'private') return [];
const chatId = String(chat.id);
// Presente so nas conversas da conta conectada. Toda resposta nessas conversas precisa
// levar esse id, senao sai como mensagem do bot em vez de sair como o Samuel.
const bcid = String((cq ? (cq.message && cq.message.business_connection_id) : (msg && msg.business_connection_id)) || '');

// nao processa o mesmo update duas vezes (o Telegram reenvia quando o webhook demora)
const st = $getWorkflowStaticData('global');
const agora = Date.now();
st.vistos = st.vistos || {};
for (const k in st.vistos) { if (agora - st.vistos[k] > 3600000) delete st.vistos[k]; }
const uid = String(upd.update_id || '');
if (uid) { if (st.vistos[uid]) return []; st.vistos[uid] = agora; }

const de = (cq ? cq.from : (msg && msg.from)) || {};
// Numa conversa privada as mensagens do cliente tem from.id igual ao id do chat.
// Se for diferente, quem escreveu foi a propria conta conectada: o Samuel (ou o Jaderson)
// respondendo na mao pelo app. Nao precisa consultar quem e o dono da conexao para saber isso.
const souEu = !!bcid && String(de.id || '') !== chatId;
const sid = 'tg-' + chatId;
const nome = souEu ? '' : String(de.first_name || '').slice(0, 60);

let contatoId = null;
let contatoNovo = false;
const achado = await sql('select id from serena_contatos where session_site = ' + E(sid) + ' limit 1');
if (achado.length && achado[0].id) { contatoId = achado[0].id; }
else {
  const ins = await sql('insert into serena_contatos (session_site, nome) values (' + E(sid) + ', ' + E(nome || null) + ') returning id');
  contatoId = (ins.length && ins[0].id) ? ins[0].id : null;
  contatoNovo = true;
}
if (!contatoId) return [];

const gravar = async (papel, texto, autor) => await sql('insert into serena_mensagens (contato_id, papel, texto, canal, autor, entregue, criado_em) values (' + E(contatoId) + '::uuid, ' + E(papel) + ', ' + E(texto) + ", 'telegram', " + E(autor || null) + ', true, now())');

// Guarda a conexao no contato: e o que permite o Inbox e as mensagens transacionais
// sairem tambem em nome do Samuel, e nao como bot, para quem chegou por essa porta.
if (bcid) await sql("insert into serena_fatos (contato_id, chave, valor, origem) values (" + E(contatoId) + "::uuid, 'tg_business', " + E(bcid) + ", 'sistema') on conflict (contato_id, chave) do update set valor = excluded.valor, atualizado_em = now()");

// A equipe respondeu na mao pelo app: registra no historico e pausa a Serena,
// senao ela responderia por cima da pessoa na mensagem seguinte.
if (souEu) {
  const t = String(msg.text || msg.caption || '').trim();
  if (!t) return [];
  await gravar('humano', t.slice(0, 1200), 'app_telegram');
  await sql('with alvo as (select id from serena_conversas where contato_id = ' + E(contatoId) + '::uuid order by aberta_em desc limit 1), upd as (update serena_conversas set ia_pausada = true where id = (select id from alvo) returning id) insert into serena_conversas (contato_id, canal, ia_pausada) select ' + E(contatoId) + "::uuid, 'telegram', true where not exists (select 1 from alvo)");
  return [{ json: { ok: true, acao: 'humano_no_app', chat_id: chatId } }];
}

// o telefone fica em serena_fatos, nao em serena_contatos: evita conflito com o contato
// que a mesma pessoa ja tem por WhatsApp e ainda assim libera a busca de pedidos na Shopify
let telefone = '';
const ft = await sql("select valor from serena_fatos where contato_id = " + E(contatoId) + "::uuid and chave = 'telefone' limit 1");
if (ft.length && ft[0].valor) telefone = String(ft[0].valor).replace(/[^0-9]/g, '');

// Conversa respondida na mao fica pausada. Sem isso ela ficaria parada para sempre, esperando
// alguem lembrar de resolver no Inbox: depois de tg_pausa_min minutos sem ninguem responder,
// a Serena volta a atender aquele cliente sozinha.
const lim = await sql("select coalesce((select valor from serena_config where chave = 'tg_pausa_min'), '180')::int as min, coalesce((select v.ia_pausada from serena_conversas v where v.contato_id = " + E(contatoId) + "::uuid order by v.aberta_em desc limit 1), false) as pausada, (select round(extract(epoch from (now() - max(m.criado_em))) / 60)::int from serena_mensagens m where m.contato_id = " + E(contatoId) + "::uuid and m.papel = 'humano') as desde_humano");
if (lim.length && lim[0].pausada === true && lim[0].desde_humano !== null && Number(lim[0].desde_humano) > Number(lim[0].min || 180)) {
  await sql('update serena_conversas set ia_pausada = false where contato_id = ' + E(contatoId) + '::uuid');
}

const BOTAO_TEL = { keyboard: [[{ text: '\u{1F4F1} Compartilhar meu telefone', request_contact: true }]], resize_keyboard: true, one_time_keyboard: true };
const enviar = async (texto, extra) => {
  const c = Object.assign({ chat_id: chatId, text: texto, disable_web_page_preview: false }, extra || {});
  // mensagem em nome de uma conta de pessoa nao aceita teclado nenhum
  if (bcid) { c.business_connection_id = bcid; delete c.reply_markup; }
  return await req({ method: 'POST', url: BOT + 'sendMessage', headers: { 'Content-Type': 'application/json' }, body: c, json: true, timeout: 30000 });
};
const tg = async (metodo, corpo) => await req({ method: 'POST', url: BOT + metodo, headers: { 'Content-Type': 'application/json' }, body: (bcid ? Object.assign({ business_connection_id: bcid }, corpo) : corpo), json: true, timeout: 30000 });
// o webhook ja mandou a resposta: marca entregue para o cron de 1 minuto nao mandar de novo
const marcarEntregue = async () => await sql("update serena_mensagens set entregue = true where contato_id = " + E(contatoId) + "::uuid and papel = 'serena' and entregue is distinct from true");
const avisarNova = async () => await avisarEquipe('\u{1F680} <b>Nova conversa no Telegram</b>' + NL + (nome || 'sem nome') + (bcid ? ' (pelo Samuel)' : ' (pelo bot)') + NL + NL + '<a href="' + INBOX + '">Abrir no Inbox</a>');

let texto = '';
if (cq) {
  await req({ method: 'POST', url: BOT + 'answerCallbackQuery', headers: { 'Content-Type': 'application/json' }, body: { callback_query_id: cq.id }, json: true, timeout: 30000 });
  const linha = Number(String(cq.data || '').replace(/[^0-9]/g, ''));
  const kb = (cq.message && cq.message.reply_markup && cq.message.reply_markup.inline_keyboard) || [];
  texto = (kb[linha] && kb[linha][0] && kb[linha][0].text) ? String(kb[linha][0].text) : '';
  if (!texto) return [];
  await tg('editMessageReplyMarkup', { chat_id: chatId, message_id: cq.message.message_id, reply_markup: { inline_keyboard: [] } });
} else if (msg.contact && msg.contact.phone_number) {
  let tel = String(msg.contact.phone_number).replace(/[^0-9]/g, '');
  if (tel.length >= 10 && tel.indexOf('55') !== 0) tel = '55' + tel;
  await sql("insert into serena_fatos (contato_id, chave, valor, origem) values (" + E(contatoId) + "::uuid, 'telefone', " + E(tel) + ", 'cliente') on conflict (contato_id, chave) do update set valor = excluded.valor, atualizado_em = now()");
  const okTel = 'Perfeito, obrigada! \u{1F499} Agora consigo ver seus pedidos e o rastreio por aqui. O que você precisa?';
  await enviar(okTel, { reply_markup: { remove_keyboard: true } });
  await gravar('cliente', '[Compartilhou o telefone: ' + tel + ']');
  await gravar('serena', okTel);
  return [{ json: { ok: true, acao: 'telefone_salvo', chat_id: chatId } }];
} else if (!bcid && msg.text && msg.text.trim().indexOf('/start') === 0) {
  // So existe no modo bot: quem escreve para a conta do Samuel nunca manda /start.
  // Grava a abertura no historico: sem isso quem so da /start e nao escreve mais nada
  // fica invisivel no Inbox, que lista pela ultima mensagem do contato.
  const boasVindas = 'Oi! Sou a Serena, do atendimento da America Nutrition \u{1F499}' + NL + NL
    + 'Posso te ajudar com produtos, preço, frete, pagamento e rastreio do seu pedido.' + NL + NL
    + 'Se quiser, toque no botão abaixo para compartilhar seu telefone: assim eu já acho seus pedidos sem você precisar digitar nada. Ou é só me escrever direto.';
  await enviar(boasVindas, { reply_markup: BOTAO_TEL });
  await gravar('cliente', '[Abriu a conversa no Telegram]');
  await gravar('serena', boasVindas);
  await avisarNova();
  return [{ json: { ok: true, acao: 'start', chat_id: chatId } }];
} else {
  // NUNCA ficar em silencio: midia que eu ainda nao leio vira um pedido de texto,
  // senao o cliente manda um video e nao recebe resposta nenhuma.
  texto = String(msg.text || msg.caption || '').trim();
  if (!texto) {
    let aviso = '';
    let rotulo = '';
    if (msg.voice || msg.audio || msg.video_note) { aviso = 'Ainda não consigo ouvir áudio por aqui \u{1F605} Pode me escrever em poucas palavras o que você precisa? Se preferir falar com uma pessoa, é só pedir.'; rotulo = '[O cliente mandou um áudio]'; }
    else if (msg.video || msg.animation) { aviso = 'Recebi seu vídeo \u{1F499} Ainda não consigo assisti-lo por aqui. Me conta em uma frase o que você precisa, ou peça para falar com uma pessoa da equipe.'; rotulo = '[O cliente mandou um vídeo]'; }
    else if (msg.document || msg.sticker || msg.location || msg.poll) { aviso = 'Recebi \u{1F499} Me conta em uma frase o que você precisa que eu te ajudo, ou peça para falar com uma pessoa da equipe.'; rotulo = '[O cliente mandou um arquivo]'; }
    if (msg.photo) { texto = '[O cliente mandou uma foto, sem escrever nada junto]'; }
    else if (aviso) {
      if (contatoNovo) await avisarNova();
      await enviar(aviso);
      await gravar('cliente', rotulo);
      await gravar('serena', aviso);
      return [{ json: { ok: true, acao: 'midia_sem_texto', chat_id: chatId } }];
    }
    else { return []; }
  }
}
texto = texto.slice(0, 1200);
if (contatoNovo) await avisarNova();
if (!telefone) {
  const achouTel = acharTelefone(texto);
  if (achouTel) {
    telefone = achouTel;
    await sql("insert into serena_fatos (contato_id, chave, valor, origem) values (" + E(contatoId) + "::uuid, 'telefone', " + E(achouTel) + ", 'conversa') on conflict (contato_id, chave) do update set valor = excluded.valor, atualizado_em = now()");
  }
}

await tg('sendChatAction', { chat_id: chatId, action: 'typing' });
const corpo = { canal: 'telegram', contato_id: contatoId, session_site: sid, texto: texto };
if (nome) corpo.nome = nome;
if (telefone.length >= 10) corpo.telefone = telefone;
const r = await req({ method: 'POST', url: CORE, json: true, timeout: 180000, body: corpo });

if (!r) { await enviar('Tive um problema técnico agora. Tente de novo em instantes, por favor.'); return [{ json: { ok: false, chat_id: chatId } }]; }
if (r.pausada === true) { return [{ json: { ok: true, acao: 'pausada', chat_id: chatId } }]; }

let resposta = String(r.resposta || '').replace(/\[\[ARQUIVO:[^\]]*\]\]/gi, '').trim();
let inline = null;
// no modo business as opcoes ficam numeradas no texto: conta de pessoa nao manda botao
const ex = bcid ? null : extrairLista(resposta, r.lista);
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
  await avisarEquipe('\u{1F199} <b>Telegram: cliente pediu atendente</b>' + NL + (nome || 'sem nome') + NL + '<i>' + texto.replace(/[<>&]/g, ' ').slice(0, 180) + '</i>' + NL + NL + '<a href="' + INBOX + '">Abrir no Inbox</a>');
}
return [{ json: { ok: true, chat_id: chatId, business: !!bcid, handoff: !!r.handoff, botoes: inline ? inline.teclado.inline_keyboard.length : 0, entregue: enviou } }];
