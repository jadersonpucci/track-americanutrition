// Node "Deduplicação" do workflow "[Serena Social] Comentarios IG FB" (n8n 9KXACZ6PK3Vr7kHZ).
// Chaves reais so no n8n.
// 1) Deduplica por comment_id (static data, 10 min): a Meta as vezes entrega o mesmo evento duas vezes,
//    e a fila do banco pode reenviar o que o webhook acabou de processar.
// 2) Monta o prompt_user com CONTEXTO (13/09/2026): autor, rede, se e anuncio, texto do post e, quando e
//    resposta a outro comentario, o comentario pai (ou a NOSSA resposta anterior). Antes o Claude recebia so
//    o texto cru e respondeu "Oi Dulcemar!" para a Sandra, porque ela citava a Dulcemar no texto.
const d = $input.item.json;
const commentId = d.comment_id;
const agora = Date.now();
const TTL_MS = 10 * 60000;
const st = $getWorkflowStaticData('global');
if (!st.processedComments) st.processedComments = {};
const cache = st.processedComments;
for (const id in cache) { if (agora - cache[id] > TTL_MS) delete cache[id]; }
if (cache[commentId]) { return []; }
cache[commentId] = agora;

const SK = 'SUPABASE_SERVICE_KEY';
const self = this;
const sql = async (q) => { try { const r = await self.helpers.httpRequest({ method: 'POST', url: 'https://supabase.americanutrition.com/pg/query', headers: { apikey: SK, Authorization: 'Bearer ' + SK, 'Content-Type': 'application/json' }, body: { query: q }, json: true, timeout: 10000 }); return Array.isArray(r) ? r : []; } catch (e) { return []; } };
const E = (v) => "'" + String(v == null ? '' : v).replace(/'/g, "''").slice(0, 300) + "'";
const NL = String.fromCharCode(10);

let postTexto = '';
let ehAnuncio = d.is_published === false;
let pai = null;        // comentario pai de outra pessoa
let nossaResposta = null; // o pai e uma resposta NOSSA (thread com a marca)
try {
  if (d.post_id) {
    const p = await sql('select post_texto, bool_or(is_ad) as is_ad from fb_comentarios where post_id = ' + E(d.post_id) + ' group by post_texto order by post_texto nulls last limit 1');
    if (p[0]) { postTexto = String(p[0].post_texto || '').trim(); if (p[0].is_ad === true) ehAnuncio = true; }
  }
  if (d.parent_id) {
    const r = await sql('select autor, texto, resposta, resposta_id from fb_comentarios where comment_id = ' + E(d.parent_id) + ' or resposta_id = ' + E(d.parent_id) + ' limit 1');
    if (r[0]) {
      if (r[0].resposta_id && String(r[0].resposta_id) === String(d.parent_id)) nossaResposta = { original: r[0].texto, autor: r[0].autor, resposta: r[0].resposta };
      else pai = { autor: r[0].autor, texto: r[0].texto };
    }
  }
} catch (e) { /* sem contexto, segue */ }

let ctx = 'Rede: ' + (d.plataforma === 'instagram' ? 'Instagram' : 'Facebook') + (ehAnuncio ? ' (comentario em ANUNCIO pago)' : '') + NL;
ctx += 'Autor do comentario: ' + String(d.from_name || 'usuario') + NL;
if (postTexto) ctx += 'Texto do post/anuncio: "' + postTexto.slice(0, 200) + '"' + NL;
if (nossaResposta) ctx += 'ESTE COMENTARIO E UMA RESPOSTA A UMA RESPOSTA NOSSA. O comentario original de ' + String(nossaResposta.autor || 'alguem') + ' foi: "' + String(nossaResposta.original || '').slice(0, 250) + '". Nossa resposta foi: "' + String(nossaResposta.resposta || '').slice(0, 250) + '". Trate como continuacao da conversa: responda a pergunta nova, sem repetir a saudacao nem o que ja dissemos.' + NL;
else if (pai) ctx += 'Este comentario responde ao comentario de ' + String(pai.autor || 'outra pessoa') + ': "' + String(pai.texto || '').slice(0, 250) + '". Se for conversa entre duas pessoas sem pergunta para a marca, use ignorar; se for pergunta ou afirmacao para a marca, aja normalmente.' + NL;
else if (d.parent_id) ctx += 'Este comentario e uma resposta a outro comentario (nao temos o texto do pai).' + NL;
ctx += 'Se responder, dirija-se a ' + String(d.from_name || 'quem escreveu').split(' ')[0] + ' (o autor), nunca a pessoas citadas no texto.' + NL + NL;
ctx += 'COMENTARIO:' + NL + String(d.message || '');

return [{ json: Object.assign({}, d, { post_texto: postTexto, eh_anuncio: ehAnuncio, prompt_user: ctx }) }];
