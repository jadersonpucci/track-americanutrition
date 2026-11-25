// Node "Rota do Envio" do workflow "[Serena WhatsApp] Envio Samuel" (n8n EhmndFruX6hOIRDN).
// Chaves reais so no n8n.
//
// Fica entre o "Preparar" e o "E audio?". Antes de mandar pela Evolution, olha se aquele telefone
// ja conversa com a Serena no Telegram: se conversa, a mensagem sai por la e nem toca no WhatsApp.
// Como TUDO o que e transacional passa por este webhook, uma parada aqui cobre de uma vez:
// confirmacao de pedido, pedido pago, objeto encontrado, rastreio proativo, reposicao e follow-up de link.
// Quem nao esta no Telegram continua saindo pelo WhatsApp, sem nenhuma mudanca.
//
// O vinculo telefone -> chat do Telegram so existe para quem tocou em "Compartilhar meu telefone"
// no bot (fica em serena_fatos, chave 'telefone'). Sem isso nao da para saber que o cliente do
// pedido e o mesmo do chat, entao a mensagem continua indo para o WhatsApp.
const p = $input.first().json;
const SK = 'SUPABASE_SERVICE_KEY';
const SB = 'https://supabase.americanutrition.com/pg/query';
const BOT = 'http://telegram-bot-api:8081/bot<TOKEN>/';
const self = this;
const req = async (o) => { try { return await self.helpers.httpRequest(o); } catch (e) { return null; } };
const E = (v) => (v === null || v === undefined || v === '') ? 'null' : ("'" + String(v).replace(/'/g, "''").slice(0, 4000) + "'");
const sql = async (s) => {
  const r = await req({ method: 'POST', url: SB, headers: { apikey: SK, Authorization: 'Bearer ' + SK, 'Content-Type': 'application/json' }, body: { query: s }, json: true, timeout: 20000 });
  return Array.isArray(r) ? r : [];
};
// O autor (ex.: transacional:pedido_pago_confirmado) vem no corpo do webhook e nao passa pelo Preparar.
// Sem ele a mensagem automatica apareceria no Inbox como se a Serena tivesse escrito na hora.
let autor = '';
try { const b = ($('Webhook Enviar').first().json.body) || {}; autor = String(b.autor || '').slice(0, 60); } catch (e) { autor = ''; }
// Chave tolerante ao nono digito: DDD + os 8 ultimos. 5511987654321 e 551187654321 viram a mesma coisa.
const chave = (n) => { const d = String(n || '').replace(/[^0-9]/g, ''); return d.length < 10 ? '' : (d.slice(2, 4) + d.slice(-8)); };
const k = chave(p.number);
let alvo = null;
if (k) {
  const r = await sql("select c.id::text as contato_id, substr(c.session_site, 4) as chat_id, (select f2.valor from serena_fatos f2 where f2.contato_id = c.id and f2.chave = 'tg_business') as bcid from serena_fatos f join serena_contatos c on c.id = f.contato_id where f.chave = 'telefone' and c.session_site like 'tg-%' and (substr(regexp_replace(f.valor, '[^0-9]', '', 'g'), 3, 2) || right(regexp_replace(f.valor, '[^0-9]', '', 'g'), 8)) = " + E(k) + ' order by f.atualizado_em desc nulls last limit 1');
  if (r.length && r[0].chat_id) alvo = r[0];
}
if (!alvo) return [{ json: p }];
// Audio nao existe no Telegram aqui: vai o mesmo texto. O Preparar ja guarda em text o que seria falado.
const texto = String(p.text || '').replace(/\[\[(ARQUIVO|LISTA):[^\]]*\]\]/gi, '').trim();
if (!texto) return [{ json: p }];
// Lista clicavel do WhatsApp vira teclado inline no Telegram: mesma escolha, sem digitar.
const opcoes = (p.lista && Array.isArray(p.lista.opcoes)) ? p.lista.opcoes.slice(0, 10).map((o) => String(o)) : [];
const corpo = { chat_id: alvo.chat_id, text: texto, disable_web_page_preview: false };
// contato que veio pela conta do Samuel: a mensagem sai como ele, e conta de pessoa nao leva botao
if (alvo.bcid) corpo.business_connection_id = alvo.bcid;
if (!alvo.bcid && opcoes.length) corpo.reply_markup = { inline_keyboard: opcoes.map((o, i) => [{ text: o.slice(0, 60), callback_data: 'op:' + i }]) };
const r = await req({ method: 'POST', url: BOT + 'sendMessage', headers: { 'Content-Type': 'application/json' }, body: corpo, json: true, timeout: 30000 });
const ok = !!(r && r.ok !== false && r.result);
// Telegram recusou (bloqueou o bot, chat apagado): cai para o WhatsApp em vez de perder a mensagem.
if (!ok) return [{ json: p }];
// entregue = true de proposito: a mensagem ja saiu, o cron do Inbox nao pode mandar de novo.
await sql('insert into serena_mensagens (contato_id, papel, texto, canal, autor, entregue, criado_em) values (' + E(alvo.contato_id) + "::uuid, 'serena', " + E(texto) + ", 'telegram', " + E(autor || null) + ', true, now())');
return [{ json: { ok: true, tipo: 'telegram', modelo: null, message_id: String((r.result && r.result.message_id) || ''), chat_id: alvo.chat_id, erro: null } }];
