// Node "Log de Auditoria" do workflow "[Serena Social] Comentarios IG FB" (n8n 9KXACZ6PK3Vr7kHZ).
// Chaves reais so no n8n.
// Grava a decisao em fb_comentarios (acao, categoria, resposta, id da resposta, motivo, processado_em, origem).
// Antes so imprimia no console: 30 dias de moderacao sem um numero sequer. Upsert porque o "Gravar Comentario DB"
// roda depois deste no na ordem de execucao e a linha pode ainda nao existir.
const v = $('Validar Resposta').first().json;
const entrada = $input.item.json || {};
const SK = 'SUPABASE_SERVICE_KEY';
const E = (s) => "'" + String(s == null ? '' : s).replace(/'/g, "''").slice(0, 4000) + "'";
let respostaId = '';
try { if (entrada.id && /^\d+_\d+$|^\d+$/.test(String(entrada.id))) respostaId = String(entrada.id); } catch (e) { }
if (!respostaId && v.acao === 'responder') {
  try { const r = $('Responder Facebook').first().json; if (r && r.id) respostaId = String(r.id); } catch (e) { }
  try { if (!respostaId) { const r = $('Responder Instagram').first().json; if (r && r.id) respostaId = String(r.id); } } catch (e) { }
}
// respondeu mas a Graph nao devolveu id: a resposta falhou (token, permissao, comentario apagado)
let acao = v.acao || 'ignorar';
if (acao === 'responder' && !respostaId) acao = 'falha_resposta';
let ct = null;
if (v.timestamp) { ct = (typeof v.timestamp === 'number') ? new Date(v.timestamp * 1000).toISOString() : String(v.timestamp); }
const link = (v.permalink_url && String(v.permalink_url).indexOf('http') === 0) ? v.permalink_url : ('https://www.facebook.com/' + v.comment_id);
const isAdExpr = v.eh_anuncio === true ? 'true' : (v.is_published === true ? 'false' : "(not exists (select 1 from fb_comentarios c2 where c2.post_id=" + E(v.post_id || '') + " and c2.is_ad=false))");
const q = 'insert into fb_comentarios (comment_id, post_id, post_texto, autor, autor_id, texto, data, oculto, likes, link, is_ad, rede, acao, categoria, resposta, resposta_id, motivo, processado_em, origem_proc) values ('
  + E(v.comment_id) + ',' + E(v.post_id || '') + ',' + (v.post_texto ? E(v.post_texto) : 'null') + ',' + E(v.from_name || 'usuario') + ',' + E(v.from_id || '') + ',' + E(v.message || '') + ',' + (ct ? E(ct) + '::timestamptz' : 'now()') + ',false,0,' + E(link) + ',' + isAdExpr + ',' + E(v.plataforma || 'facebook') + ','
  + E(acao) + ',' + E(v.categoria || '') + ',' + (v.resposta ? E(v.resposta) : 'null') + ',' + (respostaId ? E(respostaId) : 'null') + ',' + E(v.motivo || '') + ', now(), ' + E(v.origem || 'webhook') + ')'
  + ' on conflict (comment_id) do update set acao = excluded.acao, categoria = excluded.categoria, resposta = excluded.resposta, resposta_id = coalesce(excluded.resposta_id, fb_comentarios.resposta_id), motivo = excluded.motivo, processado_em = now(), origem_proc = excluded.origem_proc, atualizado_em = now()';
let gravado = true;
try { await this.helpers.httpRequest({ method: 'POST', url: 'https://supabase.americanutrition.com/pg/query', headers: { apikey: SK, Authorization: 'Bearer ' + SK, 'Content-Type': 'application/json' }, body: { query: q }, json: true, timeout: 10000 }); }
catch (e) { gravado = false; }
return [{ json: { sucesso: true, gravado: gravado, comment_id: v.comment_id, plataforma: v.plataforma, acao: acao, categoria: v.categoria, resposta: v.resposta || '', resposta_id: respostaId || null, motivo: v.motivo, origem: v.origem || 'webhook' } }];
