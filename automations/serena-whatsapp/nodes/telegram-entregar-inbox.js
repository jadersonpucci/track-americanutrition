// Node "Entregar do Inbox" do workflow "Serena | Telegram" (n8n GwreSR7VN3bfSqaO).
// Cron de 1 minuto. Chaves reais so no n8n.
const SK = 'SUPABASE_SERVICE_KEY';
const SB = 'https://supabase.americanutrition.com/pg/query';
const BOT = 'http://telegram-bot-api:8081/bot<TOKEN>/';
const self = this;
const req = async (o) => { try { return await self.helpers.httpRequest(o); } catch (e) { return null; } };
async function sql(s) {
  const r = await req({ method: 'POST', url: SB, headers: { apikey: SK, Authorization: 'Bearer ' + SK, 'Content-Type': 'application/json' }, body: { query: s }, json: true, timeout: 30000 });
  return Array.isArray(r) ? r : [];
}
// o que o atendente respondeu pelo Inbox (e qualquer coisa da Serena que nao saiu)
// espera 20s para nao competir com a resposta que o proprio webhook ja mandou
// bcid: contato que chegou pela conta do Samuel (Telegram Business). A resposta tem que sair
// em nome dele tambem, senao a mesma conversa alterna entre a voz do Samuel e a de um bot.
const pend = await sql("select m.id::text as id, m.texto, substr(c.session_site, 4) as chat_id, (select f.valor from serena_fatos f where f.contato_id = c.id and f.chave = 'tg_business') as bcid from serena_mensagens m join serena_contatos c on c.id = m.contato_id where m.entregue is distinct from true and m.canal = 'telegram' and m.papel in ('humano','serena') and nullif(m.texto,'') is not null and m.criado_em > now() - interval '2 days' and m.criado_em < now() - interval '20 seconds' and c.session_site like 'tg-%' order by m.criado_em limit 20");
if (!pend.length) return [{ json: { enviadas: 0 } }];
const ok = [];
for (const p of pend) {
  const texto = String(p.texto || '').replace(/\[\[(ARQUIVO|LISTA):[^\]]*\]\]/gi, '').trim();
  if (!texto) { ok.push(p.id); continue; }
  const corpo = { chat_id: p.chat_id, text: texto, disable_web_page_preview: false };
  if (p.bcid) corpo.business_connection_id = p.bcid;
  const r = await req({ method: 'POST', url: BOT + 'sendMessage', headers: { 'Content-Type': 'application/json' }, body: corpo, json: true, timeout: 30000 });
  if (r && r.ok !== false) ok.push(p.id);
}
if (ok.length) await sql('update serena_mensagens set entregue = true where id in (' + ok.join(',') + ')');
return [{ json: { enviadas: ok.length, pendentes: pend.length } }];
