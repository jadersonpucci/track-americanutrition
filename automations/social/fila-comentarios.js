// Node "Fila do Banco" do workflow "[Serena Social] Fila e Resumo" (cron 10 min).
// Chaves reais so no n8n.
// Cobertura garantida: todo comentario que os syncs de FB/IG gravaram em fb_comentarios e que a moderacao ainda nao
// tratou (acao nula, ou erro com menos de 3 tentativas) e reenviado ao webhook da moderacao no mesmo formato da
// Meta, com _origem='banco'. Se o webhook da Meta calar (ja aconteceu), nada se perde. Ritmo: ate 10 por rodada,
// 3 s entre eles. Mais velho que 72 h vira 'expirado' (responder uma semana depois faz mais mal que bem).
const SK = 'SUPABASE_SERVICE_KEY';
const MODERACAO = 'https://n8n.americanutrition.com/webhook/america-nutrition-comments';
const PAGE_ID = '608060402386759';
const NOSSOS_IG = ['17841468011211065', '1454097815721941'];
const self = this;
const sql = async (q) => { const r = await self.helpers.httpRequest({ method: 'POST', url: 'https://supabase.americanutrition.com/pg/query', headers: { apikey: SK, Authorization: 'Bearer ' + SK, 'Content-Type': 'application/json' }, body: { query: q }, json: true, timeout: 20000 }); return Array.isArray(r) ? r : []; };
const E = (s) => "'" + String(s == null ? '' : s).replace(/'/g, "''").slice(0, 500) + "'";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const cfg = await sql("select chave, valor from serena_config where chave in ('social_catchup_desde', 'social_fila_ativa')");
const c = {}; cfg.forEach((r) => { c[r.chave] = String(r.valor || ''); });
if ((c.social_fila_ativa || 'on') !== 'on') return [{ json: { ok: true, pulado: 'social_fila_ativa=off' } }];
const desde = c.social_catchup_desde || '2026-09-13T13:00:00Z';

await sql("update fb_comentarios set acao = 'expirado', processado_em = now(), origem_proc = 'fila' where acao is null and data < now() - interval '72 hours' and data >= " + E(desde));
const pend = await sql("select comment_id, post_id, autor, autor_id, texto, data, rede, is_ad, link from fb_comentarios where (acao is null or (acao = 'erro' and tentativas < 3 and processado_em < now() - interval '1 hour')) and data >= " + E(desde) + " and data >= now() - interval '72 hours' and (fila_em is null or fila_em < now() - interval '30 minutes') and coalesce(autor_id,'') not in (" + [PAGE_ID].concat(NOSSOS_IG).map(E).join(',') + ") and autor not ilike '%america nutrition%' and autor not ilike 'americanutrition%' and autor not ilike 'imunofosfo%' and length(coalesce(texto,'')) > 0 order by data asc limit 10");
const enviados = [];
for (const r of pend) {
  const ts = r.data ? Math.floor(new Date(r.data).getTime() / 1000) : Math.floor(Date.now() / 1000);
  let payload;
  if (r.rede === 'instagram') {
    payload = { _origem: 'banco', object: 'instagram', entry: [{ id: NOSSOS_IG[0], time: ts, changes: [{ field: 'comments', value: { id: r.comment_id, media: { id: r.post_id || '' }, from: { id: r.autor_id || '', username: r.autor || 'usuario' }, text: r.texto || '', created_time: ts } }] }] };
  } else {
    payload = { _origem: 'banco', object: 'page', entry: [{ id: PAGE_ID, time: ts, changes: [{ field: 'feed', value: { item: 'comment', verb: 'add', comment_id: r.comment_id, post_id: r.post_id || '', parent_id: r.post_id || '', from: { id: r.autor_id || '', name: r.autor || 'usuario' }, message: r.texto || '', created_time: ts, post: { id: r.post_id || '', is_published: r.is_ad === true ? false : null, permalink_url: r.link || '' } } }] }] };
  }
  await sql('update fb_comentarios set fila_em = now() where comment_id = ' + E(r.comment_id));
  try { await self.helpers.httpRequest({ method: 'POST', url: MODERACAO, json: true, timeout: 15000, headers: { 'Content-Type': 'application/json' }, body: payload }); enviados.push(r.comment_id); } catch (e) { }
  await sleep(3000);
}
return [{ json: { ok: true, pendentes: pend.length, enviados: enviados.length, ids: enviados } }];
