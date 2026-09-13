// Node "Resumo do Dia" do workflow "[Serena Social] Fila e Resumo" (cron 20h BRT).
// Chaves reais so no n8n. Conta o que a moderacao fez nas ultimas 24 h (por acao e categoria, FB x IG, webhook x
// fila), lista o que foi ocultado ou marcado para avisar, e manda no Telegram (topico 284, moderacao social).
const SK = 'SUPABASE_SERVICE_KEY';
const TG = 'https://api.telegram.org/bot<TOKEN_SERENA>/sendMessage';
const self = this;
const sql = async (q) => { const r = await self.helpers.httpRequest({ method: 'POST', url: 'https://supabase.americanutrition.com/pg/query', headers: { apikey: SK, Authorization: 'Bearer ' + SK, 'Content-Type': 'application/json' }, body: { query: q }, json: true, timeout: 20000 }); return Array.isArray(r) ? r : []; };
const esc = (t) => String(t == null ? '' : t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const NL = String.fromCharCode(10);
const tot = await sql("select rede, coalesce(acao,'pendente') as acao, count(*)::int as n from fb_comentarios where data > now() - interval '24 hours' and coalesce(autor_id,'') not in ('608060402386759','17841468011211065','1454097815721941') and autor not ilike 'americanutrition%' group by 1,2 order by 1,2");
const cat = await sql("select categoria, count(*)::int as n from fb_comentarios where processado_em > now() - interval '24 hours' and categoria is not null group by 1 order by 2 desc limit 8");
const orig = await sql("select origem_proc, count(*)::int as n from fb_comentarios where processado_em > now() - interval '24 hours' group by 1");
const lista = await sql("select rede, autor, left(texto, 120) as texto, acao, categoria, link from fb_comentarios where processado_em > now() - interval '24 hours' and acao in ('ocultar','avisar','falha_resposta','erro_definitivo') order by processado_em desc limit 8");
const amostra = await sql("select rede, autor, left(texto, 90) as texto, left(resposta, 140) as resposta from fb_comentarios where processado_em > now() - interval '24 hours' and acao = 'responder' order by processado_em desc limit 3");
if (!tot.length) return [{ json: { ok: true, vazio: true } }];
const porRede = {};
tot.forEach((r) => { porRede[r.rede] = porRede[r.rede] || {}; porRede[r.rede][r.acao] = r.n; });
let t = '\u{1F4CA} <b>Comentarios FB/IG, ultimas 24h</b>' + NL;
for (const rede of Object.keys(porRede)) {
  const a = porRede[rede]; const total = Object.values(a).reduce((s, n) => s + n, 0);
  t += NL + '<b>' + esc(rede) + '</b>: ' + total + ' · respondidos ' + (a.responder || 0) + ' · ignorados ' + (a.ignorar || 0) + ' · ocultados ' + (a.ocultar || 0) + ' · avisos ' + (a.avisar || 0) + (a.pendente ? ' · <b>sem tratar ' + a.pendente + '</b>' : '') + ((a.falha_resposta || a.erro || a.erro_definitivo) ? ' · falhas ' + ((a.falha_resposta || 0) + (a.erro || 0) + (a.erro_definitivo || 0)) : '') + (a.expirado ? ' · expirados ' + a.expirado : '');
}
if (cat.length) t += NL + NL + 'Categorias: ' + cat.map((r) => esc(r.categoria) + ' ' + r.n).join(', ');
if (orig.length) t += NL + 'Origem: ' + orig.map((r) => esc(r.origem_proc || '?') + ' ' + r.n).join(', ') + (orig.every((r) => r.origem_proc === 'fila') ? ' ⚠ <b>webhook da Meta sem eventos hoje</b>' : '');
if (lista.length) { t += NL + NL + '<b>Ocultados / avisos / falhas:</b>'; lista.forEach((r) => { t += NL + '• [' + esc(r.rede) + ' · ' + esc(r.acao) + (r.categoria ? '/' + esc(r.categoria) : '') + '] ' + esc(r.autor) + ': ' + esc(r.texto) + (r.link ? ' <a href="' + esc(r.link) + '">ver</a>' : ''); }); }
if (amostra.length) { t += NL + NL + '<b>Amostra de respostas:</b>'; amostra.forEach((r) => { t += NL + '• ' + esc(r.autor) + ': "' + esc(r.texto) + '" → ' + esc(r.resposta); }); }
await self.helpers.httpRequest({ method: 'POST', url: TG, json: true, timeout: 15000, body: { chat_id: '-1003766435449', message_thread_id: 284, parse_mode: 'HTML', disable_web_page_preview: true, text: t.slice(0, 3900) } });
return [{ json: { ok: true, texto: t } }];
