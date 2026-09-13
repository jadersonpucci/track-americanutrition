// Node "Marcar Erro DB" (novo, 13/09/2026) do workflow "[Serena Social] Comentarios IG FB" (n8n 9KXACZ6PK3Vr7kHZ).
// Chaves reais so no n8n. Depois de "Log erro Claude": marca acao='erro' e conta a tentativa, para a fila do
// banco tentar de novo mais tarde (ate 3 vezes) em vez de deixar o comentario sumir.
const v = $('Validar Resposta').first().json;
const SK = 'SUPABASE_SERVICE_KEY';
const E = (s) => "'" + String(s == null ? '' : s).replace(/'/g, "''").slice(0, 500) + "'";
try {
  await this.helpers.httpRequest({ method: 'POST', url: 'https://supabase.americanutrition.com/pg/query', headers: { apikey: SK, Authorization: 'Bearer ' + SK, 'Content-Type': 'application/json' }, json: true, timeout: 10000,
    body: { query: 'insert into fb_comentarios (comment_id, post_id, autor, autor_id, texto, data, oculto, likes, link, is_ad, rede, acao, motivo, processado_em, origem_proc, tentativas) values (' + E(v.comment_id) + ',' + E(v.post_id || '') + ',' + E(v.from_name || 'usuario') + ',' + E(v.from_id || '') + ',' + E(v.message || '') + ', now(), false, 0, ' + E(v.permalink_url || '') + ', ' + (v.eh_anuncio === true ? 'true' : 'false') + ',' + E(v.plataforma || 'facebook') + ", 'erro', " + E(v.motivo || 'erro') + ', now(), ' + E(v.origem || 'webhook') + ', 1) on conflict (comment_id) do update set acao = case when fb_comentarios.tentativas >= 2 then \'erro_definitivo\' else \'erro\' end, motivo = excluded.motivo, processado_em = now(), tentativas = fb_comentarios.tentativas + 1, atualizado_em = now()' } });
} catch (e) { }
return [{ json: { ok: true, comment_id: v.comment_id, acao: 'erro' } }];
